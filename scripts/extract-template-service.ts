/**
 * Extract ONE Elite service into the electrical template — ADR-014.
 *
 * Not a relabelling. Elite's rows carry electrical knowledge AND Elite's
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
 *   contractor economics        price modifiers, published prices, labour
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
 * texts across the catalogue name Elite by name. A copy that trusted field
 * types would have shipped both to every future contractor.
 *
 *   --service <slug>   which Elite service to extract
 *   --version <n>      template version to write into (created if absent)
 *   --apply            write; otherwise report only
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();

const TRADE = "electrical";
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

  const svc = await prisma.service.findFirstOrThrow({
    where: { slug },
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
  console.log(`\nEXTRACT  ${svc.name}  (${svc.slug})  ->  ${TRADE} v${version}`);
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


  const questions = svc.questions.map((q, qi) => ({
    key: q.key,
    prompt: resolveCopy(q.key, "prompt", q.prompt),
    helpText: q.helpText ? resolveCopy(q.key, "helpText", q.helpText) : null,
    inputType: q.inputType,
    order: qi,
    options: q.options.map((o, oi) => {
      const where = `${q.key}/${o.value}`;
      if (o.priceModifierCents) findings.push({ where, kind: "economics", detail: `priceModifierCents ${o.priceModifierCents} dropped` });
      if (o.overrideEstimatedMinutes !== null) findings.push({ where, kind: "economics", detail: `overrideEstimatedMinutes ${o.overrideEstimatedMinutes} dropped` });
      return {
        value: o.value,
        routeAction: o.routeAction,
        label: resolveCopy(`${q.key}/${o.value}`, "label", o.label),
        order: oi,
        nextQuestionKey: o.nextQuestionId ? svc.questions.find((x) => x.id === o.nextQuestionId)?.key ?? null : null,
        rerouteServiceKey: o.rerouteServiceId
          ? rerouteKey(o.rerouteServiceId) : null,
        referencedServiceKey: o.referencedService?.slug ?? null,
        requiredPhotoLabels: o.requiredPhotoLabels,
        photosBlockBooking: o.photosBlockBooking,
        illustrationUrls: o.illustrationUrls,
        components: o.components.filter((c) => c.canonicalComponentId).map((c) => ({
          canonicalComponentId: c.canonicalComponentId!, quantity: c.quantity,
          conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue,
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

  console.log("\n  FINDINGS");
  for (const f of findings) console.log(`    ${f.kind.padEnd(10)} ${f.where}\n        ${f.detail}`);
  if (!findings.length) console.log("    (none — suspicious for a real service; check the classification)");

  if (!apply) { console.log(`\n  Dry run — nothing written.\n`); await prisma.$disconnect(); return; }

  const tv = await prisma.templateVersion.upsert({
    where: { trade_version: { trade: TRADE, version } },
    update: {}, create: { trade: TRADE, version, notes: `extracted from ${slug}` },
  });
  await prisma.templateService.deleteMany({ where: { templateVersionId: tv.id, key: svc.slug } });
  const ts = await prisma.templateService.create({
    data: {
      templateVersionId: tv.id, key: svc.slug, slug: svc.slug, name: svc.name,
      shortDescription: svc.shortDescription, icon: svc.icon,
      canonicalCategoryId: svc.contractorCategory!.canonicalCategoryId,
      bookingType: svc.bookingType, photoState: svc.photoState,
      isPrimaryEligible: svc.isPrimaryEligible, requiresTechCount: svc.requiresTechCount,
      materials: { create: materials },
    },
  });
  for (const q of questions) {
    await prisma.templateQuestion.create({
      data: {
        templateServiceId: ts.id, key: q.key, prompt: q.prompt, helpText: q.helpText,
        inputType: q.inputType, order: q.order,
        options: { create: q.options.map((o) => ({
          value: o.value, label: o.label, routeAction: o.routeAction, order: o.order,
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
  console.log(`\n  Extracted into ${TRADE} v${version}: ${questions.length} questions, ` +
              `${questions.flatMap((q) => q.options).length} options, ${materials.length} materials.\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(`\n  ${(e as Error).message}\n`); await prisma.$disconnect(); process.exit(1); });
}
