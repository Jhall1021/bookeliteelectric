/**
 * Extract the whole Elite catalogue into Electrical Template v1 — ADR-014.
 *
 * Runs all services as a BATCH and collects refusals into review groups rather
 * than stopping at the first. Extraction is classification, and the refusals
 * are the actual product work: deciding what Price2Book knows because it is
 * true of residential electrical work, versus what Elite knows because that is
 * how Elite chooses to run its business.
 *
 * Fail-closed rules are unchanged. Nothing is silently rewritten, no
 * placeholder is inserted to make a service "complete", and a service with an
 * unauthored refusal is NOT written to the template.
 *
 *   --from <slug>  REQUIRED. The contractor being extracted FROM.
 *   (default)      report only
 *   --apply        write the services that have no outstanding refusals
 *   --service      limit to one, for the single-service proof
 *
 * `--from` is required rather than inferred. An earlier version read "every
 * Service row", which was indistinguishable from correct while Elite was the
 * only contractor and silently extracted a throwaway proof contractor's
 * catalogue back into the template the moment one existed. Extraction reads
 * across a tenant boundary by nature, so it names the tenant out loud.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { loadEnv } from "./_env";
import {
  MANIFEST_PATH, KIND_LABEL, KIND_REASON, classify, loadWording, loadKeyRemap, loadPolicies,
  type Refusal, type RefusalKind, type WordingEntry,
} from "./_extractCore";
import { boundariesUsed } from "../lib/policyBands";

loadEnv();
const prisma = new PrismaClient();
const TRADE = "electrical";
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

const WORDING = loadWording();
const KEY_REMAP = loadKeyRemap();
const POLICIES = loadPolicies();
const refusals: Refusal[] = [];

/** Elite's slug is untouched; only the canonical template key moves. */
const templateKey = (slug: string) => KEY_REMAP[slug] ?? slug;

/** Policy keys actually reached by the services being extracted. */
const usedPolicies = new Set<string>();

/** Set once --from is resolved; every read below is scoped to it. */
let SOURCE_ID = "";

const stats = {
  services: 0, questions: 0, options: 0,
  autoWording: 0, authoredWording: 0,
  policyExcluded: 0, economicsExcluded: 0, bandOptions: 0, policyDefinitions: 0,
  materialsCalibration: 0, canonicalMaterials: 0, canonicalComponents: 0, disclaimerConcepts: 0,
};

/**
 * Resolve one piece of copy.
 *
 * Safe copy passes. Risky copy uses an authored entry if one exists, and is
 * otherwise REFUSED — recorded, never rewritten, never placeholdered.
 */
function copy(
  service: string, suffix: string, field: "label" | "prompt" | "helpText", text: string
): string | null {
  const key = `${service}/${suffix}`;
  const entry: WordingEntry | undefined = WORDING[key];
  const supplied = entry?.[field];
  const kind = classify(text);

  if (!kind) { stats.autoWording++; return text; }
  if (supplied) { stats.authoredWording++; return supplied; }

  refusals.push({
    kind, service, location: suffix, field, source: text,
    reason: KIND_REASON[kind],
    key: `${MANIFEST_PATH} :: "${key}": { "${field}": "…", "reason": "…" }`,
  });
  return null;
}

type Extracted = NonNullable<Awaited<ReturnType<typeof buildOne>>>;

