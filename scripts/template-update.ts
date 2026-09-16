/**
 * Detecting and adopting a template update — ADR-014.
 *
 * The hard half. Provisioning a new contractor is straightforward; the real
 * question is what happens six months later when the template learns that a
 * scope question should be better, without overwriting what a contractor has
 * already customized or priced.
 *
 *   --status   what changed between what this contractor last accepted and
 *              the newest version. READ ONLY. Nothing is written, ever.
 *   --adopt <templateKey>   apply ONE independently-adoptable change,
 *              explicitly.
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
 * gets.
 *
 * ATOMICITY — THE WRITE, THE RECEIPT, AND THE PRICE-RESET ARE ONE
 * TRANSACTION. Adoption used to write the tree change, then separately
 * clear the service's price/approval stamp in its own statement afterward.
 * A crash between the two left a live tree with new, unpriced structure
 * while the OLD price and approval stamp still stood — a customer could be
 * charged a price that no longer accounts for what the service now asks.
 * Every `--adopt` path below runs its tree write, its adoption receipt
 * (see BOUNDED PER-CHANGE ADOPTION BASELINES below), and the price-reset
 * inside ONE `prisma.$transaction`: either the whole adoption commits, or
 * none of it does.
 *
 * BOUNDED PER-CHANGE ADOPTION BASELINES — B, L, and T.
 *
 * A single, service-wide "provisioned from" pointer cannot tell a genuine
 * contractor customization apart from a template value THIS TOOL ITSELF
 * previously wrote and a later template version corrects — both simply look
 * like "the live value no longer equals what the contractor was originally
 * given." Restoring the SAME correction to a contractor who is a version
 * ahead of that original point (because they already adopted an earlier,
 * since-corrected change) needs a baseline that also advances with THAT
 * adoption — scoped to the one question or option that changed, never to
 * the whole service, since one partial adoption does not mean every other
 * question and option on the service was reviewed against the new version
 * too.
 *
 * Three values decide every comparison below, per independently-adoptable
 * unit (a question's wording; one option's routing/numeric/canonical-
 * component projection):
 *
 *   B  the last canonical projection actually accepted for this unit — a
 *      `TemplateAdoptionReceipt` if one exists, or (for a unit never
 *      individually adopted through this tool) the projection recorded by
 *      whichever version provisioned it, read from `Question`/
 *      `AnswerOption`'s own `templateVersionId`, falling back to the
 *      service's own provisioning version for a row stamped before this
 *      column existed (see NO SILENT PROVENANCE below).
 *   L  the current LIVE projection on this contractor's tree.
 *   T  the intended projection from the composed target template — the
 *      newest version that touches this service.
 *
 *   L == T   already matches. Idempotent: no change is even reported, and
 *            a repeated `--adopt` of an already-current unit writes
 *            nothing — not the tree, not a receipt, not the price reset.
 *   T == B   no upstream change since what was accepted. Nothing is
 *            reported for this unit regardless of L — there is nothing new
 *            to offer, and a contractor's own independent customization (if
 *            L differs from B) is simply theirs; this tool has no
 *            competing template content to weigh it against.
 *   L == B (and T != B)   safe, offered adoption — the live value is
 *            exactly what was last accepted, and the template has moved.
 *   otherwise   CONFLICT. The contractor's live value has drifted from what
 *            was accepted AND the template has moved — this tool cannot
 *            tell whether that drift was deliberate, so it never guesses.
 *            No writes; the contractor's value is kept exactly as-is.
 *
 * This is why a correction that restores the ORIGINAL v1 value after a bad
 * v2 was adopted is still OFFERED, not silently invisible and not a false
 * CONFLICT: B is v2 (what was actually accepted), not v1, so v3 == v1 is a
 * real difference from B and L == B holds (nothing touched the live value
 * since the bad adoption) — case three, offered adoption, exactly as it
 * should be.
 *
 * NO SILENT PROVENANCE. A unit with neither an explicit receipt nor a
 * resolvable row/service-level `templateVersionId` has no honest baseline
 * to compare against, and this tool never invents one from context — in
 * particular, never from "this contractor happens to be the version's own
 * extraction source" the way an earlier draft of this reasoning did. Such a
 * unit is reported as NEEDING A BASELINE and `--adopt` refuses it, rather
 * than silently assuming it is either fine or a conflict. In practice this
 * never fires for a properly provisioned contractor: `lib/
 * templateProvisioning.ts` already stamps every row's own `templateVersionId`
 * at creation, and Elite's one-time, explicit, reviewed provenance backfill
 * (§0.23 of the reconciliation report) stamps the SERVICE-level fallback for
 * a tenant that predates the column — both are deliberate, recorded actions,
 * not inference.
 *
 * STALE ADOPTION TARGET — RECHECKED IMMEDIATELY BEFORE WRITING, NOT ONLY
 * ONCE IN `detect()`, UNDER A LOCK THAT SPANS THE WHOLE GAP.
 * `detect()` runs at the very start of this process and decides B/L/T from
 * a single read; the actual write happens later, after resolving routing
 * links (a round trip per link). A contractor using the live admin UI can
 * edit the SAME question or option in that gap — a real, if narrow, window
 * every time this tool runs, and unrelated to how far apart `--status` and
 * `--adopt` are run as separate invocations, since `detect()` reruns fresh
 * at the start of EACH one. Neither `Question` nor `AnswerOption` carries a
 * `version` column, so there is no optimistic-concurrency counter to
 * condition a write on the way `migrate-guided-flow-session-active-key.ts`
 * conditions its writes on `GuidedFlowSession.version`.
 *
 * `wording-changed` needs no lock: its write is a single, atomic
 * `updateMany` whose own `where` clause requires the live prompt still
 * equal `ch.from` (the accepted baseline this change was computed against)
 * — the check and the write are one Postgres statement, so nothing can move
 * between them.
 *
 * `option-revised` cannot express its whole comparison (which includes a
 * separate table's worth of component rows) as one statement's `where`
 * clause, which is exactly the gap an earlier version of this fix left
 * open: it re-read the option fresh, compared it, and only THEN issued a
 * separate, unconditioned `update()` — a contractor edit landing in the gap
 * between that read and that write would be silently overwritten, because
 * the write itself never re-verified anything. Re-reading inside a
 * transaction does not, by itself, prevent a write from landing after that
 * read; only a lock — or an atomic conditioned write — closes that gap.
 * Fixed with `SELECT ... FOR UPDATE`, taken on the option's own row AND on
 * its existing component rows, as the FIRST thing this transaction does —
 * before the fresh comparison, before either write. From that point until
 * this transaction commits or rolls back, no other transaction can modify
 * either the option's scalar shape or its existing components; the
 * comparison that follows is therefore still true at the moment of the
 * write that follows it, because nothing could have moved in between.
 * Every read the comparison itself performs — resolving the baseline's
 * routing keys back to this contractor's live ids — is also run through
 * this same transaction (`tx`, never the module-level, un-transacted
 * `prisma`), which an earlier version of this fix did not do either: a
 * resolution leaking onto a different connection is not actually inside
 * the transaction's consistency boundary, lock or no lock.
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

/** Any client this file's helpers can run a read through — the module-level client for detect()'s read-only pass, or one `--adopt` transaction's own `tx` so every read the safety check performs shares its consistency boundary. */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Thrown when the live tree no longer matches what `detect()` inspected —
 * a contractor editing the SAME question or option between this process's
 * own `detect()` read and the write further down. Never caught anywhere
 * but the one place that reports it and lets the transaction roll back.
 */
