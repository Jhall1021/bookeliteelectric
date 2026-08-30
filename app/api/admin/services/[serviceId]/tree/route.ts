import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";


/**
 * Full sync of a service's decision tree: creates, updates and deletes in
 * one transaction.
 *
 * The client sends the complete desired state. Anything currently in the
 * database and absent from that payload is deleted. New rows arrive with a
 * temporary id prefixed "new-" — those are created here and their real cuids
 * substituted into any nextQuestionId that pointed at them.
 *
 * Everything is validated BEFORE the transaction opens. `nextQuestionId` and
 * `rerouteServiceId` are plain strings in the schema with no foreign key, so
 * the database will happily store a reference to a question that no longer
 * exists. The GuidedFlowEngine fails safe on a dangling nextQuestionId by
 * resolving to a price — which means a broken tree doesn't crash, it quotes
 * the wrong number. That's worse than an error, so we refuse to save instead.
 */

const VALID_ROUTE_ACTIONS = new Set([
  "CONTINUE",
  "RESOLVE_INSTANT",
  "RESOLVE_ADJUSTED",
  "REMOTE_QUOTE",
  "REROUTE_SERVICE",
  "REROUTE_TROUBLESHOOTING",
  "PHOTO_REVIEW",
]);

type IncomingOption = {
  id: string;
  label: string;
  routeAction: string;
  priceModifierCents?: number;
  referencedServiceId?: string | null;
  rerouteServiceId?: string | null;
  nextQuestionId?: string | null;
  disclaimer?: string | null;
  requiredPhotoLabels?: string[];
  photosBlockBooking?: boolean;
};

type IncomingQuestion = {
  id: string;
  prompt: string;
  helpText?: string | null;
  options?: IncomingOption[];
};

const isNew = (id: string) => typeof id === "string" && id.startsWith("new-");

/** Stable, URL-safe identifier derived from the admin's own wording. */
function slugifyKey(text: string, fallback: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || fallback;
}

function uniqueKey(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) {
    taken.add(desired);
    return desired;
  }
  let n = 2;
  while (taken.has(`${desired}_${n}`)) n++;
  const result = `${desired}_${n}`;
  taken.add(result);
  return result;
}

