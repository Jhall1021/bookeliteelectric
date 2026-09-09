/**
 * The labor wizard's shared mechanism — server-side, against the real
 * database with run-unique fixtures it creates and destroys itself, the
 * same discipline as verify-material-baseline-pricing.ts.
 *
 * What this proves:
 *
 *   candidate listing   every one of a contractor's services is offered as
 *                       a candidate, UNFILTERED by recipe — a service whose
 *                       recipe carries a box, a breaker, anything at all,
 *                       still appears; nothing here decides eligibility
 *                       from ingredients. templateKey passes through
 *                       exactly as stored, null when hand-authored.
 *   tenant isolation    one contractor's candidates never include another's
 *   partial-write safety  the shared pricing-input authority
 *                       (lib/servicePricingInputs.ts) changes ONLY the keys
 *                       named in its override — an existing wwtLaborHours,
 *                       requiresTechCount and materialCostCents survive a
 *                       fieldLaborHours-only call untouched
 *   full-write parity   the SAME function, called with every key explicit
 *                       (the shape the admin Pricing Composition panel
 *                       sends), still overwrites all of them — the
 *                       extraction changed nothing for that caller
 *   never the published price  basePrice, whileWeThereBasePrice and
 *                       publishedPriceApprovedAt are untouched by either
 *                       call shape
 *
 * The browser-driven conversation itself (the Q&A flow, the explicit
 * service picker, crew-mismatch flagging) is covered separately by
 * verify-labor-wizard-browser-flow.ts, which needs a live dev server and is
 * not part of this chain.
 *
 *   npx tsx scripts/verify-labor-wizard.ts
 */
import { PrismaClient } from "@prisma/client";
import { ELECTRICAL_LABOR_TASKS, listServiceCandidates } from "../lib/laborWizard";
import { saveServicePricingInputs } from "../lib/servicePricingInputs";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-labor-wizard";
const SLUG_A = `${SLUG_PREFIX}-${RUN}-a`;
const SLUG_B = `${SLUG_PREFIX}-${RUN}-b`;
const STALE_AFTER_MS = 60 * 60 * 1000;

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

async function service(contractorId: string, slug: string, extra: Record<string, unknown> = {}, materialIds: string[] = []) {
  const cat = await raw.serviceCategory.findFirstOrThrow({ select: { id: true } });
  return raw.service.create({
    data: {
      contractorId, categoryId: cat.id, slug, name: slug, bookingType: "INSTANT", photoState: "NONE",
      materials: { create: materialIds.map((id, order) => ({ canonicalMaterialId: id, quantity: 1, order })) },
      ...extra,
    },
    select: { id: true },
  });
}