async function buildOne(slug: string) {
  const svc = await prisma.service.findFirstOrThrow({
    where: { slug, contractorId: SOURCE_ID },
    include: {
      contractorCategory: { select: { canonicalCategoryId: true } },
      materials: { include: { canonicalMaterial: { select: { key: true } } } },
      questions: { orderBy: { order: "asc" }, include: {
        options: { orderBy: { order: "asc" }, include: {
          components: true,
          conditionalDisclaimers: { include: { contractorDisclaimer: { select: { canonicalDisclaimerId: true, text: true } } } },
          photoGroups: true,
          referencedService: { select: { slug: true } },
        } } } },
    },
  });
  if (!svc.contractorCategory) {
    refusals.push({ kind: "unclassifiable", service: slug, location: "(service)", field: "category",
      source: "no contractor category", reason: "A service with no category cannot be placed in the template taxonomy.",
      key: "(fix the service's category in the admin)" });
    return null;
  }

  const before = refusals.length;

  // Economics are dropped without ceremony — they were never candidates.
  for (const v of [svc.basePrice, svc.whileWeThereBasePrice, svc.fieldLaborHours, svc.wwtLaborHours,
    svc.primaryLaborUnits, svc.addOnLaborUnits, svc.estimatedMinutes, svc.materialCostCents,
    svc.materialMultiplier, svc.permitAdminCents, svc.otherDirectCostCents])
    if (v !== null && v !== undefined) stats.economicsExcluded++;

  const rerouteIds = svc.questions.flatMap(q => q.options).map(o => o.rerouteServiceId).filter(Boolean) as string[];
  const rerouteSlugs = new Map((await prisma.service.findMany({
    where: { id: { in: rerouteIds } }, select: { id: true, slug: true },
  })).map(r => [r.id, r.slug] as const));

  const name = copy(slug, "(service)", "label", svc.name);
  const shortDescription = svc.shortDescription ? copy(slug, "(service).shortDescription", "label", svc.shortDescription) : null;

  const questions = svc.questions.map((q, qi) => {
    const prompt = copy(slug, q.key, "prompt", q.prompt);
    const helpText = q.helpText ? copy(slug, q.key, "helpText", q.helpText) : null;
    stats.questions++;
    return {
      key: q.key, prompt, helpText, inputType: q.inputType, order: qi,
      options: q.options.map((o, oi) => {
        stats.options++;
        if (o.priceModifierCents) stats.economicsExcluded++;
        if (o.overrideEstimatedMinutes !== null) stats.economicsExcluded++;
        // An inline disclaimer is the contractor's own words on this answer.
        if (o.disclaimer) {
          stats.policyExcluded++;
          refusals.push({ kind: "disclaimer-policy", service: slug, location: `${q.key}/${o.value}`,
            field: "disclaimer", source: o.disclaimer,
            reason: KIND_REASON["disclaimer-policy"],
            key: `(not template content — the contractor authors their own ContractorDisclaimer)` });
        }
        for (const d of o.conditionalDisclaimers) if (d.contractorDisclaimer) stats.disclaimerConcepts++;
        stats.canonicalComponents += o.components.filter(c => c.canonicalComponentId).length;
        // A band option's wording is a contractor decision, not missing copy.
        // The template carries the SHAPE and leaves the number to be filled in.
        const band = POLICIES.questions[q.key];
        const pattern = band?.patterns[o.value];
        if (pattern) {
          usedPolicies.add(band.policyKey);
          stats.bandOptions++;
        }

        return {
          value: o.value, routeAction: o.routeAction, order: oi,
          labelPattern: pattern ?? null,
          policyKey: pattern ? band!.policyKey : null,
          // While unresolved the label IS the pattern. Deliberately not
          // customer-ready: a service carrying one cannot publish, which is
          // safer than a plausible-looking default nobody chose.
          label: pattern ?? copy(slug, `${q.key}/${o.value}`, "label", o.label),
          nextQuestionKey: o.nextQuestionId ? svc.questions.find(x => x.id === o.nextQuestionId)?.key ?? null : null,
          rerouteServiceKey: o.rerouteServiceId
            ? (rerouteSlugs.get(o.rerouteServiceId) ? templateKey(rerouteSlugs.get(o.rerouteServiceId)!) : null)
            : null,
          referencedServiceKey: o.referencedService ? templateKey(o.referencedService.slug) : null,
          requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking,
          illustrationUrls: o.illustrationUrls,
          components: o.components.filter(c => c.canonicalComponentId).map(c => ({
            canonicalComponentId: c.canonicalComponentId!, quantity: c.quantity,
            conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue })),
          disclaimers: o.conditionalDisclaimers.filter(d => d.contractorDisclaimer)
            .map(d => ({ canonicalDisclaimerId: d.contractorDisclaimer!.canonicalDisclaimerId })),
          photoGroups: o.photoGroups.map(g => ({ photoGroupId: g.photoGroupId })),
        };
      }),
    };
  });

  const materials = svc.materials.filter(m => m.canonicalMaterialId).map((m, i) => {
    const key = m.canonicalMaterial!.key;
    const isAllowance = /WIRE|CABLE|CONSUMABLE/i.test(key);
    stats.canonicalMaterials++;
    if (isAllowance) {
      stats.materialsCalibration++;
      refusals.push({ kind: "material-quantity", service: slug, location: `material:${key}`,
        field: "quantity", source: String(m.quantity),
        reason: KIND_REASON["material-quantity"],
        key: `(not template content — quantityIsPolicy; the contractor calibrates the allowance)` });
    }
    return { canonicalMaterialId: m.canonicalMaterialId!, quantity: isAllowance ? null : m.quantity,
             quantityIsPolicy: isAllowance, order: i };
  });

  // A material-quantity or disclaimer refusal is EXPECTED and does not block:
  // both are "not template content", a legitimate outcome. Only unauthored
  // WORDING blocks, because the template would otherwise be missing text.
  const added = refusals.slice(before);
  const blocking = added.filter(r => !["material-quantity", "disclaimer-policy"].includes(r.kind));
  if (blocking.length || name === null) return null;

  const servicePolicies = POLICIES.servicePolicies[slug] ?? [];
  for (const k of servicePolicies) usedPolicies.add(k);

  return {
    slug: templateKey(slug), key: templateKey(slug), sourceSlug: slug, name: name!, shortDescription,
    servicePolicies,
    canonicalCategoryId: svc.contractorCategory.canonicalCategoryId,
    bookingType: svc.bookingType, photoState: svc.photoState,
    isPrimaryEligible: svc.isPrimaryEligible, requiresTechCount: svc.requiresTechCount,
    icon: svc.icon, questions, materials,
  };
}

