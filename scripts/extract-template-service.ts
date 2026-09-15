/**
 * Extract ONE Elite service into the electrical template — ADR-014.
 *
 * Not a relabeling. Elite's rows carry electrical knowledge AND Elite's
 * business decisions in the same columns, so this walks the tree field by
 * field and emits only the structure.
 *
 * THE CLASSIFICATION, MADE EXECUTABLE
 *
 *   canonical trade knowledge   service concept, the questions needed to
 *                               determine scope, the physical consequence of
 *                               an answer, canonical material/component
 *                               identity, universal photo and safety needs
 *   contractor policy           thresholds, included quantities and distances,
 *                               what the contractor accepts or refuses,
 *                               customer-facing wording that states company
 *                               policy, permit and scope decisions
 *   contractor economics        price modifiers, published prices, labor
 *                               rate and hours, material cost, markups,
 *                               monetary allowances
 *
 * Economics never enter the template. Policy is stripped where it is a VALUE
 * and kept where it is a QUESTION: "how far is the run" is the trade's, "25 ft
 * is included" is Elite's.
 *
 * WHAT THE FIRST RUN FOUND
 *
 * Economics were not confined to economic columns. Two answer LABELS carried
 * Elite's prices ("From the nearest outlet — from $280"), and sixteen answer
 * texts across the catalog name Elite by name. A copy that trusted field
 * types would have shipped both to every future contractor.
 *
 *   --contractor <slug> whose copy to extract from — REQUIRED, no default
 *   --service <slug>   which service to extract
 *   --version <n>      template version to write into — MUST NOT already
 *                      exist; see OVERWRITE REFUSAL below.
 *   --apply            write; otherwise report only
 *
 * OVERWRITE REFUSAL — a published version is immutable, unconditionally.
 *
 * `templateVersionSource` resolves whatever the latest SNAPSHOT-plus-DELTAs
 * says the instant a version is written — there is no staging step, proven
 * in this branch's own rehearsal (§0.22). A version, once it exists, is
 * frozen: this tool refuses to write into ANY version that already exists,
 * full stop — not "the same service key already there," not "unless a flag
 * says otherwise." Adding a second service to an existing version is still
 * changing what that version publishes after the fact, and a flag that
 * could bypass the refusal is a flag that WILL be reached for under
 * schedule pressure, which is exactly the failure this refusal exists to
 * make impossible rather than merely inconvenient. There is no
 * override — matching the insert-only convention this codebase already
 * applies to `MaterialBaselineVersion` for the identical reason. Every new
 * service and every correction takes the next unused version number. A
 * correction belongs in a NEW version (see the rollback plan, §10.3): the
 * prior version stays exactly as it was, and `templateVersionSource` picks
 * up the later, corrected DELTA for the same key automatically.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { serviceFor } from "../prisma/_serviceTargets";
import { loadPolicies } from "./_extractCore";

loadEnv();
const prisma = new PrismaClient();

const TRADE = "electrical";
/**
 * Band definitions, shared with extract-template-catalog.ts rather than
 * re-authored: a question banded there must mean the same thing here, and
 * a second manifest would drift the moment one tool's copy was edited alone.
 */
const POLICIES = loadPolicies();
/** Policy keys this extraction actually reaches — written once, at apply time. */
const usedPolicies = new Set<string>();
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Money anywhere in customer-facing text. */
const MONEY = /\$\s?[\d,]+(\.\d+)?|\b\d+\s?dollars?\b/i;
/** The contractor's own name. Extend as more contractors are extracted from. */
const BRAND = /\bElite(\s+Electric)?\b/gi;

/**
 * Canonical wording authored by hand, from the version-controlled manifest.
 *
 * Replaces the constant this started as. A growing constant inside a script is
 * a place decisions accumulate without review; a manifest is a file someone can
 * read, diff and argue with, and every entry carries the reason a human had to
 * decide.
 *
 * The rule, in three parts:
 *   safe universal copy      extracts automatically
 *   priced / branded /       requires an authored entry
 *   policy-bearing copy
 *   anything ambiguous       requires an authored entry
 *
 * Missing entry = the extraction FAILS. Never a silent strip, never a
 * mechanical generalisation.
 */
const MANIFEST_PATH = "prisma/template/electrical.wording.json";