export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const questions = (body as { questions?: unknown })?.questions as IncomingQuestion[] | undefined;

  if (!Array.isArray(questions)) {
    return NextResponse.json({ error: "Invalid payload: expected a questions array" }, { status: 400 });
  }

  // GUARD-ADOPTED (ADR-007a). Everything below runs inside one contractor's
  // context on the guarded client — reads, updates, deletes and the
  // transaction alike.

  return withAdminContractor(async (db, ctx) => {
  const contractorId = ctx.contractorId;
  // Scoped by the guard, so a service belonging to another contractor is
  // simply not found. The 404 is correct for that case as well as for a
  // service that does not exist — a cross-tenant probe should not be able to
  // tell the difference.
  const service = await db.service.findUnique({
    where: { id: params.serviceId },
    select: { id: true },
  });
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Question is derived-owned, so the guard adds `service: { contractorId }`
  // and this stays the natural top-level shape.
  const existing = await db.question.findMany({
    where: { serviceId: params.serviceId },
    select: { id: true, key: true, options: { select: { id: true } } },
  });
  const existingQuestionIds = new Set(existing.map((q) => q.id));
  const existingOptionIds = new Set(existing.flatMap((q) => q.options.map((o) => o.id)));

  // ---- validation -------------------------------------------------------

  const incomingQuestionIds = new Set<string>();
  const incomingOptionIds = new Set<string>();

  for (const q of questions) {
    if (!q?.id || typeof q.id !== "string") {
      return NextResponse.json({ error: "A question is missing its id" }, { status: 400 });
    }
    if (!isNew(q.id) && !existingQuestionIds.has(q.id)) {
      return NextResponse.json(
        { error: `Question ${q.id} does not belong to this service` },
        { status: 400 }
      );
    }
    if (incomingQuestionIds.has(q.id)) {
      return NextResponse.json({ error: `Duplicate question id ${q.id}` }, { status: 400 });
    }
    incomingQuestionIds.add(q.id);

    if (typeof q.prompt !== "string" || !q.prompt.trim()) {
      return NextResponse.json(
        { error: "Every question needs a prompt before it can be saved" },
        { status: 400 }
      );
    }

    const opts = q.options ?? [];
    if (opts.length === 0) {
      return NextResponse.json(
        { error: `"${q.prompt}" has no answer options — a question with no answers is a dead end.` },
        { status: 400 }
      );
    }

    for (const o of opts) {
      if (!o?.id || typeof o.id !== "string") {
        return NextResponse.json({ error: "An answer option is missing its id" }, { status: 400 });
      }
      if (!isNew(o.id) && !existingOptionIds.has(o.id)) {
        return NextResponse.json(
          { error: `Answer option ${o.id} does not belong to this service` },
          { status: 400 }
        );
      }
      if (incomingOptionIds.has(o.id)) {
        return NextResponse.json({ error: `Duplicate answer option id ${o.id}` }, { status: 400 });
      }
      incomingOptionIds.add(o.id);

      if (typeof o.label !== "string" || !o.label.trim()) {
        return NextResponse.json(
          { error: `An answer under "${q.prompt}" has no label` },
          { status: 400 }
        );
      }
      if (!VALID_ROUTE_ACTIONS.has(o.routeAction)) {
        return NextResponse.json(
          { error: `"${o.label}" has an unrecognized route action` },
          { status: 400 }
        );
      }
      if (o.routeAction === "CONTINUE") {
        if (!o.nextQuestionId) {
          return NextResponse.json(
            { error: `"${o.label}" continues to another question but none is selected.` },
            { status: 400 }
          );
        }
        if (!incomingQuestionIds.has(o.nextQuestionId) && !questions.some((qq) => qq.id === o.nextQuestionId)) {
          return NextResponse.json(
            {
              error: `"${o.label}" points at a question that no longer exists. Pick a different next question, or keep that question.`,
            },
            { status: 400 }
          );
        }
      }
      if (o.routeAction === "REROUTE_SERVICE" && !o.rerouteServiceId) {
        return NextResponse.json(
          { error: `"${o.label}" reroutes to another service but none is selected.` },
          { status: 400 }
        );
      }
    }
  }

  // Second pass: now that every incoming question id is known, re-check every
  // CONTINUE target. The loop above can only see questions declared so far,
  // and an answer may legitimately point forward to a later question.
  for (const q of questions) {
    for (const o of q.options ?? []) {
      if (o.routeAction === "CONTINUE" && o.nextQuestionId && !incomingQuestionIds.has(o.nextQuestionId)) {
        return NextResponse.json(
          {
            error: `"${o.label}" points at a question that isn't in this tree any more. Restore that question or change where this answer goes.`,
          },
          { status: 400 }
        );
      }
    }
  }

  const questionIdsToDelete = [...existingQuestionIds].filter((id) => !incomingQuestionIds.has(id));
  const optionIdsToDelete = [...existingOptionIds].filter((id) => !incomingOptionIds.has(id));

  // ---- write ------------------------------------------------------------

  const takenKeys = new Set(
    existing.filter((q) => incomingQuestionIds.has(q.id)).map((q) => q.key)
  );

  try {
    // The guard SURVIVES $transaction — tx is scoped, proven in the live
    // harness. So this stays one guarded transaction rather than checking
    // ownership up front and dropping to the unguarded client.
    await db.$transaction(async (tx) => {
      // Options first — a question can't be removed while its options remain.
      if (optionIdsToDelete.length > 0) {
        await tx.answerOption.deleteMany({ where: { id: { in: optionIdsToDelete } } });
      }
      if (questionIdsToDelete.length > 0) {
        await tx.answerOption.deleteMany({ where: { questionId: { in: questionIdsToDelete } } });
        await tx.question.deleteMany({ where: { id: { in: questionIdsToDelete } } });
      }

      // Create questions before any options, so a nextQuestionId pointing at
      // a brand-new question can be resolved to its real cuid below.
      const idMap = new Map<string, string>();

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (isNew(q.id)) {
          // NESTED CREATE THROUGH THE SCOPED PARENT — ADR-010.
          //
          // A direct tx.question.create() would throw DerivedCreateError:
          // Question has no contractorId to stamp, so the guard refuses to
          // invent one. Creating through the Service instead means ownership
          // is structural — the parent is already scoped, so the child cannot
          // land under anyone else.
          //
          // The key is generated unique within this transaction by
          // uniqueKey(), which mutates takenKeys, so selecting the new row
          // back by that key is unambiguous.
          const key = uniqueKey(slugifyKey(q.prompt, `question_${i + 1}`), takenKeys);
          const withNew = await tx.service.update({
            where: { id: params.serviceId },
            data: {
              questions: {
                create: {
                  key,
                  prompt: q.prompt.trim(),
                  helpText: q.helpText?.trim() || null,
                  // Only SINGLE_SELECT is offered in the editor — the other
                  // input types in the schema have no verified renderer in
                  // QuestionStep.
                  inputType: "SINGLE_SELECT",
                  order: i,
                },
              },
            },
            select: { questions: { where: { key }, select: { id: true } } },
          });
          const created = withNew.questions[0];
          if (!created) {
            throw new Error(
              `Question "${key}" was created but could not be read back. ` +
                `Refusing to continue with an unmapped temporary id.`
            );
          }
          idMap.set(q.id, created.id);
        } else {
          idMap.set(q.id, q.id);
          await tx.question.update({
            where: { id: q.id },
            data: {
              prompt: q.prompt.trim(),
              helpText: q.helpText?.trim() || null,
              order: i,
            },
          });
        }
      }

      for (const q of questions) {
        const realQuestionId = idMap.get(q.id)!;

        for (let j = 0; j < (q.options ?? []).length; j++) {
          const o = q.options![j];
          const isPhotoReview = o.routeAction === "PHOTO_REVIEW";
          const resolvedNext =
            o.routeAction === "CONTINUE" && o.nextQuestionId
              ? idMap.get(o.nextQuestionId) ?? null
              : null;

          const data = {
            label: o.label.trim(),
            routeAction: o.routeAction as never,
            // A linked option always uses the referenced service's live
            // price, so its own modifier is forced to zero rather than left
            // as a stale number that nothing reads.
            priceModifierCents: o.referencedServiceId ? 0 : o.priceModifierCents ?? 0,
            referencedServiceId: o.referencedServiceId || null,
            rerouteServiceId: o.routeAction === "REROUTE_SERVICE" ? o.rerouteServiceId || null : null,
            nextQuestionId: resolvedNext,
            disclaimer: o.disclaimer?.trim() || null,
            requiredPhotoLabels: o.requiredPhotoLabels ?? [],
            // Meaningful only on PHOTO_REVIEW; forced back to the safe default
            // elsewhere so a stale false can't lie in wait.
            photosBlockBooking: isPhotoReview ? o.photosBlockBooking !== false : true,
            order: j,
          };

          if (isNew(o.id)) {
            // Nested through the scoped Question, same reason as above.
            // Question is derived-owned, so this update is guarded and the
            // new option inherits ownership structurally.
            await tx.question.update({
              where: { id: realQuestionId },
              data: {
                options: {
                  create: {
                    ...data,
                    // value feeds answersSnapshot; derived from the label once
                    // at creation and never rewritten, so historical answers
                    // keep matching even if the label is later reworded.
                    value: slugifyKey(o.label, `option_${j + 1}`),
                  },
                },
              },
            });
          } else {
            await tx.answerOption.update({
              where: { id: o.id },
              data: { ...data, questionId: realQuestionId },
            });
          }
        }
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    console.error("[tree PATCH] failed for service", params.serviceId, err);
    return NextResponse.json({ error: `Could not save tree: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
  });
}