/**
 * Policy definitions are written BEFORE any service, because an answer option
 * that references one cannot be created until it exists. Only the policies the
 * extracted services actually reach are written — an unreferenced policy
 * definition is a question nobody is ever asked.
 */
async function writePolicies(tvId: string) {
  const ids = new Map<string, string>();
  for (const key of [...usedPolicies].sort()) {
    const def = POLICIES.definitions[key];
    if (!def) throw new Error(`Policy "${key}" is referenced but not defined in the policy manifest.`);
    const row = await prisma.templatePolicyDefinition.upsert({
      where: { templateVersionId_key: { templateVersionId: tvId, key } },
      update: { type: def.type, unit: def.unit ?? null, boundaryCount: def.boundaryCount, prompt: def.prompt },
      create: { templateVersionId: tvId, key, type: def.type, unit: def.unit ?? null,
                boundaryCount: def.boundaryCount, prompt: def.prompt },
    });
    ids.set(key, row.id);
    stats.policyDefinitions++;
  }
  return ids;
}

async function write(tvId: string, e: Extracted, policyIds: Map<string, string>) {
  await prisma.templateService.deleteMany({ where: { templateVersionId: tvId, key: e.key } });
  const ts = await prisma.templateService.create({
    data: { templateVersionId: tvId, key: e.key, slug: e.slug, name: e.name,
      shortDescription: e.shortDescription, icon: e.icon,
      canonicalCategoryId: e.canonicalCategoryId, bookingType: e.bookingType, photoState: e.photoState,
      isPrimaryEligible: e.isPrimaryEligible, requiresTechCount: e.requiresTechCount,
      materials: { create: e.materials },
      policies: { create: e.servicePolicies.map((k) => ({ templatePolicyDefinitionId: policyIds.get(k)! })) } },
  });
  for (const q of e.questions) {
    await prisma.templateQuestion.create({
      data: { templateServiceId: ts.id, key: q.key, prompt: q.prompt!, helpText: q.helpText,
        inputType: q.inputType, order: q.order,
        options: { create: q.options.map(o => ({
          value: o.value, label: o.label!, routeAction: o.routeAction, order: o.order,
          labelPattern: o.labelPattern,
          templatePolicyDefinitionId: o.policyKey ? policyIds.get(o.policyKey) ?? null : null,
          nextQuestionKey: o.nextQuestionKey, rerouteServiceKey: o.rerouteServiceKey,
          referencedServiceKey: o.referencedServiceKey,
          requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking,
          illustrationUrls: o.illustrationUrls,
          components: { create: o.components }, disclaimers: { create: o.disclaimers },
          photoGroups: { create: o.photoGroups } })) } },
    });
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const only = arg("service");
  const version = Number(arg("version") ?? "1");

  const from = arg("from");
  if (!from) {
    console.error(`\n  --from <contractor-slug> is required.\n`);
    console.error(`  Extraction reads one contractor's catalogue and turns it into the`);
    console.error(`  canonical template. Which contractor is not something to infer.\n`);
    const all = await prisma.contractor.findMany({ select: { slug: true, name: true } });
    for (const c of all) console.error(`    ${c.slug}  (${c.name})`);
    console.error("");
    await prisma.$disconnect();
    process.exit(1);
  }
  const source = await prisma.contractor.findUnique({ where: { slug: from }, select: { id: true, name: true } });
  if (!source) { console.error(`\n  No contractor with slug "${from}".\n`); await prisma.$disconnect(); process.exit(1); }

  const all = await prisma.service.findMany({
    where: { contractorId: source.id, ...(only ? { slug: only } : {}) },
    select: { slug: true }, orderBy: { slug: "asc" },
  });
  console.log(`\nEXTRACT CATALOGUE  ->  ${TRADE} v${version}   ${apply ? "APPLY" : "REPORT ONLY"}`);
  console.log(`  source: ${source.name} (${from}) — ${all.length} service(s)\n`);
  SOURCE_ID = source.id;

  const built: Extracted[] = [];
  const refusedServices: string[] = [];
  for (const { slug } of all) {
    const e = await buildOne(slug);
    if (e) { built.push(e); stats.services++; }
    else refusedServices.push(slug);
  }

  // ---- refusal review groups --------------------------------------------
  const groups = new Map<RefusalKind, Refusal[]>();
  for (const r of refusals) groups.set(r.kind, [...(groups.get(r.kind) ?? []), r]);

  const BLOCKING: RefusalKind[] = ["branded-wording", "economic-wording", "policy-threshold", "ambiguous-scope", "unclassifiable"];
  const INFORMATIONAL: RefusalKind[] = ["material-quantity", "disclaimer-policy"];

  for (const kind of [...BLOCKING, ...INFORMATIONAL]) {
    const rs = groups.get(kind);
    if (!rs?.length) continue;
    const blocking = BLOCKING.includes(kind);
    console.log(`${"─".repeat(78)}`);
    console.log(`${KIND_LABEL[kind]}  —  ${rs.length}` +
      (blocking ? "   NEEDS AN AUTHORED DECISION" : "   NOT TEMPLATE CONTENT (no action needed)"));
    console.log(`  ${KIND_REASON[kind]}\n`);
    for (const r of rs.slice(0, blocking ? 40 : 6)) {
      console.log(`  ${r.service}  ·  ${r.location}${r.field !== "label" ? ` · ${r.field}` : ""}`);
      console.log(`      "${r.source.slice(0, 108)}"`);
      if (blocking) console.log(`      ${r.key}`);
    }
    if (rs.length > (blocking ? 40 : 6)) console.log(`  …and ${rs.length - (blocking ? 40 : 6)} more`);
    console.log();
  }

  // ---- catalogue report --------------------------------------------------
  console.log("─".repeat(78));
  console.log(`\nELECTRICAL TEMPLATE v${version} — WHAT WAS EXTRACTED\n`);
  const rows: [string, number | string][] = [
    ["Canonical services", `${stats.services} of ${all.length}`],
    ["Questions", stats.questions],
    ["Answer options", stats.options],
    ["Auto-accepted universal wording", stats.autoWording],
    ["Authored wording overrides", stats.authoredWording],
    ["Answer options whose wording is contractor policy", stats.bandOptions],
    ["Breakpoint policies the contractor must answer", usedPolicies.size],
    ["POLICY decisions excluded", stats.policyExcluded],
    ["Economic values excluded", stats.economicsExcluded],
    ["Material quantities requiring contractor calibration", stats.materialsCalibration],
    ["Canonical material references", stats.canonicalMaterials],
    ["Canonical component references", stats.canonicalComponents],
    ["Disclaimer concepts", stats.disclaimerConcepts],
    ["Remaining unresolved classifications", refusals.filter(r => BLOCKING.includes(r.kind)).length],
  ];
  for (const [k, v] of rows) console.log(`  ${k.padEnd(52)} ${v}`);

  const outstanding = refusals.filter(r => BLOCKING.includes(r.kind));
  writeFileSync("/tmp/extraction-refusals.json", JSON.stringify(outstanding, null, 2));
  console.log(`\n  ${refusedServices.length} service(s) not written pending decisions.`);
  console.log(`  Full refusal list: /tmp/extraction-refusals.json\n`);

  if (!apply) { console.log(`  Report only — nothing written.\n`); await prisma.$disconnect(); return; }

  const tv = await prisma.templateVersion.upsert({
    where: { trade_version: { trade: TRADE, version } }, update: {},
    create: { trade: TRADE, version, notes: `extracted from Elite's catalogue` },
  });
  // Services the source no longer has must not linger from an earlier run.
  const keep = built.map((e) => e.key);
  const stale = await prisma.templateService.findMany({
    where: { templateVersionId: tv.id, key: { notIn: keep } }, select: { key: true } });
  if (stale.length) {
    await prisma.templateService.deleteMany({ where: { templateVersionId: tv.id, key: { notIn: keep } } });
    console.log(`  Removed ${stale.length} stale template service(s): ${stale.slice(0, 5).map((s) => s.key).join(", ")}`);
  }

  const policyIds = await writePolicies(tv.id);
  for (const e of built) await write(tv.id, e, policyIds);
  console.log(`  Wrote ${policyIds.size} policy definition(s) the contractor must answer.`);
  console.log(`  Wrote ${built.length} service(s) into ${TRADE} v${version}.\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
