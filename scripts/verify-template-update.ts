/**
 * A template update is visible, opt-in, structural, and never overwrites the
 * contractor — ADR-014.
 *
 * The half that actually matters. Creating Contractor #2's first price book is
 * straightforward; the architecture is designed for what happens six months
 * later, when the template learns something and the contractor has already
 * customized and priced their tree.
 *
 * SELF-CONTAINED FIXTURE. This used to depend on an `afci_protection` v2
 * DELTA that lived nowhere in the repo except this file's own regex
 * assertions — a fixture nobody published, so the moment the seeded database
 * stopped carrying it by accident, this suite failed for a reason that had
 * nothing to do with the thing it tests. Following the pattern
 * `scripts/verify-template-adoption-baselines.ts` already established: this
 * script publishes its own scratch Electrical v2 DELTA, copied from the REAL
 * v1 `TemplateService` (never hand-built), runs the same detection/adoption
 * machinery every real contractor update goes through, and deletes the
 * scratch `TemplateVersion` afterward — in a `finally`, so a failed assertion
 * never leaves it behind.
 *
 * Requires the target database to begin with exactly one Electrical
 * `TemplateVersion` (v1, kind SNAPSHOT) and no v2 or later. Refuses clearly,
 * rather than colliding, if that is not the state it finds.
 */
import { PrismaClient } from "@prisma/client";
import type { RouteAction } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { withThrowaway, provision } from "./_throwaway";

loadEnv();
const prisma = new PrismaClient();
const PROOF = "__template-proof-contractor__";
const KEY = "new-120v-outlet";
const TRADE = "electrical";

let pass = 0, fail = 0;
const ok = (c: boolean, l: string, d = "") => { c ? pass++ : fail++; console.log(`    ${c ? "ok  " : "FAIL"} ${l}${c ? "" : "\n           " + d}`); };
const run = (...a: string[]) => execFileSync("npx", ["tsx", ...a], { encoding: "utf8", stdio: "pipe" });

async function svcNow() {
  const c = await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF }, select: { id: true } });
  return prisma.service.findFirstOrThrow({
    where: { contractorId: c.id, templateKey: KEY },
    include: { questions: { include: { options: true } } },
  });
}

/** One AnswerOption's comparable identity, sorted/normalized so it never depends on database row order. */
type NormalizedOption = {
  value: string; label: string; routeAction: string; order: number;
  nextQuestionId: string | null; rerouteServiceId: string | null; referencedServiceId: string | null;
  priceModifierCents: number;
  requiredPhotoLabels: string[]; photosBlockBooking: boolean; illustrationUrls: string[];
  numberAtLeast: number | null; numberAtMost: number | null; numberAtLeastExclusive: boolean;
  requiresCapabilityKey: string | null;
  components: { canonicalComponentId: string | null; quantity: number; conditionAnswerKey: string | null; conditionAnswerValue: string | null; quantityAnswerKey: string | null }[];
};
type NormalizedQuestion = {
  key: string; prompt: string; helpText: string | null; inputType: string; order: number;
  numberMin: number | null; numberMax: number | null; numberAllowsDecimal: boolean;
  options: NormalizedOption[];
};
/**
 * Elite's `new-120v-outlet` service, reduced to a deterministic, sorted
 * projection — no raw ids, timestamps or insertion order that could differ
 * between two reads of the SAME unchanged data. This is what actually proves
 * "untouched": not a number someone hardcoded once and never revisited, but
 * this exact shape read again, byte-for-byte, after the whole rehearsal.
 */
type EliteSnapshot = {
  serviceId: string;
  basePrice: number | null;
  whileWeThereBasePrice: number | null;
  publishedPriceApprovedAt: string | null;
  materialCostResolved: boolean;
  templateKey: string | null;
  templateVersionId: string | null;
  questionCount: number;
  optionCount: number;
  questions: NormalizedQuestion[];
};

