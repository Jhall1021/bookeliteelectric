/**
 * Detecting and adopting a template update — ADR-014.
 *
 * The hard half. Provisioning a new contractor is straightforward; the real
 * question is what happens six months later when the template learns that a
 * scope question should be better, without overwriting what a contractor has
 * already customized or priced.
 *
 *   --status   what changed between the provisioned version and the newest.
 *              READ ONLY. Nothing is written, ever, by this mode.
 *   --adopt <templateKey>   apply ONE change, explicitly.
 *
 * Adoption may write STRUCTURE only. A newly adopted answer option arrives
 * with no price modifier and marks the service unresolved — the template can
 * say what to ask, never what to charge.
 *
 * Where the contractor has already changed the same thing, the change is
 * reported as a CONFLICT and adoption keeps theirs.
 *
 * ROUTING V2 FIDELITY. A question or option this tool adopts must be a real,
 * routable member of the live tree, not a label with nowhere to go. Carried:
 *
 *   routing links        nextQuestionKey/rerouteServiceKey/referencedServiceKey
 *                         — without these an adopted option CONTINUEs into a
 *                         dead end regardless of what the template says it
 *                         should do next.
 *   numeric constraints   numberMin/numberMax/numberAllowsDecimal on the
 *                         question, numberAtLeast/numberAtMost/
 *                         numberAtLeastExclusive and requiresCapabilityKey
 *                         on the option — Routing V2's numeric routing and
 *                         capability gate are part of the executable
 *                         contract, not presentation, exactly as
 *                         extract-template-service.ts already documents.
 *   component bindings    AnswerOptionComponent rows (canonical component,
 *                         quantity, condition, quantityAnswerKey) — without
 *                         these an adopted option prices nothing and takes
 *                         off no material, however correct its label reads.
 *
 * A routing link resolves against THIS contractor's own live tree at adopt
 * time (by templateKey first, falling back to slug — a tenant that IS a
 * template's own source, like Elite, carries no templateKey at all).
 *
 * A LINK THAT CANNOT BE RESOLVED BLOCKS THE WHOLE ADOPTION, NOT JUST ITS
 * OWN ROW. Every link every question and option in ONE change needs is
 * resolved FIRST, read-only; if anything is missing, NOTHING is written —
 * the whole `--adopt` call refuses, by name, and the live tree is
 * byte-for-byte what it was before the call. This tool applies one change
 * at a time by design, so a multi-question addition may still need
 * adopting in dependency order — but the ordering failure is a clean
 * refusal, not a half-wired tree.
 *
 * EXISTING-OPTION REVISION, NOT JUST ADDITION. A template can change an
 * ALREADY-ADOPTED option's routing, numeric bounds or component bindings —
 * a corrected `nextQuestionKey`, a recalibrated quantity, a component swap
 * — and that revision needs the same detect/adopt path a brand-new option
 * gets. `option-revised` compares the option's full shape (routing keys,
 * numeric bounds, capability gate, component set) between the version this
 * contractor was provisioned from and the newest version, and separately
 * checks whether the LIVE option still matches what the contractor was
 * originally given: if the contractor's live option has already drifted
 * from that original shape in ANY field, the whole revision is a CONFLICT
 * and is refused exactly like a wording conflict — never a partial field
 * update layered over a contractor's own change.
 *
 * ATOMICITY — THE WRITE AND THE PRICE-RESET ARE ONE TRANSACTION. Adoption
 * used to write the tree change, then separately clear the service's price/
 * approval stamp in its own statement afterward. A crash between the two
 * left a live tree with new, unpriced structure while the OLD price and
 * approval stamp still stood — a customer could be charged a price that no
 * longer accounts for what the service now asks. Every `--adopt` path below
 * runs its tree write and the price-reset inside ONE `prisma.$transaction`:
 * either the whole adoption — structure and unresolved-pricing stamp
 * together — commits, or none of it does.
 *
 * STILL NOT CARRIED, NAMED RATHER THAN SILENTLY DROPPED: materials
 * (AnswerOptionMaterial), disclaimers, photo groups, and policy-banded
 * label patterns. None of these were named in this correction; carrying
 * them is real further work on this same tool, left for a later pass.
 */