class StaleAdoptionTargetError extends Error {
  constructor(public readonly what: string) { super(`${what} changed since it was inspected`); }
}

type Change =
  | { kind: "question-added"; key: string; prompt: string }
  | { kind: "option-added"; questionKey: string; value: string; label: string }
  | { kind: "option-revised"; questionKey: string; value: string; conflict: boolean; baseline: AdoptedOptionProjection; baselineVersion: number }
  | { kind: "wording-changed"; questionKey: string; from: string; to: string; conflict: boolean; baselineVersion: number }
  | { kind: "baseline-missing"; unitKind: "question" | "option"; unitKey: string };

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

/** The STRUCTURAL subset of a `TemplateOption` this tool tracks and compares — everything `routableShapeEqual` inspects, key-based rather than tied to any one contractor's resolved row ids. This is the exact shape stored as a `TemplateAdoptionReceipt.acceptedProjection`. */
type AdoptedOptionProjection = Pick<TemplateOption,
  "routeAction" | "nextQuestionKey" | "rerouteServiceKey" | "referencedServiceKey" |
  "numberAtLeast" | "numberAtMost" | "numberAtLeastExclusive" | "requiresCapabilityKey" | "components">;
type AdoptedQuestionProjection = { prompt: string };

const projectOption = (o: TemplateOption): AdoptedOptionProjection => ({
  routeAction: o.routeAction, nextQuestionKey: o.nextQuestionKey, rerouteServiceKey: o.rerouteServiceKey,
  referencedServiceKey: o.referencedServiceKey, numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost,
  numberAtLeastExclusive: o.numberAtLeastExclusive, requiresCapabilityKey: o.requiresCapabilityKey,
  components: o.components,
});

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

