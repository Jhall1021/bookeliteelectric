/**
 * The labor wizard's shared mechanism — server-side, against the real
 * database with run-unique fixtures it creates and destroys itself, the
 * same discipline as verify-material-baseline-pricing.ts.
 *
 * What this proves:
 *
 *   canonical eligibility  a service is eligible for a task ONLY when its
 *                       templateKey names that task's real canonical
 *                       outcome AND its current recipe is still the exact
 *                       set the TemplateService was provisioned with — not
 *                       "carries the role", not "contractor checked it"
 *   customized, not silently either way  a templated service whose recipe
 *                       OR a fixed quantity has since diverged is excluded
 *                       from eligible and surfaced separately, never
 *                       offered and never dropped without a trace — the
 *                       SAME set of materials at a DIFFERENT quantity
 *                       (one outlet vs. three) is exactly as disqualifying
 *                       as a different material entirely
 *   hand-authored is absent  a service with no templateKey at all (every
 *                       catalog that predates templating, Elite's
 *                       included) appears in neither list — there is no
 *                       backfill and no special case
 *   per-task scoping   a service tagged for one task never appears as
 *                       eligible for another
 *   tenant isolation    one contractor's eligible services never include
 *                       another's
 *   partial-write safety  the shared pricing-input authority
 *                       (lib/servicePricingInputs.ts) changes ONLY the keys
 *                       named in its override — an existing wwtLaborHours,
 *                       requiresTechCount and materialCostCents survive a
 *                       fieldLaborHours-only call untouched
 *   full-write parity   the SAME function, called with every key explicit
 *                       (the admin Pricing Composition panel's own shape),
 *                       still overwrites all of them
 *   never the published price  basePrice, whileWeThereBasePrice and
 *                       publishedPriceApprovedAt are untouched by either
 *                       call shape
 *   no lost update      two concurrent saveServicePricingInputs calls
 *                       naming DIFFERENT fields on the SAME service both
 *                       land — neither call reads the row first, so
 *                       neither can write back a stale snapshot of the
 *                       field the other one just changed
 *
 * The browser-driven conversation itself (the Q&A flow, the eligibility-
 * scoped picker, crew-mismatch flagging, and the direct-API refusal of an
 * ineligible id) is covered separately by
 * verify-labor-wizard-browser-flow.ts, which needs a live dev server and is
 * not part of this chain.
 *
 *   npx tsx scripts/verify-labor-wizard.ts
 */