import { PrismaClient } from "@prisma/client";
import type { Prisma, RouteAction } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

type Change =
  | { kind: "question-added"; key: string; prompt: string }
  | { kind: "option-added"; questionKey: string; value: string; label: string }
  | { kind: "option-revised"; questionKey: string; value: string; conflict: boolean }
  | { kind: "wording-changed"; questionKey: string; from: string; to: string; conflict: boolean };

/** Every field a question/option needs to be a real, routable member of the tree. */
const TEMPLATE_QUESTION_INCLUDE = { options: { include: { components: true } } } as const;

type TemplateOption = {
  value: string; label: string; routeAction: RouteAction; order: number;
  nextQuestionKey: string | null; rerouteServiceKey: string | null; referencedServiceKey: string | null;
  numberAtLeast: number | null; numberAtMost: number | null; numberAtLeastExclusive: boolean;
  requiresCapabilityKey: string | null;
  requiredPhotoLabels: string[]; photosBlockBooking: boolean; illustrationUrls: string[];
  components: { canonicalComponentId: string; quantity: number; conditionAnswerKey: string | null; conditionAnswerValue: string | null; quantityAnswerKey: string | null }[];
};

/** A live AnswerOption's components, narrowed to the shape comparisons need — a row with no canonicalComponentId is a legacy/base link this tool does not compare or write. */
const liveComponents = (cs: { canonicalComponentId: string | null; quantity: number; conditionAnswerKey: string | null; conditionAnswerValue: string | null; quantityAnswerKey: string | null }[]): TemplateOption["components"] =>
  cs.filter((c): c is typeof c & { canonicalComponentId: string } => c.canonicalComponentId !== null)
    .map((c) => ({ canonicalComponentId: c.canonicalComponentId, quantity: c.quantity, conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue, quantityAnswerKey: c.quantityAnswerKey }));

const componentsEqual = (a: TemplateOption["components"], b: TemplateOption["components"]): boolean => {
  const norm = (cs: TemplateOption["components"]) =>
    [...cs].sort((x, y) => x.canonicalComponentId.localeCompare(y.canonicalComponentId))
      .map((c) => JSON.stringify(c));
  const na = norm(a), nb = norm(b);
  return na.length === nb.length && na.every((v, i) => v === nb[i]);
};

/** Every field of an option's ROUTABLE SHAPE — everything option-revised tracks. Label/order excluded on purpose: cosmetic, not structural. */
const routableShapeEqual = (a: TemplateOption, b: TemplateOption): boolean =>
  a.nextQuestionKey === b.nextQuestionKey &&
  a.rerouteServiceKey === b.rerouteServiceKey &&
  a.referencedServiceKey === b.referencedServiceKey &&
  a.numberAtLeast === b.numberAtLeast &&
  a.numberAtMost === b.numberAtMost &&
  a.numberAtLeastExclusive === b.numberAtLeastExclusive &&
  a.requiresCapabilityKey === b.requiresCapabilityKey &&
  componentsEqual(a.components, b.components);

/**
 * Resolve a template routing key to a LIVE id under one contractor's service.
 *
 * Tried by templateKey first — the normal case for a contractor who
 * installed from a template, where the live row's own templateKey records
 * which template concept it came from. Falls back to slug, which is what
 * makes this resolve at all for a tenant that IS a template's own source
 * (Elite carries templateKey: null on services v1 was extracted from,
 * matching its slug 1:1 since nothing has remapped it).
 *
 * A target that resolves to neither is not a bug in this function — it
 * means the target has not been adopted yet. Reported by the caller, never
 * guessed at.
 */
