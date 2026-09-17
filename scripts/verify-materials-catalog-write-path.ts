/**
 * MATERIALS CATALOG — write-path proof, on disposable fixtures only.
 *
 *   npx tsx scripts/verify-materials-catalog-write-path.ts
 *
 * The /dashboard/materials cost editor calls the exact same POST
 * /api/admin/materials "cost"/"create" actions the per-service MaterialsPanel
 * already uses, which in turn call ONLY setContractorMaterialCost (see the
 * static source-grep proof in verify-materials-catalog.ts). This script does
 * not re-invent that call — it calls setContractorMaterialCost itself,
 * through the same guarded `withContractor` door every admin route uses, and
 * proves the outcome an admin editing from the new catalog page would see:
 *
 *   unit-cost edit       recomputes every service using the role, for THIS
 *                         contractor only, and leaves an unrelated service's
 *                         cache untouched
 *   package-priced edit  the derived unit cost matches deriveUnitCost's own
 *                         output exactly — no parallel math
 *   nameOverride          wins over the canonical name in the catalog read model
 *   customer-price guard  basePrice, whileWeThereBasePrice and
 *                         publishedPriceApprovedAt never move
 *
 * Route-level proof (the literal HTTP action, dispatch and validation code)
 * is separately exercised live in the browser against the real running app
 * in this same verification pass — this script proves the domain layer the
 * route calls into behaves correctly, following the fixture-contractor
 * pattern already established by verify-material-baseline-pricing.ts.
 *
 * FIXTURES ONLY. Every contractor/service/cost row this script creates is
 * torn down in a `finally`, whether checks pass or the run throws. The
 * canonical roles it reuses (WIRE_12_2, GFCI_WEATHER_RESISTANT, CABLE_CAT6,
 * WIRE_14_2, BOX_OLD_WORK) are real, shared, platform catalog entries — this
 * script never creates, deletes, or mutates them; it only adds and removes
 * ITS OWN ContractorMaterial rows against them.
 *
 * FIRST-TIME PRICING (added for the atomic-authority slice). The Materials
 * Catalog "create" action now prices a never-costed role through
 * overrideUnresolvedMaterialCost — the SAME function the Guided Setup
 * baseline batch review's "override" action already used, rather than a
 * parallel upsert-and-recompute sequence of its own. This script proves, on
 * disposable fixtures, through the same guarded `withContractor` door the
 * route uses:
 *
 *   first-time pricing   creates exactly one ContractorMaterial row, one
 *                         MaterialCostEvent, and recomputes every affected
 *                         service — atomically
 *   duplicate attempt     a second first-time-pricing attempt on an
 *                         already-resolved role is refused (ALREADY_RESOLVED),
 *                         creates no second row, writes no second event, and
 *                         leaves the already-priced figure untouched
 *   reprice after first   the "cost" action's authority (setContractorMaterialCost)
 *                         still reprices a role this same authority just
 *                         first-priced, adding a second, distinct event
 *   injected fault        a fault forced after the create, and separately
 *                         after the recompute cascade, rolls EVERYTHING back
 *                         — no row, no event, no service-cache change — using
 *                         the injectFault test seam createResolvedContractorMaterial
 *                         already exposes for exactly this purpose
 */