type WordingEntry = { label?: string; prompt?: string; helpText?: string; reason?: string };
const WORDING: Record<string, WordingEntry> = (() => {
  if (!existsSync(MANIFEST_PATH)) return {};
  const m = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { entries: Record<string, WordingEntry> };
  return m.entries ?? {};
})();

/** Manifest keys are scoped by service so two services can share a question key. */
let SERVICE_KEY = "";
const authored = (suffix: string): WordingEntry | undefined => WORDING[`${SERVICE_KEY}/${suffix}`];

type Finding = { where: string; kind: "economics" | "policy"; detail: string };
const findings: Finding[] = [];

/** Strip contractor branding from customer-facing copy. */
function deBrand(text: string, where: string): string {
  if (!BRAND.test(text)) return text;
  BRAND.lastIndex = 0;
  const out = text.replace(BRAND, "we").replace(/\bwe take a look\b/i, "we take a look");
  findings.push({ where, kind: "policy", detail: `named the contractor: "${text}" -> "${out}"` });
  return out;
}

/**
 * Refuse copy that contains a price.
 *
 * Not rewritten — REFUSED. A label reading "from $280" cannot be mechanically
 * turned into correct generic copy, because the sentence was built around a
 * number that is now unknown. Someone has to write it again.
 */
function assertNoMoney(text: string, where: string): string {
  if (MONEY.test(text)) {
    findings.push({ where, kind: "economics", detail: `PRICE IN CUSTOMER TEXT: "${text}"` });
    throw new Error(
      `${where} contains a price: "${text}".\n` +
        `  A template cannot carry it, and it cannot be rewritten mechanically —\n` +
        `  the sentence is built around a number that is now unknown.\n` +
        `  Fix Elite's copy first, or supply template wording by hand.`
    );
  }
  return text;
}

/**
 * Decide what a piece of customer-facing copy becomes in the template.
 *
 * Safe copy passes through. Copy carrying a price or a contractor's name
 * REQUIRES an authored entry and fails loudly without one — the two things a
 * template must never assert on a contractor's behalf are a number and a name.
 */
function resolveCopy(suffix: string, field: "label" | "prompt" | "helpText", text: string): string {
  const where = `${SERVICE_KEY}/${suffix}.${field}`;
  const entry = authored(suffix);
  const supplied = entry?.[field];
  const risky = MONEY.test(text) || (BRAND.test(text) && !(BRAND.lastIndex = 0));

  if (supplied) {
    findings.push({ where, kind: risky ? "economics" : "policy",
      detail: `authored: "${text}" -> "${supplied}"   because: ${entry!.reason ?? "(no reason recorded)"}` });
    return supplied;
  }
  if (MONEY.test(text)) {
    throw new Error(
      `${where} contains a price: "${text}"\n` +
        `  Add an entry to ${MANIFEST_PATH}:\n` +
        `      "${SERVICE_KEY}/${suffix}": { "${field}": "…", "reason": "…" }\n` +
        `  It is not stripped automatically: the sentence is built around a number\n` +
        `  that is now unknown, and a machine cannot rewrite it correctly.`
    );
  }
  BRAND.lastIndex = 0;
  if (BRAND.test(text)) {
    BRAND.lastIndex = 0;
    throw new Error(
      `${where} names the contractor: "${text}"\n` +
        `  Add an entry to ${MANIFEST_PATH}:\n` +
        `      "${SERVICE_KEY}/${suffix}": { "${field}": "…", "reason": "…" }\n` +
        `  Substituting a pronoun automatically produces copy nobody approved.`
    );
  }
  return text;
}