async function resolveServiceId(contractorId: string, key: string): Promise<string | null> {
  const byTemplateKey = await prisma.service.findFirst({ where: { contractorId, templateKey: key }, select: { id: true } });
  if (byTemplateKey) return byTemplateKey.id;
  const bySlug = await prisma.service.findFirst({ where: { contractorId, slug: key }, select: { id: true } });
  return bySlug?.id ?? null;
}
async function resolveQuestionId(serviceId: string, key: string): Promise<string | null> {
  const q = await prisma.question.findFirst({ where: { serviceId, templateKey: key }, select: { id: true } });
  if (q) return q.id;
  const byKey = await prisma.question.findFirst({ where: { serviceId, key }, select: { id: true } });
  return byKey?.id ?? null;
}

/**
 * Resolve one option's routing links against the live tree. Read-only —
 * never writes, never guesses. Any link the template names that does not
 * resolve is collected as a BLOCKING problem, not written as null.
 */
async function resolveOptionLinks(contractorId: string, serviceId: string, o: TemplateOption, problems: string[]) {
  const [nextQuestionId, rerouteServiceId, referencedServiceId] = await Promise.all([
    o.nextQuestionKey ? resolveQuestionId(serviceId, o.nextQuestionKey) : Promise.resolve(null),
    o.rerouteServiceKey ? resolveServiceId(contractorId, o.rerouteServiceKey) : Promise.resolve(null),
    o.referencedServiceKey ? resolveServiceId(contractorId, o.referencedServiceKey) : Promise.resolve(null),
  ]);
  for (const [want, got, label] of [
    [o.nextQuestionKey, nextQuestionId, "nextQuestionKey"],
    [o.rerouteServiceKey, rerouteServiceId, "rerouteServiceKey"],
    [o.referencedServiceKey, referencedServiceId, "referencedServiceKey"],
  ] as const) {
    if (want && !got) problems.push(`${o.value}: ${label} "${want}" does not resolve on this contractor's live tree yet`);
  }
  return {
    value: o.value, label: o.label, routeAction: o.routeAction, order: o.order,
    requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking,
    illustrationUrls: o.illustrationUrls,
    numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost, numberAtLeastExclusive: o.numberAtLeastExclusive,
    requiresCapabilityKey: o.requiresCapabilityKey,
    nextQuestionId, rerouteServiceId, referencedServiceId,
    components: o.components.map((c) => ({
      canonicalComponentId: c.canonicalComponentId, quantity: c.quantity,
      conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue,
      quantityAnswerKey: c.quantityAnswerKey,
    })),
  };
}

/**
 * Does the LIVE option still match what the contractor was ORIGINALLY given
 * (the `from` version's shape)? If every routing/numeric/component field
 * resolves to the same live target the contractor already has, nothing has
 * drifted and the revision is safe to apply. If even one field has already
 * moved — the contractor repointed the reroute, added their own component,
 * whatever — the whole revision is a conflict: this tool has no way to
 * merge a template's intended shape with a contractor's own edit to the
 * same option, so it does neither, exactly like a wording conflict.
 */
async function liveOptionMatchesFrom(
  contractorId: string, serviceId: string, fromOpt: TemplateOption,
  live: { nextQuestionId: string | null; rerouteServiceId: string | null; referencedServiceId: string | null;
           numberAtLeast: number | null; numberAtMost: number | null; numberAtLeastExclusive: boolean;
           requiresCapabilityKey: string | null; components: TemplateOption["components"] },
): Promise<boolean> {
  const [fromNextId, fromRerouteId, fromReferencedId] = await Promise.all([
    fromOpt.nextQuestionKey ? resolveQuestionId(serviceId, fromOpt.nextQuestionKey) : Promise.resolve(null),
    fromOpt.rerouteServiceKey ? resolveServiceId(contractorId, fromOpt.rerouteServiceKey) : Promise.resolve(null),
    fromOpt.referencedServiceKey ? resolveServiceId(contractorId, fromOpt.referencedServiceKey) : Promise.resolve(null),
  ]);
  return live.nextQuestionId === fromNextId
    && live.rerouteServiceId === fromRerouteId
    && live.referencedServiceId === fromReferencedId
    && live.numberAtLeast === fromOpt.numberAtLeast
    && live.numberAtMost === fromOpt.numberAtMost
    && live.numberAtLeastExclusive === fromOpt.numberAtLeastExclusive
    && live.requiresCapabilityKey === fromOpt.requiresCapabilityKey
    && componentsEqual(live.components, fromOpt.components);
}