import { PrismaClient } from "@prisma/client";
import { ELECTRICAL_LABOR_TASKS, resolveTaskEligibility } from "../lib/laborWizard";
import { saveServicePricingInputs } from "../lib/servicePricingInputs";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-labor-wizard";
const SLUG_A = `${SLUG_PREFIX}-${RUN}-a`;
const SLUG_B = `${SLUG_PREFIX}-${RUN}-b`;
const STALE_AFTER_MS = 60 * 60 * 1000;
const TRADE = "electrical";
const VERSION = 1;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function removeContractor(slug: string) {
  const c = await raw.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  await raw.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractor.delete({ where: { id: c.id } }).catch(() => {});
}
async function teardown() {
  for (const s of [SLUG_A, SLUG_B]) await removeContractor(s);
}
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await raw.contractor.findMany({
    where: { slug: { startsWith: SLUG_PREFIX }, NOT: { slug: { in: [SLUG_A, SLUG_B] } }, createdAt: { lt: cutoff } },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

async function service(
  contractorId: string, slug: string, materialIds: string[], extra: Record<string, unknown> = {},
  quantityOverrides: Record<string, number> = {}
) {
  const cat = await raw.serviceCategory.findFirstOrThrow({ select: { id: true } });
  return raw.service.create({
    data: {
      contractorId, categoryId: cat.id, slug, name: slug, bookingType: "INSTANT", photoState: "NONE",
      materials: {
        create: materialIds.map((id, order) => ({ canonicalMaterialId: id, quantity: quantityOverrides[id] ?? 1, order })),
      },
      ...extra,
    },
    select: { id: true },
  });
}

async function main() {
  console.log(`\nLABOR WIZARD — shared mechanism: canonical eligibility, customized divergence, tenant isolation, safe partial writes\n`);
  await teardown();
  await sweepStale();

  const tv = await raw.templateVersion.findUniqueOrThrow({ where: { trade_version: { trade: TRADE, version: VERSION } } });
  const [outletTemplate, switchTemplate] = await Promise.all([
    raw.templateService.findUniqueOrThrow({
      where: { templateVersionId_key: { templateVersionId: tv.id, key: "replace-standard-outlet" } },
      select: { materials: { select: { canonicalMaterialId: true } } },
    }),
    raw.templateService.findUniqueOrThrow({
      where: { templateVersionId_key: { templateVersionId: tv.id, key: "replace-standard-switch" } },
      select: { materials: { select: { canonicalMaterialId: true } } },
    }),
  ]);
  const outletRecipe = outletTemplate.materials.map((m) => m.canonicalMaterialId);
  const switchRecipe = switchTemplate.materials.map((m) => m.canonicalMaterialId);
  const [receptacle, boxOldWork] = await Promise.all([
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "RECEPTACLE_STANDARD" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "BOX_OLD_WORK" }, select: { id: true } }),
  ]);

  const a = await raw.contractor.create({ data: { slug: SLUG_A, name: "Labor Wizard Probe A", active: false }, select: { id: true } });
  const b = await raw.contractor.create({ data: { slug: SLUG_B, name: "Labor Wizard Probe B", active: false }, select: { id: true } });

  // ── fixtures ─────────────────────────────────────────────────────────────
  const eligibleOutlet = await service(a.id, "a-eligible-outlet", outletRecipe, {
    templateKey: "replace-standard-outlet", templateVersionId: tv.id,
  });
  const customizedOutlet = await service(a.id, "a-customized-outlet", [...outletRecipe, boxOldWork.id], {
    templateKey: "replace-standard-outlet", templateVersionId: tv.id,
  });
  // SAME material set as the template — nothing added, nothing removed —
  // but the receptacle's own quantity moved from the template's fixed 1 to
  // 3: this service now replaces three outlets, not one. The reviewer's
  // exact scenario: a set-only comparison would have called this eligible.
  const differentQuantityOutlet = await service(a.id, "a-different-quantity-outlet", outletRecipe, {
    templateKey: "replace-standard-outlet", templateVersionId: tv.id,
  }, { [receptacle.id]: 3 });
  const handAuthoredOutlet = await service(a.id, "a-hand-authored-outlet", [receptacle.id]);
  const unrelatedSwitch = await service(a.id, "a-tagged-switch", switchRecipe, {
    templateKey: "replace-standard-switch", templateVersionId: tv.id,
  });
  const bEligibleOutlet = await service(b.id, "b-eligible-outlet", outletRecipe, {
    templateKey: "replace-standard-outlet", templateVersionId: tv.id,
  });

  const outletTask = ELECTRICAL_LABOR_TASKS.find((t) => t.key === "outlet_replacement")!;
  const switchTask = ELECTRICAL_LABOR_TASKS.find((t) => t.key === "switch_replacement")!;

  const resolvedA = await resolveTaskEligibility(raw, a.id, [outletTask, switchTask]);
  const outletResult = resolvedA.find((r) => r.task.key === "outlet_replacement")!;
  const switchResult = resolvedA.find((r) => r.task.key === "switch_replacement")!;

  ok(`0. the unmodified, correctly-tagged service is eligible`,
    outletResult.eligible.some((s) => s.id === eligibleOutlet.id));
  ok(`1. the same-tagged service whose recipe has since diverged is EXCLUDED from eligible`,
    !outletResult.eligible.some((s) => s.id === customizedOutlet.id));
  ok(`   ...and appears in customized instead, not silently dropped`,
    outletResult.customized.some((s) => s.id === customizedOutlet.id));
  ok(`1b. same materials, different FIXED quantity (1 outlet -> 3) is ALSO excluded from eligible`,
    !outletResult.eligible.some((s) => s.id === differentQuantityOutlet.id));
  ok(`    ...and appears in customized too — a quantity change is not silently accepted`,
    outletResult.customized.some((s) => s.id === differentQuantityOutlet.id));
  ok(`2. the hand-authored service (no templateKey) appears in NEITHER list`,
    !outletResult.eligible.some((s) => s.id === handAuthoredOutlet.id) &&
    !outletResult.customized.some((s) => s.id === handAuthoredOutlet.id));
  ok(`3. a service tagged for a DIFFERENT task never appears as eligible for this one`,
    !outletResult.eligible.some((s) => s.id === unrelatedSwitch.id));
  ok(`   ...and IS eligible for its own task`,
    switchResult.eligible.some((s) => s.id === unrelatedSwitch.id));
  ok(`4. exactly one eligible outlet service for A, no more`, outletResult.eligible.length === 1);

  ok(`5. B's eligible service never appears in A's eligible list`,
    !outletResult.eligible.some((s) => s.id === bEligibleOutlet.id));
  const resolvedB = await resolveTaskEligibility(raw, b.id, [outletTask]);
  ok(`   ...and B's own resolution finds ONLY its own service`,
    resolvedB[0].eligible.length === 1 && resolvedB[0].eligible[0].id === bEligibleOutlet.id);

  // ── partial-write safety — the reviewer's exact concern from the prior round ─
  const probe = await raw.service.create({
    data: {
      contractorId: a.id, categoryId: (await raw.serviceCategory.findFirstOrThrow({ select: { id: true } })).id,
      slug: "a-partial-write-probe", name: "a-partial-write-probe", bookingType: "INSTANT", photoState: "NONE",
      fieldLaborHours: 1, wwtLaborHours: 0.5, requiresTechCount: 2, materialCostCents: 500,
      basePrice: 12345, whileWeThereBasePrice: 6789, publishedPriceApprovedAt: new Date(),
    },
    select: { id: true },
  });
  await saveServicePricingInputs(raw, probe.id, { fieldLaborHours: 2 });
  const afterPartial = await raw.service.findUniqueOrThrow({
    where: { id: probe.id },
    select: {
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true, materialCostCents: true,
      basePrice: true, whileWeThereBasePrice: true, publishedPriceApprovedAt: true,
    },
  });
  ok(`6. a fieldLaborHours-only call changes ONLY fieldLaborHours`, afterPartial.fieldLaborHours === 2);
  ok(`   ...wwtLaborHours survives untouched`, afterPartial.wwtLaborHours === 0.5);
  ok(`   ...requiresTechCount survives untouched`, afterPartial.requiresTechCount === 2);
  ok(`   ...materialCostCents survives untouched`, afterPartial.materialCostCents === 500);
  ok(`   ...basePrice is never touched — this is not a publish`, afterPartial.basePrice === 12345);
  ok(`   ...whileWeThereBasePrice is never touched`, afterPartial.whileWeThereBasePrice === 6789);
  ok(`   ...publishedPriceApprovedAt is never touched`, afterPartial.publishedPriceApprovedAt !== null);

  // ── full-write parity — the admin Pricing Composition panel's own shape ─
  await saveServicePricingInputs(raw, probe.id, {
    fieldLaborHours: 3, wwtLaborHours: null, materialCostCents: null, materialMultiplier: null,
    permitAdminCents: null, otherDirectCostCents: null, estimatedMinutes: null,
    requiresTechCount: 1, isPrimaryEligible: true, estimatedMinutesReviewed: false,
  });
  const afterFull = await raw.service.findUniqueOrThrow({
    where: { id: probe.id },
    select: { fieldLaborHours: true, wwtLaborHours: true, materialCostCents: true, requiresTechCount: true, basePrice: true },
  });
  ok(`7. a fully-specified call (the admin panel's own shape) still overwrites every key it names`,
    afterFull.fieldLaborHours === 3 && afterFull.wwtLaborHours === null && afterFull.materialCostCents === null
      && afterFull.requiresTechCount === 1);
  ok(`   ...and still never touches the published price`, afterFull.basePrice === 12345);

  // ── no lost update — the reviewer's exact concern about reading current
  // values back into the write. Two calls naming DIFFERENT fields, fired
  // concurrently: a read-modify-write implementation can lose one of them
  // depending on interleaving; a build-from-overrides-only implementation
  // cannot, because neither call's SQL ever mentions the other's column. ──
  const concurrencyProbe = await raw.service.create({
    data: {
      contractorId: a.id, categoryId: (await raw.serviceCategory.findFirstOrThrow({ select: { id: true } })).id,
      slug: "a-concurrency-probe", name: "a-concurrency-probe", bookingType: "INSTANT", photoState: "NONE",
      fieldLaborHours: 1, wwtLaborHours: 1,
    },
    select: { id: true },
  });
  await Promise.all([
    saveServicePricingInputs(raw, concurrencyProbe.id, { fieldLaborHours: 10 }),
    saveServicePricingInputs(raw, concurrencyProbe.id, { wwtLaborHours: 20 }),
  ]);
  const afterConcurrent = await raw.service.findUniqueOrThrow({
    where: { id: concurrencyProbe.id }, select: { fieldLaborHours: true, wwtLaborHours: true },
  });
  ok(`8. two concurrent calls naming different fields BOTH land — no lost update`,
    afterConcurrent.fieldLaborHours === 10 && afterConcurrent.wwtLaborHours === 20,
    `got fieldLaborHours=${afterConcurrent.fieldLaborHours}, wwtLaborHours=${afterConcurrent.wwtLaborHours}`);

  console.log(`\n  cleanup, then done\n`);
  await teardown();
  const residue = await raw.contractor.count({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  ok(`9. every fixture is gone at the end`, residue === 0);
  await raw.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