async function main() {
  const slug = arg("service");
  const version = Number(arg("version") ?? "1");
  const apply = process.argv.includes("--apply");
  if (!slug) { console.error("  --service <slug> is required"); process.exit(1); }

  /**
   * WHOSE COPY. Four contractors own a service called `new-120v-outlet`, and
   * this took whichever one Postgres returned first.
   *
   * A dry run of the Routing V2 extraction proved it: it walked BrightPath's
   * restored V1 tree, reported no economics and no materials — because
   * BrightPath has neither — and would have written the retired access x
   * distance-band model into the canonical template as the product deliverable.
   * The output looked clean. It was clean, about the wrong tenant.
   *
   * `--contractor` has no default on purpose. This writes the thing every
   * future contractor receives; the source must be named out loud.
   */
  const contractorSlug = arg("contractor");
  if (!contractorSlug) {
    console.error("  --contractor <slug> is required — a slug alone does not identify a service");
    process.exit(1);
  }
  const owner = await prisma.contractor.findUnique({
    where: { slug: contractorSlug }, select: { id: true, slug: true },
  });
  if (!owner) { console.error(`  No contractor "${contractorSlug}".`); process.exit(1); }
  const target = await serviceFor(prisma, owner.id, slug);

  const svc = await prisma.service.findUniqueOrThrow({
    where: { id: target.id },
    include: {
      contractorCategory: { select: { canonicalCategoryId: true } },
      materials: { include: { canonicalMaterial: { select: { key: true } } } },
      questions: { orderBy: { order: "asc" }, include: {
        options: { orderBy: { order: "asc" }, include: {
          components: { include: { canonicalComponent: { select: { key: true } } } },
          conditionalDisclaimers: { include: { contractorDisclaimer: { select: { canonicalDisclaimerId: true } } } },
          photoGroups: true,
          referencedService: { select: { slug: true } },
        } },
      } },
    },
  });

  SERVICE_KEY = svc.slug;
  console.log(`\nEXTRACT  ${svc.name}  (${owner.slug}/${svc.slug})  ->  ${TRADE} v${version}`);
  console.log(`  ${apply ? "APPLY" : "DRY RUN"}\n`);

  // Everything on the Service that is economics, recorded and dropped.
  const dropped: [string, unknown][] = [
    ["basePrice", svc.basePrice], ["whileWeThereBasePrice", svc.whileWeThereBasePrice],
    ["fieldLaborHours", svc.fieldLaborHours], ["wwtLaborHours", svc.wwtLaborHours],
    ["primaryLaborUnits", svc.primaryLaborUnits], ["addOnLaborUnits", svc.addOnLaborUnits],
    ["estimatedMinutes", svc.estimatedMinutes], ["materialCostCents", svc.materialCostCents],
    ["materialMultiplier", svc.materialMultiplier], ["permitAdminCents", svc.permitAdminCents],
    ["otherDirectCostCents", svc.otherDirectCostCents], ["startingPriceLabel", svc.startingPriceLabel],
  ];
  console.log("  DROPPED — contractor economics, never in a template:");
  for (const [k, v] of dropped) if (v !== null && v !== undefined) console.log(`    ${k.padEnd(24)} ${v}`);

  // Reroute targets resolve to SLUGS before the tree is walked. A template
  // routes by key, never by id — ids belong to one version, keys are what
  // survive across them. Resolved up front because the walk below is
  // synchronous.
  const rerouteIds = svc.questions
    .flatMap((q) => q.options)
    .map((o) => o.rerouteServiceId)
    .filter(Boolean) as string[];
  const rerouteSlugs = new Map(
    (await prisma.service.findMany({
      where: { id: { in: rerouteIds } },
      select: { id: true, slug: true },
    })).map((r) => [r.id, r.slug] as const)
  );
  const rerouteKey = (id: string) => rerouteSlugs.get(id) ?? id;


  /**
   * RETIRED QUESTIONS DO NOT BECOME TEMPLATE QUESTIONS.
   *
   * Routing V2 retires the V1 access x distance-band questions by emptying
   * their options rather than deleting the rows, so a tenant's existing answers
   * still resolve against the question they were given for. That is a promise
   * to a contractor who HAS history.
   *
   * A template is a starting point and has none. Carrying a question with no
   * options into it would hand every future contractor four permanently dead
   * rows on day one, and `findUnreachableQuestions` would report them forever
   * as a defect nobody introduced.
   *
   * An option-less question is therefore dropped here, and the live rows it came
   * from are untouched.
   */
  const retired = svc.questions.filter((q) => q.options.length === 0);
  if (retired.length) {
    console.log(`\n  RETIRED — present on the source tenant, not carried into the template:`);
    for (const q of retired) console.log(`    ${q.key}`);
  }
  const liveQuestions = svc.questions.filter((q) => q.options.length > 0);

  const questions = liveQuestions.map((q, qi) => ({
    key: q.key,
    prompt: resolveCopy(q.key, "prompt", q.prompt),
    helpText: q.helpText ? resolveCopy(q.key, "helpText", q.helpText) : null,
    inputType: q.inputType,
    // ROUTING V2 — part of the executable pricing contract, not presentation.
    numberAllowsDecimal: q.numberAllowsDecimal, numberMin: q.numberMin,
    numberMax: q.numberMax,
    order: qi,
    options: q.options.map((o, oi) => {
      const where = `${q.key}/${o.value}`;
      if (o.priceModifierCents) findings.push({ where, kind: "economics", detail: `priceModifierCents ${o.priceModifierCents} dropped` });
      if (o.overrideEstimatedMinutes !== null) findings.push({ where, kind: "economics", detail: `overrideEstimatedMinutes ${o.overrideEstimatedMinutes} dropped` });
      // A band option's wording is a contractor decision, not missing copy —
      // same rule extract-template-catalog.ts already applies. The template
      // carries the SHAPE ("{b1} to {b2} feet") and leaves the numbers to the
      // contractor; the label IS the pattern, deliberately not customer-ready,
      // which is what keeps a service carrying one from publishing until a
      // contractor resolves it. Checked BEFORE resolveCopy: a banded option's
      // live wording is Elite's own already-resolved numbers ("10 to 20
      // feet"), and running that through resolveCopy would authored-override
      // or pass through a number that is specifically not template content.
      const band = POLICIES.questions[q.key];
      const pattern = band?.patterns[o.value];
      if (pattern) {
        usedPolicies.add(band!.policyKey);
        findings.push({ where, kind: "policy", detail: `banded: "${o.label}" -> pattern "${pattern}" (policy ${band!.policyKey})` });
      }
      return {
        value: o.value,
        routeAction: o.routeAction,
        // ROUTING V2 numeric routing — part of the executable contract.
        numberAtLeastExclusive: o.numberAtLeastExclusive, numberAtLeast: o.numberAtLeast,
        numberAtMost: o.numberAtMost,
        // ROUTING V2 capability gate. TEMPLATE side of the split: the template
        // states what a route REQUIRES; ContractorCapability states what a
        // contractor OFFERS. Requiring drywall restoration is trade knowledge
        // about the work; declaring you do it is that contractor's business.
        //
        // Dropping this silently handed a provisioned contractor finished-wall
        // routes with no gate at all — restoration offered by someone who never
        // said they do it.
        requiresCapabilityKey: o.requiresCapabilityKey,
        label: pattern ?? resolveCopy(`${q.key}/${o.value}`, "label", o.label),
        labelPattern: pattern ?? null,
        policyKey: pattern ? band!.policyKey : null,
        order: oi,
        nextQuestionKey: o.nextQuestionId ? liveQuestions.find((x) => x.id === o.nextQuestionId)?.key ?? null : null,
        rerouteServiceKey: o.rerouteServiceId
          ? rerouteKey(o.rerouteServiceId) : null,
        referencedServiceKey: o.referencedService?.slug ?? null,
        requiredPhotoLabels: o.requiredPhotoLabels,
        photosBlockBooking: o.photosBlockBooking,
        illustrationUrls: o.illustrationUrls,
        components: o.components.filter((c) => c.canonicalComponentId).map((c) => ({
          canonicalComponentId: c.canonicalComponentId!, quantity: c.quantity,
          conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue,
          // ROUTING V2 — see AnswerOptionComponent.quantityAnswerKey.
          quantityAnswerKey: c.quantityAnswerKey,
        })),
        // A QuestionDisclaimer may point at the deprecated ConditionalDisclaimer
        // instead of a ContractorDisclaimer; only the canonical-backed ones can
        // be templated, and a null here is a row the contract phase will remove.
        disclaimers: o.conditionalDisclaimers
          .filter((d) => d.contractorDisclaimer?.canonicalDisclaimerId)
          .map((d) => ({ canonicalDisclaimerId: d.contractorDisclaimer!.canonicalDisclaimerId })),
        photoGroups: o.photoGroups.map((g) => ({ photoGroupId: g.photoGroupId })),
        inlineDisclaimer: o.disclaimer,
      };
    }),
  }));

  console.log("\n  MATERIALS — quantity kept only where it is a property of the job:");
  const materials = svc.materials.filter((m) => m.canonicalMaterialId).map((m, i) => {
    // A consumable allowance is a contractor decision; a discrete part the job
    // needs is structural. Wire footage is POLICY[*.standard_run_ft].
    const key = m.canonicalMaterial!.key;
    const isAllowance = /WIRE|CONSUMABLE|CABLE/i.test(key);
    if (isAllowance) findings.push({ where: `material:${key}`, kind: "policy", detail: `quantity ${m.quantity} is an allowance — left for the contractor` });
    console.log(`    ${key.padEnd(24)} ${isAllowance ? `quantity ${m.quantity} DROPPED (policy)` : `quantity ${m.quantity} kept (structural)`}`);
    return { canonicalMaterialId: m.canonicalMaterialId!, quantity: isAllowance ? null : m.quantity, quantityIsPolicy: isAllowance, order: i };
  });

  // Policies this service needs that no question introduces — the same
  // service-level manifest entry extract-template-catalog.ts reads.
  const servicePolicies = POLICIES.servicePolicies[svc.slug] ?? [];
  for (const k of servicePolicies) usedPolicies.add(k);

  console.log("\n  FINDINGS");
  for (const f of findings) console.log(`    ${f.kind.padEnd(10)} ${f.where}\n        ${f.detail}`);
  if (!findings.length) console.log("    (none — suspicious for a real service; check the classification)");

  if (!apply) { console.log(`\n  Dry run — nothing written.\n`); await prisma.$disconnect(); return; }

  // A published version is immutable, unconditionally — no flag bypasses
  // this. Refuses the instant the version exists at all, regardless of
  // whether THIS service key is already in it: adding a second service to
  // an existing version is still changing what a version publishes after
  // some contractor may already have installed from it. Every new service
  // and every correction takes the next unused version number instead.
  const existingVersion = await prisma.templateVersion.findUnique({ where: { trade_version: { trade: TRADE, version } } });
  if (existingVersion) {
    console.error(
      `\n  REFUSED: ${TRADE} v${version} already exists. A published version is immutable —\n` +
      `  templateVersionSource resolves whatever is written the instant it lands, with no\n` +
      `  staging step, so writing into an existing version — even to add a different service —\n` +
      `  silently changes what a contractor may already have installed from.\n\n` +
      `  Use the next unused version instead (--version ${version + 1} or higher). There is no\n` +
      `  override: a correction is a NEW version, never a rewrite of one that already exists.\n`
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  /**
   * ATOMIC PUBLICATION.
   *
   * Every write below used to run as its own round trip: upsert the version,
   * delete the old copy of this service, create the new one, then one
   * `templateQuestion.create` per question — sixteen or more separate
   * statements for a real service. `templateVersionSource` reads whatever
   * rows exist with no notion of "still being written", so a crash, a
   * killed process or a lost connection between any two of those statements
   * left a TemplateService with some questions and not others — a tree with
   * options that route to a `nextQuestionKey` that was never created — fully
   * visible to `installCatalog` and to any fresh contractor provisioning
   * from this version in that window. `$transaction` makes the whole
   * publication one all-or-nothing unit: either every question and option
   * this service needs exists, or none of it does.
   *
   * INSERT-ONLY, NOT UPSERT — the second-publisher race this closes.
   *
   * The pre-check above reads, then this transaction writes; between those
   * two steps, nothing stops a SECOND process from running the identical
   * pre-check, also finding no existing version, and racing this one into
   * its own transaction. `upsert` masked exactly that race: whichever
   * transaction's `upsert` commits second would find the row the first one
   * just created and treat it as a normal "already exists, apply `update:
   * {}`" case — a silent no-op on the version row that let the SECOND
   * publisher's service/question/option writes proceed anyway, coexisting
   * with or contradicting the first publisher's content in the version the
   * refusal above was supposed to make unique. `create` has no such
   * fallback: the second transaction's `create` hits the `trade`+`version`
   * unique constraint, throws, and Prisma rolls back everything else in
   * that same transaction — the second publisher fails completely, having
   * changed nothing, which is what "insert-only" actually requires.
   */
  try {
    await prisma.$transaction(async (tx) => {
      const tv = await tx.templateVersion.create({
        // A DELTA: this extracts ONE service into a version, which is changes
        // onto an earlier catalog rather than a catalog. Installing it as one
        // would give a contractor a single-service business.
        data: { trade: TRADE, version, kind: "DELTA", notes: `extracted from ${slug}` },
      });

      /**
       * POLICY DEFINITIONS — written before the service, same order
       * extract-template-catalog.ts already uses and for the same reason: an
       * answer option referencing one cannot be created until it exists.
       * Silently omitted here until now, which meant a banded question this
       * tool extracted lost its band shape and its options' unresolved-pattern
       * behavior entirely — the contractor lost the fact that a number was
       * theirs to set, not the template's.
       */
      const policyIds = new Map<string, string>();
      for (const key of [...usedPolicies].sort()) {
        const def = POLICIES.definitions[key];
        if (!def) throw new Error(`Policy "${key}" is referenced but not defined in ${`prisma/template/electrical.policies.json`}.`);
        const row = await tx.templatePolicyDefinition.upsert({
          where: { templateVersionId_key: { templateVersionId: tv.id, key } },
          update: { type: def.type, unit: def.unit ?? null, boundaryCount: def.boundaryCount, prompt: def.prompt },
          create: { templateVersionId: tv.id, key, type: def.type, unit: def.unit ?? null,
                    boundaryCount: def.boundaryCount, prompt: def.prompt },
        });
        policyIds.set(key, row.id);
      }

      // No deleteMany here: tv was just INSERTED by the create() above —
      // never upserted — so no prior TemplateService can exist for it.
      // Deleting nothing that could exist would be defensive code for an
      // impossible case.
      const ts = await tx.templateService.create({
        data: {
          templateVersionId: tv.id, key: svc.slug, slug: svc.slug, name: svc.name,
          shortDescription: svc.shortDescription, icon: svc.icon,
          canonicalCategoryId: svc.contractorCategory!.canonicalCategoryId,
          bookingType: svc.bookingType, photoState: svc.photoState,
          isPrimaryEligible: svc.isPrimaryEligible, requiresTechCount: svc.requiresTechCount,
          // Which pricing engine a service resolves through — LEGACY_PUBLISHED
          // vs. DERIVED_RESOLVED_SCOPE — is as structural a fact as bookingType,
          // and was silently dropped here: every extraction through this tool
          // wrote the schema default regardless of what the source actually
          // was. A service whose source has moved to DERIVED_RESOLVED_SCOPE
          // re-extracting as LEGACY_PUBLISHED would silently regress every
          // future install of it — the exact defect §0.9 already found and
          // fixed in extract-template-catalog.ts, present here too until now.
          pricingMethod: svc.pricingMethod,
          materials: { create: materials },
          policies: { create: servicePolicies.map((k) => ({ templatePolicyDefinitionId: policyIds.get(k)! })) },
        },
      });
      for (const q of questions) {
        await tx.templateQuestion.create({
          data: {
            templateServiceId: ts.id, key: q.key, prompt: q.prompt, helpText: q.helpText,
            inputType: q.inputType, numberAllowsDecimal: q.numberAllowsDecimal, numberMin: q.numberMin, numberMax: q.numberMax,
            order: q.order,
            options: { create: q.options.map((o) => ({
              value: o.value, label: o.label, routeAction: o.routeAction, order: o.order,
              numberAtLeastExclusive: o.numberAtLeastExclusive, numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost,
              requiresCapabilityKey: o.requiresCapabilityKey,
              labelPattern: o.labelPattern,
              templatePolicyDefinitionId: o.policyKey ? policyIds.get(o.policyKey) ?? null : null,
              nextQuestionKey: o.nextQuestionKey, rerouteServiceKey: o.rerouteServiceKey,
              referencedServiceKey: o.referencedServiceKey,
              requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking,
              illustrationUrls: o.illustrationUrls,
              components: { create: o.components },
              disclaimers: { create: o.disclaimers },
              photoGroups: { create: o.photoGroups },
            })) },
          },
        });
      }
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      console.error(
        `\n  REFUSED: another process published ${TRADE} v${version} concurrently, between this run's\n` +
        `  own refusal check and its write. Insert-only creation caught the race: this run's\n` +
        `  transaction failed and rolled back completely — nothing it would have written landed.\n\n` +
        `  Use the next unused version instead (--version ${version + 1} or higher).\n`
      );
      await prisma.$disconnect();
      process.exit(1);
    }
    throw e;
  }
  console.log(`\n  Extracted into ${TRADE} v${version}: ${questions.length} questions, ` +
              `${questions.flatMap((q) => q.options).length} options, ${materials.length} materials.\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(`\n  ${(e as Error).message}\n`); await prisma.$disconnect(); process.exit(1); });
}