async function detect(contractorSlug: string, serviceKey: string) {
  const c = await prisma.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
  const svc = await prisma.service.findFirstOrThrow({
    where: { contractorId: c.id, templateKey: serviceKey },
    include: { questions: { include: { options: { include: { components: true } } } } },
  });
  const from = await prisma.templateVersion.findUniqueOrThrow({ where: { id: svc.templateVersionId! } });
  // The newest version that actually CONTAINS this service — not simply the
  // newest version.
  //
  // This used to take the highest version number and then demand the service
  // be in it, which crashed with P2025 for every service a delta does not
  // touch: 74 of Electrical's 75 today. A delta is changes to some services,
  // so "has there been an update to THIS service" is a question about the
  // service, not about the trade's version counter.
  const newest = await prisma.templateService.findFirst({
    where: { key: serviceKey, templateVersion: { trade: from.trade } },
    orderBy: { templateVersion: { version: "desc" } },
    include: { templateVersion: true, questions: { include: TEMPLATE_QUESTION_INCLUDE } },
  });
  if (!newest) return { svc, from, latest: from, changes: [] as Change[] };
  const latest = newest.templateVersion;
  if (latest.id === from.id) return { svc, from, latest, changes: [] as Change[] };

  const newer = newest;
  const older = await prisma.templateService.findFirstOrThrow({
    where: { templateVersionId: from.id, key: serviceKey },
    include: { questions: { include: TEMPLATE_QUESTION_INCLUDE } },
  });

  const changes: Change[] = [];
  for (const q of newer.questions) {
    const was = older.questions.find((x) => x.key === q.key);
    if (!was) { changes.push({ kind: "question-added", key: q.key, prompt: q.prompt }); continue; }
    if (was.prompt !== q.prompt) {
      // Has the contractor already edited this wording themselves? If so the
      // update is a conflict, not an improvement to apply over the top.
      const mine = svc.questions.find((x) => x.key === q.key);
      changes.push({ kind: "wording-changed", questionKey: q.key, from: was.prompt, to: q.prompt,
                     conflict: !!mine && mine.prompt !== was.prompt });
    }
    for (const o of q.options as unknown as TemplateOption[]) {
      const wasOpt = (was.options as unknown as TemplateOption[]).find((x) => x.value === o.value);
      if (!wasOpt) { changes.push({ kind: "option-added", questionKey: q.key, value: o.value, label: o.label }); continue; }
      if (routableShapeEqual(wasOpt, o)) continue; // unchanged since this contractor's from-version

      // The template revised this option. Is the contractor's LIVE copy
      // still where `from` left it, or have they already customized it?
      const mineQ = svc.questions.find((x) => x.key === q.key);
      const mineOpt = mineQ?.options.find((x) => x.value === o.value);
      let conflict = true; // fail closed: no live row to compare against reads as "don't touch it"
      if (mineOpt) {
        conflict = !(await liveOptionMatchesFrom(svc.contractorId, svc.id, wasOpt, {
          nextQuestionId: mineOpt.nextQuestionId, rerouteServiceId: mineOpt.rerouteServiceId, referencedServiceId: mineOpt.referencedServiceId,
          numberAtLeast: mineOpt.numberAtLeast, numberAtMost: mineOpt.numberAtMost, numberAtLeastExclusive: mineOpt.numberAtLeastExclusive,
          requiresCapabilityKey: mineOpt.requiresCapabilityKey, components: liveComponents(mineOpt.components),
        }));
      }
      changes.push({ kind: "option-revised", questionKey: q.key, value: o.value, conflict });
    }
  }
  return { svc, from, latest, older, newer, changes };
}