/**
 * Every field of an option's ROUTABLE SHAPE — everything this tool tracks.
 * Label/order excluded on purpose: cosmetic, not structural.
 *
 * `routeAction` belongs here: it decides whether an answer prices
 * automatically at all (CONTINUE/RESOLVE_*) or forces a human look
 * (REVIEW/REMOTE_QUOTE/REROUTE_TROUBLESHOOTING) — a template changing an
 * option from CONTINUE to a review-triggering action is at least as
 * structural as a changed routing target.
 */
const routableShapeEqual = (a: AdoptedOptionProjection, b: AdoptedOptionProjection): boolean =>
  a.routeAction === b.routeAction &&
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
 *
 * Takes an explicit `db` — the module-level client for detect()'s read-only
 * pass, or an in-flight transaction's `tx` so a safety check run inside a
 * lock stays inside that same lock's consistency boundary.
 */
async function resolveServiceId(db: Db, contractorId: string, key: string): Promise<string | null> {
  const byTemplateKey = await db.service.findFirst({ where: { contractorId, templateKey: key }, select: { id: true } });
  if (byTemplateKey) return byTemplateKey.id;
  const bySlug = await db.service.findFirst({ where: { contractorId, slug: key }, select: { id: true } });
  return bySlug?.id ?? null;
}
async function resolveQuestionId(db: Db, serviceId: string, key: string): Promise<string | null> {
  const q = await db.question.findFirst({ where: { serviceId, templateKey: key }, select: { id: true } });
  if (q) return q.id;
  const byKey = await db.question.findFirst({ where: { serviceId, key }, select: { id: true } });
  return byKey?.id ?? null;
}

/**
 * Resolve one option's routing links against the live tree. Read-only —
 * never writes, never guesses. Any link the template names that does not
 * resolve is collected as a BLOCKING problem, not written as null.
 */