import { PrismaClient } from "@prisma/client";
import { withContractor } from "../lib/tenantRoute";
import {
  setContractorMaterialCost,
  overrideUnresolvedMaterialCost,
  deriveUnitCost,
  recomputeServiceMaterialCost,
} from "../lib/materialCost";
import { loadMaterialCatalog } from "../lib/materialCatalog";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `test-materials-catalog-writepath-${RUN}`;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => {
  if (!c) fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`);
};

async function removeFixture() {
  const c = await raw.contractor.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!c) return;
  await raw.materialCostEvent.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractorMaterial.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractor.delete({ where: { id: c.id } }).catch(() => {});
}

async function serviceUsing(
  contractorId: string,
  slug: string,
  canonicalMaterialId: string,
  quantity: number,
  priceFields: { basePrice: number; whileWeThereBasePrice: number; publishedPriceApprovedAt: Date }
) {
  const cat = await raw.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const svc = await raw.service.create({
    data: {
      contractorId,
      categoryId: cat.id,
      slug,
      name: slug,
      bookingType: "INSTANT",
      photoState: "NONE",
      ...priceFields,
      materials: { create: [{ canonicalMaterialId, quantity, order: 0 }] },
    },
    select: { id: true },
  });
  await recomputeServiceMaterialCost(raw, svc.id);
  return svc.id;
}

async function priceSnapshot(serviceId: string) {
  return raw.service.findUniqueOrThrow({
    where: { id: serviceId },
    select: {
      materialCostCents: true,
      basePrice: true,
      whileWeThereBasePrice: true,
      publishedPriceApprovedAt: true,
    },
  });
}

async function main() {
  console.log(`\nMATERIALS CATALOG — WRITE PATH (disposable fixtures only)\n`);
  await removeFixture();

  try {
    const [wire122, gfci, cat6] = await Promise.all([
      raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_12_2" }, select: { id: true, key: true } }),
      raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "GFCI_WEATHER_RESISTANT" }, select: { id: true, key: true } }),
      raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "CABLE_CAT6" }, select: { id: true, key: true } }),
    ]);

    const contractor = await raw.contractor.create({
      data: { slug: SLUG, name: "Materials Catalog Write-Path Fixture", active: false },
      select: { id: true },
    });

    const approvedAt = new Date("2026-01-01T00:00:00Z");
    // S1 uses the role we're about to edit. S2 is deliberately unrelated —
    // a different role entirely — so we can prove it is never touched.
    const s1 = await serviceUsing(contractor.id, "s1-wire-run", wire122.id, 25, {
      basePrice: 42500, whileWeThereBasePrice: 18000, publishedPriceApprovedAt: approvedAt,
    });
    const s2 = await serviceUsing(contractor.id, "s2-gfci-unrelated", gfci.id, 1, {
      basePrice: 33300, whileWeThereBasePrice: 12100, publishedPriceApprovedAt: approvedAt,
    });
    // S3 for the package-priced path, kept separate so its own before/after
    // doesn't get tangled with S1/S2's flat-cost assertions.
    const s3 = await serviceUsing(contractor.id, "s3-cat6-run", cat6.id, 100, {
      basePrice: 55500, whileWeThereBasePrice: 0, publishedPriceApprovedAt: approvedAt,
    });

    const wireMaterial = await raw.contractorMaterial.create({
      data: {
        contractorId: contractor.id, canonicalMaterialId: wire122.id,
        unitCostCents: 72, unitCostMilliCents: 72000,
        costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
        // Set here so the read-model precedence check below has something
        // real to prove against, rather than assuming no override exists.
        nameOverride: "Elite's 12/2 (fixture)",
      },
      select: { id: true },
    });
    const gfciMaterial = await raw.contractorMaterial.create({
      data: {
        contractorId: contractor.id, canonicalMaterialId: gfci.id,
        unitCostCents: 2500, unitCostMilliCents: 2500000,
        costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
      },
      select: { id: true },
    });
    await recomputeServiceMaterialCost(raw, s1);
    await recomputeServiceMaterialCost(raw, s2);

    const before1 = await priceSnapshot(s1);
    const before2 = await priceSnapshot(s2);
    ok(`fixture set up: S1 (wire) and S2 (GFCI, unrelated) both have a real material cost`,
      before1.materialCostCents !== null && before2.materialCostCents !== null,
      `S1=${before1.materialCostCents} S2=${before2.materialCostCents}`);

    // ── nameOverride wins in the read model ──────────────────────────────
    const catalogBeforeEdit = await loadMaterialCatalog(raw, contractor.id);
    const wireRow = catalogBeforeEdit.active.find((r) => r.contractorMaterialId === wireMaterial.id);
    ok(`nameOverride wins over the canonical name in the catalog read model`,
      wireRow?.name === "Elite's 12/2 (fixture)", wireRow?.name);

    // ── UNIT-COST PATH ────────────────────────────────────────────────────
    // Independent "using" count, computed the same way the API route does —
    // not by trusting setContractorMaterialCost's own report of itself.
    const usingWireRole = await raw.serviceMaterial.findMany({
      where: { canonicalMaterialId: wire122.id, service: { contractorId: contractor.id } },
      select: { serviceId: true }, distinct: ["serviceId"],
    });
    ok(`independently: exactly one service (S1) uses WIRE_12_2 for this fixture contractor`,
      usingWireRole.length === 1 && usingWireRole[0].serviceId === s1);

    const result = await withContractor(contractor.id, "admin-session", (db) =>
      setContractorMaterialCost(
        db,
        { contractorMaterialId: wireMaterial.id, unitCostCents: 91 },
        { reason: "write-path verification — unit cost", actor: "verifier" }
      )
    );
    ok(`setContractorMaterialCost reports the cost actually changed (72c -> 91c)`,
      result.changed && result.beforeCents === 72 && result.afterCents === 91);
    ok(`...and reports exactly one affected service, which is S1`,
      result.affected.length === 1 && result.affected[0].serviceId === s1 && result.affected[0].changed);

    const after1 = await priceSnapshot(s1);
    const after2 = await priceSnapshot(s2);
    ok(`S1's materialCostCents recomputed to the new cost * quantity (91 * 25 = 2275)`,
      after1.materialCostCents === 2275, `got ${after1.materialCostCents}`);
    ok(`S2 (unrelated service, different role) is byte-for-byte unchanged`,
      after2.materialCostCents === before2.materialCostCents);

    // ── PACKAGE-PRICED PATH ────────────────────────────────────────────────
    const cat6Material = await raw.contractorMaterial.create({
      data: {
        contractorId: contractor.id, canonicalMaterialId: cat6.id,
        unitCostCents: 19, unitCostMilliCents: 18900,
        costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
      },
      select: { id: true },
    });
    await recomputeServiceMaterialCost(raw, s3);
    const before3 = await priceSnapshot(s3);

    const packageBasis = { packagePriceCents: 8900, packageQuantity: 250 };
    const expectedDerived = deriveUnitCost(packageBasis);
    const packageResult = await withContractor(contractor.id, "admin-session", (db) =>
      setContractorMaterialCost(
        db,
        { contractorMaterialId: cat6Material.id, basis: packageBasis, packageUnit: "250 ft roll" },
        { reason: "write-path verification — package cost", actor: "verifier" }
      )
    );
    ok(`package edit derives the same unit cost as deriveUnitCost itself (no parallel math)`,
      packageResult.afterCents === expectedDerived.unitCostCents, `got ${packageResult.afterCents}, expected ${expectedDerived.unitCostCents}`);

    const cat6Row = await raw.contractorMaterial.findUniqueOrThrow({
      where: { id: cat6Material.id },
      select: { unitCostCents: true, unitCostMilliCents: true, packagePriceCents: true, packageQuantity: true, packageUnit: true },
    });
    ok(`stored unitCostCents/unitCostMilliCents match deriveUnitCost's precise output`,
      cat6Row.unitCostCents === expectedDerived.unitCostCents && cat6Row.unitCostMilliCents === expectedDerived.unitCostMilliCents);
    ok(`package price/quantity/unit are stored exactly as entered, not flattened away`,
      cat6Row.packagePriceCents === 8900 && cat6Row.packageQuantity === 250 && cat6Row.packageUnit === "250 ft roll");

    const after3 = await priceSnapshot(s3);
    ok(`S3's materialCostCents recomputed from the package-derived unit cost (${expectedDerived.unitCostCents}c * 100 ft)`,
      after3.materialCostCents === expectedDerived.unitCostCents * 100, `got ${after3.materialCostCents}`);

    // ── CUSTOMER-PRICE GUARD ────────────────────────────────────────────────
    for (const [label, before, after] of [
      ["S1", before1, after1],
      ["S2", before2, after2],
      ["S3", before3, after3],
    ] as const) {
      ok(`${label}: basePrice unchanged by any material-cost edit`, before.basePrice === after.basePrice);
      ok(`${label}: whileWeThereBasePrice unchanged`, before.whileWeThereBasePrice === after.whileWeThereBasePrice);
      ok(`${label}: publishedPriceApprovedAt unchanged`,
        before.publishedPriceApprovedAt?.getTime() === after.publishedPriceApprovedAt?.getTime());
    }
    // And the fields never moved off what THIS script itself set at creation —
    // proving they hold their original, non-null, non-default values throughout.
    ok(`S1's basePrice is still exactly the fixture's original $425.00`, after1.basePrice === 42500);
    ok(`S3's basePrice is still exactly the fixture's original $555.00`, after3.basePrice === 55500);

    // ── FIRST-TIME PRICING (the atomic authority the "create" action now uses) ──
    // WIRE_14_2 is a real, shared platform role this fixture contractor has
    // never priced — no ContractorMaterial row exists for it yet, matching
    // exactly the state a "missing price" catalog row is in.
    const wire142 = await raw.canonicalMaterial.findUniqueOrThrow({
      where: { key: "WIRE_14_2" }, select: { id: true },
    });
    const s4 = await serviceUsing(contractor.id, "s4-wire14-first-price", wire142.id, 10, {
      basePrice: 61000, whileWeThereBasePrice: 0, publishedPriceApprovedAt: approvedAt,
    });
    const before4 = await priceSnapshot(s4);
    const preExisting = await raw.contractorMaterial.findFirst({
      where: { contractorId: contractor.id, canonicalMaterialId: wire142.id },
    });
    ok(`no ContractorMaterial row exists yet for WIRE_14_2 on this fixture contractor`, preExisting === null);

    const firstPrice = await withContractor(contractor.id, "admin-session", (db) =>
      overrideUnresolvedMaterialCost(
        db,
        { contractorId: contractor.id, canonicalMaterialId: wire142.id, unitCostCents: 45 },
        { reason: "write-path verification — first-time pricing", actor: "verifier" }
      )
    );
    ok(`first-time pricing succeeds`, firstPrice.ok === true);
    if (!firstPrice.ok) throw new Error("first-time pricing unexpectedly refused — cannot continue this section");

    ok(`...and reports exactly one affected service, S4`,
      firstPrice.affected.length === 1 && firstPrice.affected[0].serviceId === s4 && firstPrice.affected[0].changed);

    const after4 = await priceSnapshot(s4);
    ok(`S4's materialCostCents recomputed to the new cost * quantity (45 * 10 = 450)`,
      after4.materialCostCents === 450, `got ${after4.materialCostCents}`);

    const rowCount = await raw.contractorMaterial.count({
      where: { contractorId: contractor.id, canonicalMaterialId: wire142.id },
    });
    ok(`exactly one ContractorMaterial row exists for WIRE_14_2 on this contractor`, rowCount === 1, `got ${rowCount}`);

    const eventsForRole = await raw.materialCostEvent.count({
      where: { contractorMaterialId: firstPrice.contractorMaterialId },
    });
    ok(`first-time pricing writes exactly one MaterialCostEvent`, eventsForRole === 1, `got ${eventsForRole}`);

    // ── a second first-time-pricing attempt on the SAME role is refused, not duplicated ──
    const secondAttempt = await withContractor(contractor.id, "admin-session", (db) =>
      overrideUnresolvedMaterialCost(
        db,
        { contractorId: contractor.id, canonicalMaterialId: wire142.id, unitCostCents: 99 },
        { reason: "write-path verification — duplicate first-time attempt", actor: "verifier" }
      )
    );
    ok(`a second first-time-pricing attempt on an already-resolved role is refused`,
      secondAttempt.ok === false && !secondAttempt.ok && secondAttempt.code === "ALREADY_RESOLVED");
    const rowCountAfterSecond = await raw.contractorMaterial.count({
      where: { contractorId: contractor.id, canonicalMaterialId: wire142.id },
    });
    ok(`still exactly one ContractorMaterial row — no duplicate created`, rowCountAfterSecond === 1, `got ${rowCountAfterSecond}`);
    const eventsAfterSecond = await raw.materialCostEvent.count({
      where: { contractorMaterialId: firstPrice.contractorMaterialId },
    });
    ok(`still exactly one MaterialCostEvent — the refused attempt wrote nothing`, eventsAfterSecond === 1, `got ${eventsAfterSecond}`);
    const afterSecond = await priceSnapshot(s4);
    ok(`S4's cost is unchanged by the refused second attempt (still 450, not 99 * 10)`,
      afterSecond.materialCostCents === 450, `got ${afterSecond.materialCostCents}`);

    // ── repricing an already-first-priced role still works normally, via the OTHER authority ──
    const reprice = await withContractor(contractor.id, "admin-session", (db) =>
      setContractorMaterialCost(
        db,
        { contractorMaterialId: firstPrice.contractorMaterialId, unitCostCents: 60 },
        { reason: "write-path verification — reprice after first-time pricing", actor: "verifier" }
      )
    );
    ok(`repricing the just-first-priced role still works normally (45c -> 60c)`,
      reprice.changed && reprice.beforeCents === 45 && reprice.afterCents === 60);
    const eventsAfterReprice = await raw.materialCostEvent.count({
      where: { contractorMaterialId: firstPrice.contractorMaterialId },
    });
    ok(`repricing adds a SECOND event on top of the first-pricing event — two real changes, two events`,
      eventsAfterReprice === 2, `got ${eventsAfterReprice}`);

    // ── ATOMICITY: an injected fault rolls back EVERYTHING, at both fault points ──
    const boxOldWork = await raw.canonicalMaterial.findUniqueOrThrow({
      where: { key: "BOX_OLD_WORK" }, select: { id: true },
    });
    const s5 = await serviceUsing(contractor.id, "s5-box-fault-injection", boxOldWork.id, 4, {
      basePrice: 28000, whileWeThereBasePrice: 0, publishedPriceApprovedAt: approvedAt,
    });
    const before5 = await priceSnapshot(s5);

    let faultAfterCreate: unknown = null;
    try {
      await withContractor(contractor.id, "admin-session", (db) =>
        overrideUnresolvedMaterialCost(
          db,
          { contractorId: contractor.id, canonicalMaterialId: boxOldWork.id, unitCostCents: 210 },
          { reason: "write-path verification — injected fault after create", actor: "verifier" },
          { afterCreate: async () => { throw new Error("injected fault after create — proving atomic rollback"); } }
        )
      );
    } catch (e) {
      faultAfterCreate = e;
    }
    ok(`the fault injected right after the create genuinely propagates`,
      faultAfterCreate instanceof Error && /injected fault/.test((faultAfterCreate as Error).message));
    const rowAfterFault1 = await raw.contractorMaterial.findFirst({
      where: { contractorId: contractor.id, canonicalMaterialId: boxOldWork.id },
    });
    ok(`no ContractorMaterial row survives a fault injected after the create`, rowAfterFault1 === null);
    const after5a = await priceSnapshot(s5);
    ok(`S5's material cache is unaffected by the rolled-back attempt`,
      after5a.materialCostCents === before5.materialCostCents,
      `before=${before5.materialCostCents} after=${after5a.materialCostCents}`);

    let faultAfterRecompute: unknown = null;
    try {
      await withContractor(contractor.id, "admin-session", (db) =>
        overrideUnresolvedMaterialCost(
          db,
          { contractorId: contractor.id, canonicalMaterialId: boxOldWork.id, unitCostCents: 210 },
          { reason: "write-path verification — injected fault after recompute", actor: "verifier" },
          { afterRecompute: async () => { throw new Error("injected fault after recompute — proving atomic rollback"); } }
        )
      );
    } catch (e) {
      faultAfterRecompute = e;
    }
    ok(`the fault injected after the recompute cascade (before the event write) also propagates`,
      faultAfterRecompute instanceof Error && /injected fault/.test((faultAfterRecompute as Error).message));
    const rowAfterFault2 = await raw.contractorMaterial.findFirst({
      where: { contractorId: contractor.id, canonicalMaterialId: boxOldWork.id },
    });
    ok(`still no ContractorMaterial row after the second injected fault`, rowAfterFault2 === null);
    const eventsAfterFaults = await raw.materialCostEvent.count({
      where: { contractorId: contractor.id, contractorMaterial: { canonicalMaterialId: boxOldWork.id } },
    });
    ok(`no MaterialCostEvent survives either injected fault`, eventsAfterFaults === 0, `got ${eventsAfterFaults}`);
    const after5b = await priceSnapshot(s5);
    ok(`S5's material cache is still unaffected after both injected faults`,
      after5b.materialCostCents === before5.materialCostCents);

    // ── the same authority genuinely succeeds once nothing is injected ──
    const cleanAttempt = await withContractor(contractor.id, "admin-session", (db) =>
      overrideUnresolvedMaterialCost(
        db,
        { contractorId: contractor.id, canonicalMaterialId: boxOldWork.id, unitCostCents: 210 },
        { reason: "write-path verification — clean attempt after fault proofs", actor: "verifier" }
      )
    );
    ok(`the same role prices successfully once no fault is injected`, cleanAttempt.ok === true);
    if (cleanAttempt.ok) {
      const after5c = await priceSnapshot(s5);
      ok(`S5 recomputes correctly on the clean attempt (210 * 4 = 840)`,
        after5c.materialCostCents === 840, `got ${after5c.materialCostCents}`);
    }

    // ── read model reflects the edits (sanity close of the loop) ───────────
    const catalogAfterEdit = await loadMaterialCatalog(raw, contractor.id);
    const wireRowAfter = catalogAfterEdit.active.find((r) => r.contractorMaterialId === wireMaterial.id);
    const cat6RowAfter = catalogAfterEdit.active.find((r) => r.contractorMaterialId === cat6Material.id);
    ok(`catalog read model reflects the new unit cost for WIRE_12_2`, wireRowAfter?.unitCostCents === 91);
    ok(`catalog read model reflects the new package-derived unit cost for CABLE_CAT6`,
      cat6RowAfter?.unitCostCents === expectedDerived.unitCostCents);
  } finally {
    console.log(`\n  cleanup, then done\n`);
    await removeFixture();
    const residue = await raw.contractor.count({ where: { slug: SLUG } });
    ok(`fixture contractor and everything under it is gone`, residue === 0);
    await raw.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await raw.$disconnect();
  process.exit(1);
});