async function main() {
  const contractorSlug = arg("contractor")!;
  const serviceKey = arg("service")!;
  const { svc, from, latest, older, newer, changes } = await detect(contractorSlug, serviceKey);

  console.log(`\nTEMPLATE UPDATE  ${serviceKey}`);
  console.log(`  provisioned from v${from.version}, newest is v${latest.version}\n`);

  if (process.argv.includes("--status")) {
    if (!changes.length) { console.log("  nothing to adopt\n"); await prisma.$disconnect(); return; }
    for (const ch of changes) {
      if (ch.kind === "question-added") console.log(`  + question  [${ch.key}] "${ch.prompt}"`);
      if (ch.kind === "option-added") console.log(`  + option    ${ch.questionKey}/${ch.value} "${ch.label}"`);
      if (ch.kind === "option-revised") console.log(`  ~ option    ${ch.questionKey}/${ch.value}${ch.conflict ? "  CONFLICT — you have already changed this option; yours is kept" : "  (routing/numeric/component shape changed)"}`);
      if (ch.kind === "wording-changed") console.log(`  ~ wording   [${ch.questionKey}]${ch.conflict ? "  CONFLICT — you have already changed this; yours is kept" : ""}\n      was: "${ch.from}"\n      now: "${ch.to}"`);
    }
    console.log(`\n  ${changes.length} change(s) available. Nothing has been applied.\n`);
    await prisma.$disconnect(); return;
  }

  const adopt = arg("adopt");
  if (!adopt) { console.error("  --status or --adopt <key>"); process.exit(1); }
  if (!newer || !older) { console.log(`  nothing to adopt\n`); await prisma.$disconnect(); return; }

  /**
   * The price-reset every successful adoption ends with, INSIDE the same
   * transaction as the tree write that earns it — see ATOMICITY above.
   */
  const resetPricing = (tx: Prisma.TransactionClient) => tx.service.update({
    where: { id: svc.id },
    data: { materialCostResolved: false, publishedPriceApprovedAt: null, basePrice: null },
  });

  let applied = 0;
  for (const ch of changes) {
    const id = ch.kind === "question-added" ? ch.key
      : ch.kind === "wording-changed" ? ch.questionKey : `${ch.questionKey}/${ch.value}`;
    if (id !== adopt) continue;

    if ((ch.kind === "wording-changed" || ch.kind === "option-revised") && ch.conflict) {
      console.log(`  SKIPPED [${adopt}] — you have already changed this. Yours is kept.\n`);
      await prisma.$disconnect(); return;
    }
    if (ch.kind === "question-added") {
      const tq = newer.questions.find((q) => q.key === ch.key)! as unknown as { key: string; prompt: string; helpText: string | null; inputType: unknown; order: number; numberAllowsDecimal: boolean; numberMin: number | null; numberMax: number | null; options: TemplateOption[] };
      // RESOLVE EVERY OPTION FIRST. If any option's routing links don't
      // resolve, refuse the WHOLE question — never create the question with
      // some options wired and others not.
      const problems: string[] = [];
      const resolved = await Promise.all(tq.options.map((o) => resolveOptionLinks(svc.contractorId, svc.id, o, problems)));
      if (problems.length > 0) {
        console.error(`\n  REFUSED: "${adopt}" cannot be adopted — its own routing is incomplete on this contractor's live tree:`);
        for (const p of problems) console.error(`    - ${p}`);
        console.error(`\n  Nothing was written. Adopt the missing target(s) first, then retry this change.\n`);
        await prisma.$disconnect(); process.exit(1);
      }
      await prisma.$transaction(async (tx) => {
        const q = await tx.question.create({
          data: { serviceId: svc.id, key: tq.key, prompt: tq.prompt, helpText: tq.helpText,
                  inputType: tq.inputType as never, order: tq.order,
                  numberAllowsDecimal: tq.numberAllowsDecimal, numberMin: tq.numberMin, numberMax: tq.numberMax,
                  templateVersionId: latest.id, templateKey: tq.key },
        });
        for (const [i, o] of tq.options.entries()) {
          const { components, ...data } = resolved[i];
          await tx.answerOption.create({
            data: { ...data, questionId: q.id,
                    components: { create: components },
                    // No price modifier. Structure only.
                    templateVersionId: latest.id, templateKey: `${tq.key}/${o.value}` },
          });
        }
        await resetPricing(tx); // SAME transaction — see ATOMICITY.
      });
      applied++;
    }
    if (ch.kind === "option-added") {
      const tq = newer.questions.find((q) => q.key === ch.questionKey)!;
      const to = (tq.options as unknown as TemplateOption[]).find((o) => o.value === ch.value)!;
      const mine = await prisma.question.findFirstOrThrow({ where: { serviceId: svc.id, key: ch.questionKey } });
      const problems: string[] = [];
      const { components, ...data } = await resolveOptionLinks(svc.contractorId, svc.id, to, problems);
      if (problems.length > 0) {
        console.error(`\n  REFUSED: "${adopt}" cannot be adopted — its routing is incomplete on this contractor's live tree:`);
        for (const p of problems) console.error(`    - ${p}`);
        console.error(`\n  Nothing was written. Adopt the missing target(s) first, then retry this change.\n`);
        await prisma.$disconnect(); process.exit(1);
      }
      await prisma.$transaction(async (tx) => {
        await tx.answerOption.create({
          data: { ...data, questionId: mine.id,
                  components: { create: components },
                  templateVersionId: latest.id, templateKey: `${ch.questionKey}/${to.value}` },
        });
        await resetPricing(tx); // SAME transaction — see ATOMICITY.
      });
      applied++;
    }
    if (ch.kind === "option-revised") {
      const tq = newer.questions.find((q) => q.key === ch.questionKey)!;
      const to = (tq.options as unknown as TemplateOption[]).find((o) => o.value === ch.value)!;
      const mineQ = await prisma.question.findFirstOrThrow({ where: { serviceId: svc.id, key: ch.questionKey } });
      const mine = await prisma.answerOption.findFirstOrThrow({ where: { questionId: mineQ.id, value: ch.value } });
      const problems: string[] = [];
      const { components, ...data } = await resolveOptionLinks(svc.contractorId, svc.id, to, problems);
      if (problems.length > 0) {
        console.error(`\n  REFUSED: "${adopt}" cannot be adopted — its routing is incomplete on this contractor's live tree:`);
        for (const p of problems) console.error(`    - ${p}`);
        console.error(`\n  Nothing was written. Adopt the missing target(s) first, then retry this change.\n`);
        await prisma.$disconnect(); process.exit(1);
      }
      await prisma.$transaction(async (tx) => {
        await tx.answerOptionComponent.deleteMany({ where: { answerOptionId: mine.id } });
        await tx.answerOption.update({
          where: { id: mine.id },
          data: {
            nextQuestionId: data.nextQuestionId, rerouteServiceId: data.rerouteServiceId, referencedServiceId: data.referencedServiceId,
            numberAtLeast: data.numberAtLeast, numberAtMost: data.numberAtMost, numberAtLeastExclusive: data.numberAtLeastExclusive,
            requiresCapabilityKey: data.requiresCapabilityKey,
            components: { create: components },
          },
        });
        await resetPricing(tx); // SAME transaction — see ATOMICITY.
      });
      applied++;
    }
    if (ch.kind === "wording-changed") {
      await prisma.$transaction(async (tx) => {
        await tx.question.updateMany({ where: { serviceId: svc.id, key: ch.questionKey }, data: { prompt: ch.to } });
        await resetPricing(tx); // SAME transaction — see ATOMICITY.
      });
      applied++;
    }
  }

  if (!applied) { console.log(`  no change matched "${adopt}"\n`); await prisma.$disconnect(); return; }

  // THE PRICE COMES DOWN WITH THE APPROVAL, IN THE SAME COMMIT AS THE
  // STRUCTURE THAT NEEDS IT PRICED. See ATOMICITY above — this is no longer
  // a separate statement after the write; every branch above already
  // included it in its own transaction.
  console.log(`  adopted "${adopt}" — structure only. The service is unresolved again ` +
              `until you price what it added.\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