async function snapshotElite(): Promise<EliteSnapshot> {
  const svc = await prisma.service.findFirstOrThrow({
    where: { slug: KEY, contractor: { slug: "elite-electric" } },
    include: { questions: { include: { options: { include: { components: true } } } } },
  });
  const questions: NormalizedQuestion[] = [...svc.questions]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((q) => ({
      key: q.key, prompt: q.prompt, helpText: q.helpText, inputType: q.inputType, order: q.order,
      numberMin: q.numberMin, numberMax: q.numberMax, numberAllowsDecimal: q.numberAllowsDecimal,
      options: [...q.options]
        .sort((a, b) => a.value.localeCompare(b.value))
        .map((o) => ({
          value: o.value, label: o.label, routeAction: o.routeAction, order: o.order,
          nextQuestionId: o.nextQuestionId, rerouteServiceId: o.rerouteServiceId, referencedServiceId: o.referencedServiceId,
          priceModifierCents: o.priceModifierCents,
          requiredPhotoLabels: [...o.requiredPhotoLabels].sort(), photosBlockBooking: o.photosBlockBooking,
          illustrationUrls: [...o.illustrationUrls].sort(),
          numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost, numberAtLeastExclusive: o.numberAtLeastExclusive,
          requiresCapabilityKey: o.requiresCapabilityKey,
          components: [...o.components]
            .map((c) => ({
              canonicalComponentId: c.canonicalComponentId, quantity: c.quantity,
              conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue,
              quantityAnswerKey: c.quantityAnswerKey,
            }))
            .sort((a, b) => (a.canonicalComponentId ?? "").localeCompare(b.canonicalComponentId ?? "")),
        })),
    }));
  return {
    serviceId: svc.id,
    basePrice: svc.basePrice, whileWeThereBasePrice: svc.whileWeThereBasePrice,
    publishedPriceApprovedAt: svc.publishedPriceApprovedAt ? svc.publishedPriceApprovedAt.toISOString() : null,
    materialCostResolved: svc.materialCostResolved,
    templateKey: svc.templateKey, templateVersionId: svc.templateVersionId,
    questionCount: svc.questions.length,
    optionCount: svc.questions.reduce((n, q) => n + q.options.length, 0),
    questions,
  };
}

/** On mismatch only: names the first question or option that actually differs, rather than dumping the whole tree. */
function firstQuestionDifference(before: NormalizedQuestion[], after: NormalizedQuestion[]): string {
  const beforeByKey = new Map(before.map((q) => [q.key, q]));
  const afterByKey = new Map(after.map((q) => [q.key, q]));
  for (const key of new Set([...beforeByKey.keys(), ...afterByKey.keys()])) {
    const b = beforeByKey.get(key), a = afterByKey.get(key);
    if (!b) return `question "${key}" exists after the rehearsal but did not before`;
    if (!a) return `question "${key}" existed before the rehearsal but is gone after`;
    if (JSON.stringify(b) !== JSON.stringify(a)) return `question "${key}" differs — before=${JSON.stringify(b)} after=${JSON.stringify(a)}`;
  }
  return "(no per-question difference found — check top-level count/order)";
}

/** The scalar shape one `TemplateAnswerOption`'s nested create needs — never id/templateQuestionId, which Prisma sets. */
type OptionCreateInput = {
  value: string; label: string; routeAction: RouteAction; order: number;
  nextQuestionKey?: string | null; rerouteServiceKey?: string | null; referencedServiceKey?: string | null;
  requiredPhotoLabels: string[]; photosBlockBooking: boolean; illustrationUrls: string[];
  requiresCapabilityKey?: string | null;
  numberAtLeast?: number | null; numberAtMost?: number | null; numberAtLeastExclusive?: boolean;
  components: { create: { canonicalComponentId: string; quantity: number; conditionAnswerKey: string | null; conditionAnswerValue: string | null; quantityAnswerKey: string | null }[] };
};