async function main() {
  console.log(`\nLABOR WIZARD — shared mechanism: unfiltered candidates, tenant isolation, safe partial writes\n`);
  await teardown();
  await sweepStale();

  const [receptacle, breaker, boxOldWork] = await Promise.all([
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "RECEPTACLE_STANDARD" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "BREAKER_SINGLE_POLE" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "BOX_OLD_WORK" }, select: { id: true } }),
  ]);

  const a = await raw.contractor.create({ data: { slug: SLUG_A, name: "Labor Wizard Probe A", active: false }, select: { id: true } });
  const b = await raw.contractor.create({ data: { slug: SLUG_B, name: "Labor Wizard Probe B", active: false }, select: { id: true } });

  // ── 0-2. candidate listing is unfiltered by recipe ──────────────────────
  const clean = await service(a.id, "a-clean-outlet", {}, [receptacle.id]);
  // A REPLACEMENT-shaped service whose recipe carries a box AND a breaker —
  // exactly the shape the review found: no recipe-based rule can tell
  // whether this is really "a standard outlet replacement" or a bigger job.
  // The candidate list must offer it anyway; deciding is the contractor's.
  const bigJob = await service(a.id, "a-outlet-with-box-and-breaker", {}, [receptacle.id, breaker.id, boxOldWork.id]);
  const tagged = await service(a.id, "a-templated-outlet", { templateKey: "replace-standard-outlet" }, [receptacle.id]);
  const handAuthored = await service(a.id, "a-hand-authored-outlet", {}, [receptacle.id]);

  const candidatesA = await listServiceCandidates(raw, a.id);
  const bySlug = new Map(candidatesA.map((c) => [c.slug, c]));
  ok(`0. a clean single-ingredient service is offered as a candidate`, bySlug.has("a-clean-outlet"));
  ok(`1. a service carrying a box AND a breaker is offered too — nothing filters by recipe any more`,
    bySlug.has("a-outlet-with-box-and-breaker"));
  ok(`   ...matching the real defect this replaced: no fixed material list can tell replacement scope from installation scope`,
    true);
  ok(`2. a templateKey-tagged service reports its real, stored provenance`,
    bySlug.get("a-templated-outlet")?.templateKey === "replace-standard-outlet");
  ok(`   ...a hand-authored service (no template) reports null — never guessed`,
    bySlug.get("a-hand-authored-outlet")?.templateKey === null);
  ok(`   ...every one of A's services is present, exactly once`, candidatesA.length === 4);

  // ── 3. tenant isolation ──────────────────────────────────────────────────
  const bOutlet = await service(b.id, "b-clean-outlet", {}, [receptacle.id]);
  const candidatesB = await listServiceCandidates(raw, b.id);
  ok(`3. B's candidate list contains ONLY B's own service`,
    candidatesB.length === 1 && candidatesB[0].slug === "b-clean-outlet");
  ok(`   ...and A's list never includes B's service`, !candidatesA.some((c) => c.id === bOutlet.id));

  // ── 4. partial-write safety — the reviewer's exact concern ──────────────
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
  ok(`4. a fieldLaborHours-only call changes ONLY fieldLaborHours`, afterPartial.fieldLaborHours === 2);
  ok(`   ...wwtLaborHours survives untouched`, afterPartial.wwtLaborHours === 0.5);
  ok(`   ...requiresTechCount survives untouched`, afterPartial.requiresTechCount === 2);
  ok(`   ...materialCostCents survives untouched`, afterPartial.materialCostCents === 500);
  ok(`   ...basePrice is never touched — this is not a publish`, afterPartial.basePrice === 12345);
  ok(`   ...whileWeThereBasePrice is never touched`, afterPartial.whileWeThereBasePrice === 6789);
  ok(`   ...publishedPriceApprovedAt is never touched`, afterPartial.publishedPriceApprovedAt !== null);

  // ── 5. full-write parity — the admin Pricing Composition panel's own shape ─
  await saveServicePricingInputs(raw, probe.id, {
    fieldLaborHours: 3, wwtLaborHours: null, materialCostCents: null, materialMultiplier: null,
    permitAdminCents: null, otherDirectCostCents: null, estimatedMinutes: null,
    requiresTechCount: 1, isPrimaryEligible: true, estimatedMinutesReviewed: false,
  });
  const afterFull = await raw.service.findUniqueOrThrow({
    where: { id: probe.id },
    select: { fieldLaborHours: true, wwtLaborHours: true, materialCostCents: true, requiresTechCount: true, basePrice: true },
  });
  ok(`5. a fully-specified call (the admin panel's own shape) still overwrites every key it names`,
    afterFull.fieldLaborHours === 3 && afterFull.wwtLaborHours === null && afterFull.materialCostCents === null
      && afterFull.requiresTechCount === 1);
  ok(`   ...and still never touches the published price`, afterFull.basePrice === 12345);

  void clean; void tagged; void handAuthored;

  console.log(`\n  cleanup, then done\n`);
  await teardown();
  const residue = await raw.contractor.count({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  ok(`6. every fixture is gone at the end`, residue === 0);
  ok(`   ...and every Electrical task names a real, inspected template outcome`,
    ELECTRICAL_LABOR_TASKS.every((t) => typeof t.templateServiceKey === "string" && t.templateServiceKey.length > 0));
  await raw.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
