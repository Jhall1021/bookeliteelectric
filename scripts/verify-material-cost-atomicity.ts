/**
 * `setContractorMaterialCost` — the ordinary material-cost edit path used by
 * the admin Materials route — writes three things: the cost update, the
 * recompute cascade over that contractor's affected services, and the
 * `MaterialCostEvent`. Proves they commit together or not at all.
 *
 * NOT HYPOTHETICAL. Until the fix alongside this script, `MaterialCostEvent`
 * had no `contractorId` column, so its own write threw
 * `NotYetTenantScopedError` on every genuine cost change routed through a
 * guarded caller — AFTER the cost had already been updated and AFTER
 * dependent services had already been recomputed, both as separate,
 * already-committed statements. The column fix closes that specific throw.
 * This proves the general case closed too: an injected fault at the same
 * point in the sequence now rolls back everything, not just the write that
 * happened to fail.
 *
 *   npx tsx scripts/verify-material-cost-atomicity.ts
 */
import { PrismaClient } from "@prisma/client";
import { withContractor } from "../lib/tenantRoute";
import { setContractorMaterialCost, recomputeServiceMaterialCost } from "../lib/materialCost";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-material-cost-atomicity-${RUN}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function removeContractor(slug: string) {
  const c = await raw.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  await raw.materialCostEvent.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractorMaterial.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractor.delete({ where: { id: c.id } }).catch(() => {});
}
async function teardown() { await removeContractor(SLUG); }
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await raw.contractor.findMany({
    where: { slug: { startsWith: "test-material-cost-atomicity-" }, NOT: { slug: SLUG }, createdAt: { lt: cutoff } },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

async function main() {
  console.log(`\nMATERIAL COST ATOMICITY — update, recompute cascade and event commit together or not at all\n`);
  await teardown();
  await sweepStale();

  const wire = await raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_12_2" }, select: { id: true } });
  const cat = await raw.serviceCategory.findFirstOrThrow({ select: { id: true } });

  const contractor = await raw.contractor.create({ data: { slug: SLUG, name: "Atomicity Probe", active: false }, select: { id: true } });

  // Pre-resolved, at a known cost — this test edits an EXISTING cost
  // (setContractorMaterialCost's own case), not an unresolved role.
  const cm = await raw.contractorMaterial.create({
    data: { contractorId: contractor.id, canonicalMaterialId: wire.id, unitCostCents: 100, costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK" },
    select: { id: true },
  });
  const svc = await raw.service.create({
    data: {
      contractorId: contractor.id, categoryId: cat.id, slug: `${SLUG}-svc`, name: `${SLUG}-svc`,
      bookingType: "INSTANT", photoState: "NONE", materials: { create: [{ canonicalMaterialId: wire.id, quantity: 10, order: 0 }] },
    },
    select: { id: true },
  });
  await recomputeServiceMaterialCost(raw, svc.id);
  const before = await raw.service.findUniqueOrThrow({ where: { id: svc.id }, select: { materialCostCents: true } });
  ok(`0. fixture starts resolved at the fixture's own cost (100c x 10)`, before.materialCostCents === 1000);

  // ── 1. happy path still works, post-fix — the transaction commits normally ──
  const happy = await withContractor(contractor.id, "admin-session", (db) =>
    setContractorMaterialCost(db, { contractorMaterialId: cm.id, unitCostCents: 200 }, { reason: "atomicity probe - happy path", actor: "verifier" })
  );
  ok(`1. an ordinary edit still changes the cost and reports it changed`, happy.changed && happy.afterCents === 200);
  const afterHappy = await raw.contractorMaterial.findUniqueOrThrow({ where: { id: cm.id }, select: { unitCostCents: true } });
  ok(`   ...and the row genuinely holds the new cost`, afterHappy.unitCostCents === 200);
  const eventsAfterHappy = await raw.materialCostEvent.count({ where: { contractorMaterialId: cm.id } });
  ok(`   ...with exactly one MaterialCostEvent recorded for it`, eventsAfterHappy === 1);
  const serviceAfterHappy = await raw.service.findUniqueOrThrow({ where: { id: svc.id }, select: { materialCostCents: true } });
  ok(`   ...and the service recomputed to match (200c x 10)`, serviceAfterHappy.materialCostCents === 2000);

  // ── 2. inject a fault between the cost update and the event write — the
  // exact point in the sequence where the pre-fix NotYetTenantScopedError
  // used to throw for real. ──────────────────────────────────────────────
  let threw: unknown = null;
  try {
    await withContractor(contractor.id, "admin-session", (db) =>
      setContractorMaterialCost(
        db,
        { contractorMaterialId: cm.id, unitCostCents: 999 },
        { reason: "atomicity probe - injected fault", actor: "verifier" },
        async () => { throw new Error("injected fault — proving the transaction rolls back"); }
      )
    );
  } catch (e) {
    threw = e;
  }
  ok(`2. the injected fault propagates — the call genuinely fails`, threw instanceof Error && /injected fault/.test((threw as Error).message));

  const afterFault = await raw.contractorMaterial.findUniqueOrThrow({ where: { id: cm.id }, select: { unitCostCents: true } });
  ok(`3. the cost update rolled back — still 200, never touched 999`, afterFault.unitCostCents === 200,
    `got ${afterFault.unitCostCents}`);

  const eventsAfterFault = await raw.materialCostEvent.count({ where: { contractorMaterialId: cm.id } });
  ok(`   ...no new MaterialCostEvent — still exactly one, from the happy-path edit`, eventsAfterFault === 1,
    `got ${eventsAfterFault}`);

  const serviceAfterFault = await raw.service.findUniqueOrThrow({ where: { id: svc.id }, select: { materialCostCents: true } });
  ok(`   ...the recompute cascade rolled back too — service still 2000, never 9990`, serviceAfterFault.materialCostCents === 2000,
    `got ${serviceAfterFault.materialCostCents}`);

  console.log(`\n  cleanup, then done\n`);
  await teardown();
  const residue = await raw.contractor.count({ where: { slug: SLUG } });
  ok(`4. the fixture is gone at the end`, residue === 0);
  await raw.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