/** Copies a real v1 `TemplateAnswerOption` (with its component bindings) into a nested create input, verbatim. */
function copyOption(o: {
  value: string; label: string; routeAction: RouteAction; order: number;
  nextQuestionKey: string | null; rerouteServiceKey: string | null; referencedServiceKey: string | null;
  requiredPhotoLabels: string[]; photosBlockBooking: boolean; illustrationUrls: string[];
  requiresCapabilityKey: string | null; numberAtLeast: number | null; numberAtMost: number | null; numberAtLeastExclusive: boolean;
  components: { canonicalComponentId: string; quantity: number; conditionAnswerKey: string | null; conditionAnswerValue: string | null; quantityAnswerKey: string | null }[];
}): OptionCreateInput {
  return {
    value: o.value, label: o.label, routeAction: o.routeAction, order: o.order,
    nextQuestionKey: o.nextQuestionKey, rerouteServiceKey: o.rerouteServiceKey, referencedServiceKey: o.referencedServiceKey,
    requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking, illustrationUrls: o.illustrationUrls,
    requiresCapabilityKey: o.requiresCapabilityKey,
    numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost, numberAtLeastExclusive: o.numberAtLeastExclusive,
    components: { create: o.components.map((c) => ({
      canonicalComponentId: c.canonicalComponentId, quantity: c.quantity,
      conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue, quantityAnswerKey: c.quantityAnswerKey,
    })) },
  };
}

/**
 * Publish this verifier's own scratch Electrical v2 DELTA, reproducing only
 * the three structural changes this regression actually tests — read from
 * the REAL v1 `TemplateService` and modified only where named below, never a
 * hand-built fake service definition:
 *
 *   1. NEW QUESTION `afci_protection`, 3 zero-price answer options — the
 *      "new question offered / explicit adoption creates it" proof.
 *   2. `outlet_run_distance` gets a NEW OPTION `over_40`. v1's own scalar
 *      question fields are copied verbatim (it has no pre-existing options
 *      to preserve) so the comparison engine sees an option addition, not an
 *      unrelated whole-question replacement.
 *   3. `below_above_access` gets a REVISED CANONICAL PROMPT, different from
 *      both v1's original and the contractor's own customization below —
 *      the "wording conflict, contractor's edit wins" proof. Its options are
 *      copied verbatim from v1 so nothing about them registers as changed.
 *
 * Refuses outright, before writing anything, unless the target database is
 * exactly the expected clean fixture state: one Electrical TemplateVersion,
 * v1, kind SNAPSHOT. This regression is for the disposable integration
 * database; it must never silently overwrite or collide with a real v2+.
 */
