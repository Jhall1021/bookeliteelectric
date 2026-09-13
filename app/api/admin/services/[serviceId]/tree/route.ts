import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

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
 *
 * The response carries `questionIdMap`/`optionIdMap` — every temporary
 * "new-" id the client sent, mapped to the real one it was assigned. The
 * client is expected to write these back into its own state before the next
 * save: without that, a second save of the same session — still holding the
 * ids from the first — would see them as "new-" all over again and create
 * duplicates instead of updating the rows that now already exist.
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

function optionalId(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.trim() !== "");
}

export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const rawQuestions = (body as { questions?: unknown }).questions;
  if (!Array.isArray(rawQuestions)) {
    return NextResponse.json({ error: "Invalid payload: expected a questions array" }, { status: 400 });
  }
  const questions = rawQuestions as IncomingQuestion[];

  return withAdminRoute(async (db) => {
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

    // Question is derived-owned, so the guard constrains it through Service.
    const existing = await db.question.findMany({
      where: { serviceId: params.serviceId },
      select: { id: true, key: true, options: { select: { id: true } } },
    });
    const existingQuestionIds = new Set(existing.map((q) => q.id));
    const existingOptionIds = new Set(existing.flatMap((q) => q.options.map((o) => o.id)));

    // ---- validation -----------------------------------------------------

    const incomingQuestionIds = new Set<string>();
    const incomingOptionIds = new Set<string>();
    const linkedServiceIds = new Set<string>();

    for (const q of questions) {
      if (!q || typeof q !== "object" || Array.isArray(q)) {
        return NextResponse.json({ error: "Every question must be an object" }, { status: 400 });
      }
      if (!q.id || typeof q.id !== "string") {
        return NextResponse.json({ error: "A question is missing its id" }, { status: 400 });
      }
      if (!isNew(q.id) && !existingQuestionIds.has(q.id)) {
        return NextResponse.json({ error: "A question does not belong to this service" }, { status: 400 });
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
      if (q.helpText !== undefined && q.helpText !== null && typeof q.helpText !== "string") {
        return NextResponse.json({ error: `Help text under "${q.prompt}" must be text.` }, { status: 400 });
      }
      if (q.options !== undefined && !Array.isArray(q.options)) {
        return NextResponse.json({ error: `Answers under "${q.prompt}" must be a list.` }, { status: 400 });
      }

      const opts = q.options ?? [];
      if (opts.length === 0) {
        return NextResponse.json(
          { error: `"${q.prompt}" has no answer options — a question with no answers is a dead end.` },
          { status: 400 }
        );
      }

      for (const o of opts) {
        if (!o || typeof o !== "object" || Array.isArray(o)) {
          return NextResponse.json({ error: `An answer under "${q.prompt}" is invalid.` }, { status: 400 });
        }
        if (!o.id || typeof o.id !== "string") {
          return NextResponse.json({ error: "An answer option is missing its id" }, { status: 400 });
        }
        if (!isNew(o.id) && !existingOptionIds.has(o.id)) {
          return NextResponse.json({ error: "An answer option does not belong to this service" }, { status: 400 });
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
        if (o.priceModifierCents !== undefined && !Number.isSafeInteger(o.priceModifierCents)) {
          return NextResponse.json(
            { error: `The price adjustment for "${o.label}" must be a whole number of cents.` },
            { status: 400 }
          );
        }
        if (!optionalId(o.referencedServiceId) || !optionalId(o.rerouteServiceId) || !optionalId(o.nextQuestionId)) {
          return NextResponse.json(
            { error: `A service or question link under "${o.label}" is invalid.` },
            { status: 400 }
          );
        }
        if (o.disclaimer !== undefined && o.disclaimer !== null && typeof o.disclaimer !== "string") {
          return NextResponse.json({ error: `The note under "${o.label}" must be text.` }, { status: 400 });
        }
        if (
          o.requiredPhotoLabels !== undefined &&
          (!Array.isArray(o.requiredPhotoLabels) ||
            !o.requiredPhotoLabels.every((label) => typeof label === "string" && label.trim() !== ""))
        ) {
          return NextResponse.json(
            { error: `Photo requests under "${o.label}" must be non-empty text labels.` },
            { status: 400 }
          );
        }
        if (o.photosBlockBooking !== undefined && typeof o.photosBlockBooking !== "boolean") {
          return NextResponse.json(
            { error: `The photo-review booking rule under "${o.label}" must be true or false.` },
            { status: 400 }
          );
        }

        if (o.referencedServiceId) linkedServiceIds.add(o.referencedServiceId);
        if (o.routeAction === "REROUTE_SERVICE" && o.rerouteServiceId) linkedServiceIds.add(o.rerouteServiceId);

        if (o.routeAction === "CONTINUE") {
          if (!o.nextQuestionId) {
            return NextResponse.json(
              { error: `"${o.label}" continues to another question but none is selected.` },
              { status: 400 }
            );
          }
          if (!incomingQuestionIds.has(o.nextQuestionId) && !questions.some((qq) => qq?.id === o.nextQuestionId)) {
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
    // CONTINUE target. An answer may legitimately point forward to a later question.
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

    // Service links are plain ids rather than foreign keys. Resolve all of
    // them through the guarded client before writing so a stale or foreign id
    // can never become a customer-facing reroute or linked-price reference.
    if (linkedServiceIds.size > 0) {
      const linked = await db.service.findMany({
        where: { id: { in: [...linkedServiceIds] } },
        select: { id: true },
      });
      if (linked.length !== linkedServiceIds.size) {
        return NextResponse.json(
          { error: "One or more linked services are no longer available to this contractor." },
          { status: 400 }
        );
      }
    }

    const questionIdsToDelete = [...existingQuestionIds].filter((id) => !incomingQuestionIds.has(id));
    const optionIdsToDelete = [...existingOptionIds].filter((id) => !incomingOptionIds.has(id));

    // ---- write ----------------------------------------------------------

    const takenKeys = new Set(
      existing.filter((q) => incomingQuestionIds.has(q.id)).map((q) => q.key)
    );

    const questionIdMap: Record<string, string> = {};
    const optionIdMap: Record<string, string> = {};

    try {
      // The guard survives $transaction — tx remains contractor-scoped.
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
            const key = uniqueKey(slugifyKey(q.prompt, `question_${i + 1}`), takenKeys);
            const withNew = await tx.service.update({
              where: { id: params.serviceId },
              data: {
                questions: {
                  create: {
                    key,
                    prompt: q.prompt.trim(),
                    helpText: q.helpText?.trim() || null,
                    inputType: "SINGLE_SELECT",
                    order: i,
                  },
                },
              },
              select: { questions: { where: { key }, select: { id: true } } },
            });
            const created = withNew.questions[0];
            if (!created) {
              throw new Error(`Question "${key}" was created but could not be read back.`);
            }
            idMap.set(q.id, created.id);
            questionIdMap[q.id] = created.id;
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
          const opts = q.options ?? [];

          for (let j = 0; j < opts.length; j++) {
            const o = opts[j];
            const isPhotoReview = o.routeAction === "PHOTO_REVIEW";
            const resolvedNext =
              o.routeAction === "CONTINUE" && o.nextQuestionId
                ? idMap.get(o.nextQuestionId) ?? null
                : null;

            const data = {
              label: o.label.trim(),
              routeAction: o.routeAction as never,
              // A linked option always uses the referenced service's live
              // price, so its own modifier is forced to zero.
              priceModifierCents: o.referencedServiceId ? 0 : o.priceModifierCents ?? 0,
              referencedServiceId: o.referencedServiceId || null,
              rerouteServiceId: o.routeAction === "REROUTE_SERVICE" ? o.rerouteServiceId || null : null,
              nextQuestionId: resolvedNext,
              disclaimer: o.disclaimer?.trim() || null,
              requiredPhotoLabels: (o.requiredPhotoLabels ?? []).map((label) => label.trim()),
              photosBlockBooking: isPhotoReview ? o.photosBlockBooking !== false : true,
              order: j,
            };

            if (isNew(o.id)) {
              await tx.question.update({
                where: { id: realQuestionId },
                data: {
                  options: {
                    create: {
                      ...data,
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

          // Every option now carries its final order, so newly created ids can
          // be matched back to their temporary ids without ambiguity.
          if (opts.some((o) => isNew(o.id))) {
            const rows = await tx.answerOption.findMany({
              where: { questionId: realQuestionId },
              select: { id: true, order: true },
            });
            const byOrder = new Map(rows.map((r) => [r.order, r.id]));
            for (let j = 0; j < opts.length; j++) {
              if (!isNew(opts[j].id)) continue;
              const realId = byOrder.get(j);
              if (!realId) {
                throw new Error(
                  `Answer option under question ${realQuestionId} at position ${j} was created but could not be read back.`
                );
              }
              optionIdMap[opts[j].id] = realId;
            }
          }
        }
      });
    } catch (err) {
      // Database/provider details and internal ids stay in the server log.
      console.error("[tree PATCH] failed for service", params.serviceId, err);
      return NextResponse.json(
        { error: "Could not save the customer-question tree. Nothing was intentionally changed; try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, questionIdMap, optionIdMap });
  });
}