async function resolveOptionLinks(db: Db, contractorId: string, serviceId: string, o: TemplateOption, problems: string[]) {
  const [nextQuestionId, rerouteServiceId, referencedServiceId] = await Promise.all([
    o.nextQuestionKey ? resolveQuestionId(db, serviceId, o.nextQuestionKey) : Promise.resolve(null),
    o.rerouteServiceKey ? resolveServiceId(db, contractorId, o.rerouteServiceKey) : Promise.resolve(null),
    o.referencedServiceKey ? resolveServiceId(db, contractorId, o.referencedServiceKey) : Promise.resolve(null),
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
 * Does the LIVE option match a given key-based projection (a baseline B, or
 * the target T) once ITS routing keys are resolved through this
 * contractor's own live tree? Used for every leg of the B/L/T comparison —
 * L==T, and L==B — never a raw id-to-id comparison, since B/T are recorded
 * in the template's own key space and L is this contractor's resolved ids.
 */
async function liveOptionMatchesFrom(
  db: Db, contractorId: string, serviceId: string, fromOpt: AdoptedOptionProjection,
  live: { routeAction: unknown; nextQuestionId: string | null; rerouteServiceId: string | null; referencedServiceId: string | null;
           numberAtLeast: number | null; numberAtMost: number | null; numberAtLeastExclusive: boolean;
           requiresCapabilityKey: string | null; components: TemplateOption["components"] },
): Promise<boolean> {
  const [fromNextId, fromRerouteId, fromReferencedId] = await Promise.all([
    fromOpt.nextQuestionKey ? resolveQuestionId(db, serviceId, fromOpt.nextQuestionKey) : Promise.resolve(null),
    fromOpt.rerouteServiceKey ? resolveServiceId(db, contractorId, fromOpt.rerouteServiceKey) : Promise.resolve(null),
    fromOpt.referencedServiceKey ? resolveServiceId(db, contractorId, fromOpt.referencedServiceKey) : Promise.resolve(null),
  ]);
  return live.routeAction === fromOpt.routeAction
    && live.nextQuestionId === fromNextId
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
  // newest version. A delta is changes to some services, so "has there been
  // an update to THIS service" is a question about the service, not about
  // the trade's version counter.
  const newest = await prisma.templateService.findFirst({
    where: { key: serviceKey, templateVersion: { trade: from.trade } },
    orderBy: { templateVersion: { version: "desc" } },
    include: { templateVersion: true, questions: { include: TEMPLATE_QUESTION_INCLUDE } },
  });
  if (!newest) return { svc, from, latest: from, newer: null, changes: [] as Change[] };
  const latest = newest.templateVersion;
  if (latest.id === from.id) return { svc, from, latest, newer: null, changes: [] as Change[] };
  const newer = newest;

  // BOUNDED PER-CHANGE ADOPTION BASELINES — see the file docstring. Every
  // unit's baseline B comes from its own TemplateAdoptionReceipt if one
  // exists; otherwise it falls back to whichever version THAT ROW'S OWN
  // templateVersionId names (or the service's, for a row stamped before
  // that column existed), batched here rather than one query per unit.
  const rowVersionIds = new Set<string>([svc.templateVersionId!]);
  for (const q of svc.questions) {
    if (q.templateVersionId) rowVersionIds.add(q.templateVersionId);
    for (const o of q.options) if (o.templateVersionId) rowVersionIds.add(o.templateVersionId);
  }
  const versionContents = await prisma.templateService.findMany({
    where: { templateVersionId: { in: [...rowVersionIds] }, key: serviceKey },
    include: { questions: { include: TEMPLATE_QUESTION_INCLUDE } },
  });
  const contentByVersionId = new Map(versionContents.map((v) => [v.templateVersionId, v]));

  const receiptRows = await prisma.templateAdoptionReceipt.findMany({ where: { serviceId: svc.id }, orderBy: { createdAt: "asc" } });
  const currentReceipt = new Map<string, (typeof receiptRows)[number]>();
  for (const r of receiptRows) currentReceipt.set(`${r.unitKind}:${r.unitKey}`, r); // ascending order -> last write wins -> latest

  const allVersionIds = new Set<string>([...rowVersionIds, ...receiptRows.map((r) => r.sourceTemplateVersionId)]);
  const versionRows = await prisma.templateVersion.findMany({ where: { id: { in: [...allVersionIds] } }, select: { id: true, version: true } });
  const versionNumberOf = new Map(versionRows.map((v) => [v.id, v.version]));

  type Baseline<P> = { projection: P; versionNumber: number };

  function resolveQuestionBaseline(mineQ: { templateVersionId: string | null }, key: string): Baseline<AdoptedQuestionProjection> | null {
    const receipt = currentReceipt.get(`question:${key}`);
    if (receipt) return { projection: receipt.acceptedProjection as unknown as AdoptedQuestionProjection, versionNumber: versionNumberOf.get(receipt.sourceTemplateVersionId) ?? from.version };
    const vid = mineQ.templateVersionId ?? svc.templateVersionId!;
    const content = contentByVersionId.get(vid);
    const tq = content?.questions.find((x) => x.key === key);
    if (!tq) return null;
    return { projection: { prompt: tq.prompt }, versionNumber: versionNumberOf.get(vid) ?? from.version };
  }
  function resolveOptionBaseline(mineOpt: { templateVersionId: string | null }, questionKey: string, value: string): Baseline<AdoptedOptionProjection> | null {
    const receipt = currentReceipt.get(`option:${questionKey}/${value}`);
    if (receipt) return { projection: receipt.acceptedProjection as unknown as AdoptedOptionProjection, versionNumber: versionNumberOf.get(receipt.sourceTemplateVersionId) ?? from.version };
    const vid = mineOpt.templateVersionId ?? svc.templateVersionId!;
    const content = contentByVersionId.get(vid);
    const tq = content?.questions.find((x) => x.key === questionKey);
    const to = (tq?.options as unknown as TemplateOption[] | undefined)?.find((x) => x.value === value);
    if (!to) return null;
    return { projection: projectOption(to), versionNumber: versionNumberOf.get(vid) ?? from.version };
  }

  const changes: Change[] = [];
  for (const q of newer.questions) {
    const mineQ = svc.questions.find((x) => x.key === q.key);
    if (!mineQ) { changes.push({ kind: "question-added", key: q.key, prompt: q.prompt }); continue; }

    const qBaseline = resolveQuestionBaseline(mineQ, q.key);
    if (!qBaseline) {
      changes.push({ kind: "baseline-missing", unitKind: "question", unitKey: q.key });
    } else {
      const T: AdoptedQuestionProjection = { prompt: q.prompt };
      const B = qBaseline.projection;
      const L: AdoptedQuestionProjection = { prompt: mineQ.prompt };
      const leqT = L.prompt === T.prompt;
      const teqB = T.prompt === B.prompt;
      const leqB = L.prompt === B.prompt;
      if (!leqT && !teqB) {
        changes.push({ kind: "wording-changed", questionKey: q.key, from: B.prompt, to: q.prompt, conflict: !leqB, baselineVersion: qBaseline.versionNumber });
      }
    }

    for (const o of q.options as unknown as TemplateOption[]) {
      const mineOpt = mineQ.options.find((x) => x.value === o.value);
      if (!mineOpt) { changes.push({ kind: "option-added", questionKey: q.key, value: o.value, label: o.label }); continue; }

      const oBaseline = resolveOptionBaseline(mineOpt, q.key, o.value);
      if (!oBaseline) {
        changes.push({ kind: "baseline-missing", unitKind: "option", unitKey: `${q.key}/${o.value}` });
        continue;
      }
      const T = projectOption(o);
      const B = oBaseline.projection;
      const liveShape = {
        routeAction: mineOpt.routeAction, nextQuestionId: mineOpt.nextQuestionId, rerouteServiceId: mineOpt.rerouteServiceId,
        referencedServiceId: mineOpt.referencedServiceId, numberAtLeast: mineOpt.numberAtLeast, numberAtMost: mineOpt.numberAtMost,
        numberAtLeastExclusive: mineOpt.numberAtLeastExclusive, requiresCapabilityKey: mineOpt.requiresCapabilityKey,
        components: liveComponents(mineOpt.components),
      };
      const leqT = await liveOptionMatchesFrom(prisma, svc.contractorId, svc.id, T, liveShape);
      const teqB = routableShapeEqual(T, B);
      const leqB = await liveOptionMatchesFrom(prisma, svc.contractorId, svc.id, B, liveShape);
      if (!leqT && !teqB) {
        changes.push({ kind: "option-revised", questionKey: q.key, value: o.value, conflict: !leqB, baseline: B, baselineVersion: oBaseline.versionNumber });
      }
    }
  }
  return { svc, from, latest, newer, changes };
}

async function main() {
  const contractorSlug = arg("contractor")!;
  const serviceKey = arg("service")!;
  const { svc, from, latest, newer, changes } = await detect(contractorSlug, serviceKey);

  console.log(`\nTEMPLATE UPDATE  ${serviceKey}`);
  console.log(`  provisioned from v${from.version}, newest is v${latest.version}\n`);

  if (process.argv.includes("--status")) {
    if (!changes.length) { console.log("  nothing to adopt\n"); await prisma.$disconnect(); return; }
    for (const ch of changes) {
      if (ch.kind === "question-added") console.log(`  + question  [${ch.key}] "${ch.prompt}"`);
      if (ch.kind === "option-added") console.log(`  + option    ${ch.questionKey}/${ch.value} "${ch.label}"`);
      if (ch.kind === "option-revised") console.log(`  ~ option    ${ch.questionKey}/${ch.value}${ch.conflict ? `  CONFLICT — you have already changed this option since it was last adopted from v${ch.baselineVersion}; yours is kept` : "  (routing/numeric/component shape changed)"}`);
      if (ch.kind === "wording-changed") console.log(`  ~ wording   [${ch.questionKey}]${ch.conflict ? `  CONFLICT — you have already changed this since it was last adopted from v${ch.baselineVersion}; yours is kept` : ""}\n      was: "${ch.from}"\n      now: "${ch.to}"`);
      if (ch.kind === "baseline-missing") console.log(`  ! ${ch.unitKind}     ${ch.unitKey}  NEEDS BASELINE — no adoption receipt and no resolvable prior version for this unit; refusing to guess. Establish its baseline explicitly before this tool can compare it.`);
    }
    console.log(`\n  ${changes.length} change(s) available. Nothing has been applied.\n`);
    await prisma.$disconnect(); return;
  }

  const adopt = arg("adopt");
  if (!adopt) { console.error("  --status or --adopt <key>"); process.exit(1); }
  if (!newer) { console.log(`  nothing to adopt\n`); await prisma.$disconnect(); return; }

  /**
   * The price-reset every successful adoption ends with, INSIDE the same
   * transaction as the tree write and the receipt that earns it — see
   * ATOMICITY above.
   */
  const resetPricing = (tx: Prisma.TransactionClient) => tx.service.update({
    where: { id: svc.id },
    data: { materialCostResolved: false, publishedPriceApprovedAt: null, basePrice: null },
  });

  /** The CURRENT receipt id for a unit, read fresh inside the adopting transaction — never assumed from detect()'s earlier, now possibly-stale read. Null for a unit's first-ever adoption. */
  const currentReceiptId = async (tx: Prisma.TransactionClient, unitKind: string, unitKey: string): Promise<string | null> => {
    const r = await tx.templateAdoptionReceipt.findFirst({ where: { serviceId: svc.id, unitKind, unitKey }, orderBy: { createdAt: "desc" }, select: { id: true } });
    return r?.id ?? null;
  };

  let applied = 0;
  for (const ch of changes) {
    if (ch.kind === "baseline-missing") continue; // never has an --adopt id to match
    const id = ch.kind === "question-added" ? ch.key
      : ch.kind === "wording-changed" ? ch.questionKey : `${ch.questionKey}/${ch.value}`;
    if (id !== adopt) continue;

    if ((ch.kind === "wording-changed" || ch.kind === "option-revised") && ch.conflict) {
      console.log(`  SKIPPED [${adopt}] — you have already changed this since it was last adopted from v${ch.baselineVersion}. Yours is kept.\n`);
      await prisma.$disconnect(); return;
    }
    if (ch.kind === "question-added") {
      const tq = newer.questions.find((q) => q.key === ch.key)! as unknown as { key: string; prompt: string; helpText: string | null; inputType: unknown; order: number; numberAllowsDecimal: boolean; numberMin: number | null; numberMax: number | null; options: TemplateOption[] };
      // RESOLVE EVERY OPTION FIRST. If any option's routing links don't
      // resolve, refuse the WHOLE question — never create the question with
      // some options wired and others not.
      const problems: string[] = [];
      const resolved = await Promise.all(tq.options.map((o) => resolveOptionLinks(prisma, svc.contractorId, svc.id, o, problems)));
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
          await tx.templateAdoptionReceipt.create({
            data: { serviceId: svc.id, unitKind: "option", unitKey: `${tq.key}/${o.value}`,
                    acceptedProjection: projectOption(o) as unknown as Prisma.InputJsonValue,
                    sourceTemplateVersionId: latest.id, priorReceiptId: null },
          });
        }
        await tx.templateAdoptionReceipt.create({
          data: { serviceId: svc.id, unitKind: "question", unitKey: tq.key,
                  acceptedProjection: { prompt: tq.prompt } as unknown as Prisma.InputJsonValue,
                  sourceTemplateVersionId: latest.id, priorReceiptId: null },
        });
        await resetPricing(tx); // SAME transaction — see ATOMICITY.
      });
      applied++;
    }
    if (ch.kind === "option-added") {
      const tq = newer.questions.find((q) => q.key === ch.questionKey)!;
      const to = (tq.options as unknown as TemplateOption[]).find((o) => o.value === ch.value)!;
      const mine = await prisma.question.findFirstOrThrow({ where: { serviceId: svc.id, key: ch.questionKey } });
      const problems: string[] = [];
      const { components, ...data } = await resolveOptionLinks(prisma, svc.contractorId, svc.id, to, problems);
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
        await tx.templateAdoptionReceipt.create({
          data: { serviceId: svc.id, unitKind: "option", unitKey: `${ch.questionKey}/${to.value}`,
                  acceptedProjection: projectOption(to) as unknown as Prisma.InputJsonValue,
                  sourceTemplateVersionId: latest.id, priorReceiptId: null },
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
      const { components, ...data } = await resolveOptionLinks(prisma, svc.contractorId, svc.id, to, problems);
      if (problems.length > 0) {
        console.error(`\n  REFUSED: "${adopt}" cannot be adopted — its routing is incomplete on this contractor's live tree:`);
        for (const p of problems) console.error(`    - ${p}`);
        console.error(`\n  Nothing was written. Adopt the missing target(s) first, then retry this change.\n`);
        await prisma.$disconnect(); process.exit(1);
      }
      try {
        await prisma.$transaction(async (tx) => {
          // LOCK FIRST, BEFORE THE FRESH CHECK — see STALE ADOPTION TARGET
          // above. Both the option's own row and its existing component
          // rows: nothing can modify either until this transaction commits
          // or rolls back.
          await tx.$queryRaw`SELECT id FROM answer_options WHERE id = ${mine.id} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM answer_option_components WHERE "answerOptionId" = ${mine.id} FOR UPDATE`;

          // RECHECKED AGAINST THE LIVE TREE, INSIDE THIS LOCK, IMMEDIATELY
          // BEFORE WRITING — against the ACCEPTED BASELINE (`ch.baseline`),
          // not the original provisioning version. Every read this
          // comparison performs runs through `tx`, not the module-level
          // `prisma` — see STALE ADOPTION TARGET above for why an earlier
          // version of this same check did not actually stay inside the
          // transaction it appeared to run in.
          const freshMine = await tx.answerOption.findUniqueOrThrow({ where: { id: mine.id }, include: { components: true } });
          const stillMatchesBaseline = await liveOptionMatchesFrom(tx, svc.contractorId, svc.id, ch.baseline, {
            routeAction: freshMine.routeAction, nextQuestionId: freshMine.nextQuestionId, rerouteServiceId: freshMine.rerouteServiceId,
            referencedServiceId: freshMine.referencedServiceId, numberAtLeast: freshMine.numberAtLeast, numberAtMost: freshMine.numberAtMost,
            numberAtLeastExclusive: freshMine.numberAtLeastExclusive, requiresCapabilityKey: freshMine.requiresCapabilityKey,
            components: liveComponents(freshMine.components),
          });
          if (!stillMatchesBaseline) throw new StaleAdoptionTargetError(`option ${ch.questionKey}/${ch.value}`);

          // CANONICAL COMPONENTS ONLY — scoped to exactly what the check
          // compared, so a contractor's own noncanonical component link
          // survives this write untouched.
          await tx.answerOptionComponent.deleteMany({ where: { answerOptionId: mine.id, canonicalComponentId: { not: null } } });
          await tx.answerOption.update({
            where: { id: mine.id },
            data: {
              routeAction: data.routeAction,
              nextQuestionId: data.nextQuestionId, rerouteServiceId: data.rerouteServiceId, referencedServiceId: data.referencedServiceId,
              numberAtLeast: data.numberAtLeast, numberAtMost: data.numberAtMost, numberAtLeastExclusive: data.numberAtLeastExclusive,
              requiresCapabilityKey: data.requiresCapabilityKey,
              components: { create: components },
              templateVersionId: latest.id, templateKey: `${ch.questionKey}/${ch.value}`,
            },
          });
          const priorReceiptId = await currentReceiptId(tx, "option", `${ch.questionKey}/${ch.value}`);
          await tx.templateAdoptionReceipt.create({
            data: { serviceId: svc.id, unitKind: "option", unitKey: `${ch.questionKey}/${ch.value}`,
                    acceptedProjection: projectOption(to) as unknown as Prisma.InputJsonValue,
                    sourceTemplateVersionId: latest.id, priorReceiptId },
          });
          await resetPricing(tx); // SAME transaction — see ATOMICITY.
        });
      } catch (e) {
        if (e instanceof StaleAdoptionTargetError) {
          console.error(`\n  REFUSED: ${e.what} — a contractor edit landed on it between inspection and this write.\n` +
            `  Nothing was written. Run --status again to see its current state before retrying.\n`);
          await prisma.$disconnect(); process.exit(1);
        }
        throw e;
      }
      applied++;
    }
    if (ch.kind === "wording-changed") {
      try {
        await prisma.$transaction(async (tx) => {
          // GUARDED BY THE EXACT PROMPT `detect()` SAW — the ACCEPTED
          // BASELINE (`ch.from`), not necessarily the original provisioning
          // version's wording. `ch.from` is the same value that made
          // `conflict: false` true; requiring it again here, inside the
          // write's own `where`, means a contractor who edited this exact
          // question's wording between detect()'s read and this write makes
          // the match zero rows rather than silently overwriting their
          // edit. One atomic statement — no separate lock needed, unlike
          // option-revised, since there is no second table involved.
          const result = await tx.question.updateMany({
            where: { serviceId: svc.id, key: ch.questionKey, prompt: ch.from },
            data: { prompt: ch.to, templateVersionId: latest.id, templateKey: ch.questionKey },
          });
          if (result.count !== 1) throw new StaleAdoptionTargetError(`question ${ch.questionKey}`);
          const priorReceiptId = await currentReceiptId(tx, "question", ch.questionKey);
          await tx.templateAdoptionReceipt.create({
            data: { serviceId: svc.id, unitKind: "question", unitKey: ch.questionKey,
                    acceptedProjection: { prompt: ch.to } as unknown as Prisma.InputJsonValue,
                    sourceTemplateVersionId: latest.id, priorReceiptId },
          });
          await resetPricing(tx); // SAME transaction — see ATOMICITY.
        });
      } catch (e) {
        if (e instanceof StaleAdoptionTargetError) {
          console.error(`\n  REFUSED: ${e.what} — a contractor edit landed on it between inspection and this write.\n` +
            `  Nothing was written. Run --status again to see its current state before retrying.\n`);
          await prisma.$disconnect(); process.exit(1);
        }
        throw e;
      }
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