async function publishScratchDelta(): Promise<string> {
  const versions = await prisma.templateVersion.findMany({ where: { trade: TRADE }, orderBy: { version: "asc" } });
  if (versions.length !== 1 || versions[0].version !== 1 || versions[0].kind !== "SNAPSHOT") {
    throw new Error(
      `expected exactly one Electrical TemplateVersion (v1 SNAPSHOT) before publishing this ` +
      `fixture's scratch v2 — found ${versions.length}: ` +
      `${versions.map((v) => `v${v.version} ${v.kind}`).join(", ") || "(none)"}. ` +
      `This regression targets the disposable, v1-only integration fixture database and ` +
      `refuses to run against one that already has a v2 or later.`
    );
  }
  const v1 = versions[0];

  const v1ts = await prisma.templateService.findFirstOrThrow({
    where: { templateVersionId: v1.id, key: KEY },
    include: { questions: { include: { options: { include: { components: true } } } } },
  });
  const outletRunDistance = v1ts.questions.find((q) => q.key === "outlet_run_distance");
  if (!outletRunDistance) throw new Error(`v1's ${KEY} has no outlet_run_distance question to extend — repo shape changed`);
  const belowAboveAccess = v1ts.questions.find((q) => q.key === "below_above_access");
  if (!belowAboveAccess) throw new Error(`v1's ${KEY} has no below_above_access question to revise — repo shape changed`);

  const tv = await prisma.templateVersion.create({
    data: { trade: TRADE, version: 2, kind: "DELTA", notes: "verify-template-update fixture — delete after use" },
  });

  await prisma.templateService.create({
    data: {
      templateVersionId: tv.id, key: v1ts.key, slug: v1ts.slug, name: v1ts.name,
      shortDescription: v1ts.shortDescription, icon: v1ts.icon,
      canonicalCategoryId: v1ts.canonicalCategoryId, bookingType: v1ts.bookingType,
      photoState: v1ts.photoState, isPrimaryEligible: v1ts.isPrimaryEligible,
      requiresTechCount: v1ts.requiresTechCount, pricingMethod: v1ts.pricingMethod,
      questions: {
        create: [
          // 1. New question — structural fixture only, no contractor economics:
          // every option is RESOLVE_INSTANT with no routing links to resolve and
          // no canonical component bindings, so adopting it can never be blocked
          // by an unresolved link and never implies a material cost.
          {
            key: "afci_protection",
            prompt: "Does this circuit need AFCI (arc-fault) protection at the panel?",
            helpText: "Recent code cycles require arc-fault protection for most 120V branch circuits in dwelling units. We'll confirm which applies once we're on site.",
            inputType: "SINGLE_SELECT", order: 19,
            numberMin: null, numberMax: null, numberAllowsDecimal: false,
            options: { create: [
              { value: "afci_breaker", label: "Yes — a dedicated AFCI breaker", routeAction: "RESOLVE_INSTANT", order: 0,
                requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [] },
              { value: "afci_receptacle", label: "Yes — a combination AFCI receptacle", routeAction: "RESOLVE_INSTANT", order: 1,
                requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [] },
              { value: "not_required", label: "Not required for this circuit", routeAction: "RESOLVE_INSTANT", order: 2,
                requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [] },
            ] },
          },
          // 2. outlet_run_distance — v1's own scalar fields copied verbatim (it
          // has zero pre-existing options in v1, so there is nothing else to
          // preserve at the option level); over_40 is the one addition.
          {
            key: outletRunDistance.key, prompt: outletRunDistance.prompt, helpText: outletRunDistance.helpText,
            inputType: outletRunDistance.inputType, order: outletRunDistance.order,
            numberMin: outletRunDistance.numberMin, numberMax: outletRunDistance.numberMax,
            numberAllowsDecimal: outletRunDistance.numberAllowsDecimal,
            options: { create: [
              ...outletRunDistance.options.map(copyOption),
              { value: "over_40", label: "More than 40 feet", routeAction: "PHOTO_REVIEW", order: outletRunDistance.options.length,
                requiredPhotoLabels: ["A wide photo of the planned wire route"], photosBlockBooking: true, illustrationUrls: [] },
            ] },
          },
          // 3. below_above_access — revised canonical wording (differs from both
          // v1's original and the contractor's own customization below); its
          // options are copied verbatim from v1 so only the wording registers
          // as changed.
          {
            key: belowAboveAccess.key,
            prompt: "Can this be reached from a basement, crawlspace, drop ceiling or attic above or below, without opening the wall?",
            helpText: belowAboveAccess.helpText, inputType: belowAboveAccess.inputType, order: belowAboveAccess.order,
            numberMin: belowAboveAccess.numberMin, numberMax: belowAboveAccess.numberMax,
            numberAllowsDecimal: belowAboveAccess.numberAllowsDecimal,
            options: { create: belowAboveAccess.options.map(copyOption) },
          },
        ],
      },
    },
  });

  return tv.id;
}

async function main() {
  console.log("\nTEMPLATE UPDATE CYCLE\n");

  // Captured before anything else is created or published — the only honest
  // way to prove Elite is untouched is to read it before the rehearsal and
  // read it again after, rather than hardcoding what its numbers happened to
  // be on whichever database this file was last edited against.
  const eliteBefore = await snapshotElite();

  let scratchVersionId: string | null = null;
  try {
    await withThrowaway(prisma, PROOF, "Throwaway Proof Electric", async () => {
    // Pinned to v1 ON PURPOSE. Provisioning now installs the CURRENT catalog
    // state — the snapshot with later deltas folded in — so a contractor
    // provisioned today is already up to date and has nothing to adopt. That is
    // correct, and it means the only way to exercise adoption is to stand up the
    // situation it exists for: a contractor who installed before the delta
    // shipped.
    provision(PROOF, ["--service", KEY, "--version", "1"]);

    // This verifier's own scratch v2, published AFTER provisioning — exactly
    // the situation the tool exists for: the update ships after the
    // contractor already installed.
    scratchVersionId = await publishScratchDelta();

    // The contractor edits one question's wording in their own words. This used
    // to arrive by accident, carried on a hand-made fixture nobody maintained —
    // which meant the conflict half of the suite was passing for a reason the
    // suite did not state. Now the edit is part of the scenario: a contractor
    // who has made the tree theirs is the whole premise of the conflict test.
    const c0 = await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF }, select: { id: true } });
    const edited = await prisma.question.updateMany({
      where: { key: "below_above_access", service: { contractorId: c0.id, templateKey: KEY } },
      data: { prompt: "Can we get to it from below or above without cutting drywall?" },
    });
    if (edited.count !== 1) throw new Error(`expected to customize exactly one question, updated ${edited.count}`);

    const base = "scripts/template-update.ts";
    const args = ["--contractor", PROOF, "--service", KEY];

    console.log("  THE CONTRACTOR CAN SEE THE UPDATE");
    const status = run(base, ...args, "--status");
    ok(/newest is v2/.test(status), "it reports a newer version exists");
    ok(/\+ question\s+\[afci_protection\]/.test(status), "the new question is offered");
    ok(/\+ option\s+outlet_run_distance\/over_40/.test(status), "the new answer option is offered");
    ok(/CONFLICT/.test(status), "the wording change they already customized is flagged as a CONFLICT");

    console.log("\n  NOTHING CHANGES BEFORE EXPLICIT ADOPTION");
    const before = await svcNow();
    run(base, ...args, "--status");
    run(base, ...args, "--status");
    const after = await svcNow();
    ok(before.questions.length === after.questions.length, "running --status repeatedly adds no questions");
    ok(before.questions.flatMap(q=>q.options).length === after.questions.flatMap(q=>q.options).length,
       "and no answer options");
    ok(after.questions.find(q=>q.key==="afci_protection") === undefined, "the offered question is still absent");

    console.log("\n  THE CONTRACTOR'S OWN EDIT IS NEVER OVERWRITTEN");
    const mine = after.questions.find((q) => q.key === "below_above_access")!;
    ok(/without cutting drywall/.test(mine.prompt), "their wording is intact before adoption");
    const skipped = run(base, ...args, "--adopt", "below_above_access");
    ok(/SKIPPED/.test(skipped) && /Yours is kept/.test(skipped), "adopting a conflicted change is refused, not merged");
    const stillMine = (await svcNow()).questions.find((q) => q.key === "below_above_access")!;
    ok(stillMine.prompt === mine.prompt, "and their wording is still exactly theirs afterwards",
       `it became "${stillMine.prompt}"`);

    console.log("\n  ADOPTION APPLIES STRUCTURE ONLY");
    // A published price and its approval are one fact now, so the fixture sets
    // both. It used to stamp an approval onto a service with no price, which the
    // database refuses — and which was never a state a real service could be in.
    await prisma.service.update({
      where: { id: after.id },
      data: { basePrice: 25000, publishedPriceApprovedAt: new Date(), materialCostResolved: true },
    });
    run(base, ...args, "--adopt", "afci_protection");
    const adopted = await svcNow();
    const q = adopted.questions.find((x) => x.key === "afci_protection");
    ok(!!q, "the new question now exists on the contractor's service");
    ok(q!.options.length === 3, `with its ${q?.options.length} answer options`);
    ok(q!.options.every((o) => o.priceModifierCents === 0), "no adopted option carries a price modifier");
    ok(q!.templateKey === "afci_protection" && q!.templateVersionId !== null, "the adopted rows record v2 provenance");

    console.log("\n  A NEW STRUCTURAL REQUIREMENT MAKES THE SERVICE UNRESOLVED AGAIN");
    ok(adopted.materialCostResolved === false, "materialCostResolved was reset to false by the adoption");
    ok(adopted.publishedPriceApprovedAt === null, "the approval was cleared");
    ok(adopted.basePrice === null,
       "and the PRICE came down with it — the service stops publishing a number nobody re-approved",
       `basePrice is still ${adopted.basePrice}`);

    console.log("\n  ONE ADOPTION DOES NOT ADOPT THE REST");
    const remaining = run(base, ...args, "--status");
    ok(/over_40/.test(remaining), "the un-adopted option is still merely offered");
    ok(adopted.questions.find((x) => x.key === "outlet_run_distance")!.options.every((o) => o.value !== "over_40"),
       "and is still absent from the contractor's tree");

    console.log("\n  ELITE IS UNTOUCHED BY ANY OF IT");
    // NAMED, not "the other one".
    //
    // This selected whichever contractor with this slug was not the probe, which
    // was unambiguous while Elite was the only real tenant. BrightPath installs
    // the same canonical catalog and so owns the same slug, and an earlier
    // version of this check reported BrightPath's freshly provisioned service
    // as evidence that Elite had been altered.
    //
    // PROVEN AGAINST A CAPTURED BEFORE-STATE, NOT HARDCODED NUMBERS. The old
    // version of this check asserted `questions.length === 7` and
    // `basePrice === 28000` — magic numbers true of whichever database this
    // file was last edited against, and stale the moment a different seed
    // ran. Nothing about this rehearsal (a throwaway contractor, a scratch
    // TemplateVersion, adoptions scoped to that one contractor's service)
    // can legitimately move anything on Elite's own row, so the actual proof
    // is a before/after comparison of a deterministic, normalized
    // projection — captured as `eliteBefore` before the throwaway contractor
    // or the scratch DELTA ever existed.
    const eliteAfter = await snapshotElite();
    ok(eliteAfter.serviceId === eliteBefore.serviceId, "Elite's new-120v-outlet is still the same service row");
    ok(eliteAfter.basePrice === eliteBefore.basePrice, "Elite's published price is unchanged",
       `before ${eliteBefore.basePrice}, after ${eliteAfter.basePrice}`);
    ok(eliteAfter.whileWeThereBasePrice === eliteBefore.whileWeThereBasePrice, "Elite's While We're There price is unchanged");
    ok(eliteAfter.publishedPriceApprovedAt === eliteBefore.publishedPriceApprovedAt, "Elite's price-approval timestamp is unchanged");
    ok(eliteAfter.materialCostResolved === eliteBefore.materialCostResolved, "Elite's material-cost-resolved flag is unchanged");
    // Captured before/after rather than hardcoded — whatever Elite's own
    // provenance genuinely is on this database (a legacy tenant is commonly
    // null; that is data, not something this regression should assert as a
    // universal invariant) is what must survive unchanged, not a guess.
    ok(eliteAfter.templateKey === eliteBefore.templateKey, "Elite's own templateKey is unchanged",
       `before ${JSON.stringify(eliteBefore.templateKey)}, after ${JSON.stringify(eliteAfter.templateKey)}`);
    ok(eliteAfter.templateVersionId === eliteBefore.templateVersionId, "Elite's own templateVersionId is unchanged");
    ok(eliteAfter.questionCount === eliteBefore.questionCount,
       `Elite's question count is unchanged (${eliteBefore.questionCount})`,
       `before ${eliteBefore.questionCount}, after ${eliteAfter.questionCount}`);
    ok(eliteAfter.optionCount === eliteBefore.optionCount,
       `Elite's total option count is unchanged (${eliteBefore.optionCount})`,
       `before ${eliteBefore.optionCount}, after ${eliteAfter.optionCount}`);
    ok(JSON.stringify(eliteAfter.questions) === JSON.stringify(eliteBefore.questions),
       "every one of Elite's questions and options is byte-for-byte unchanged — no addition, removal or rewrite",
       firstQuestionDifference(eliteBefore.questions, eliteAfter.questions));

    });
  } finally {
    // Global row, not scoped to the throwaway contractor — deleted only after
    // withThrowaway's own finally has torn the contractor down, whose Service
    // cascade already removed any TemplateAdoptionReceipt pointing at this
    // scratch version. Runs on every exit path, including a thrown assertion
    // or a run() that exited non-zero.
    if (scratchVersionId) await prisma.templateVersion.delete({ where: { id: scratchVersionId } }).catch(() => {});
    const remaining = await prisma.templateVersion.findMany({ where: { trade: TRADE }, select: { id: true, version: true, kind: true } });
    ok(remaining.length === 1 && remaining[0].version === 1 && remaining[0].kind === "SNAPSHOT",
       `exactly the original v1 SNAPSHOT remains afterward (found ${remaining.length})`,
       JSON.stringify(remaining));
  }

  console.log("\n" + "─".repeat(74));
  console.log(fail === 0 ? `\n  ${pass} checks passed.\n` : `\n  ${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
