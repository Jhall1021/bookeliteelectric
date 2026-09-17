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
 * canonical roles it reuses (WIRE_12_2, GFCI_WEATHER_RESISTANT, CABLE_CAT6)
 * are real, shared, platform catalog entries — this script never creates,
 * deletes, or mutates them; it only adds and removes ITS OWN
 * ContractorMaterial rows against them.
 */
import { PrismaClient } from "@prisma/client";
import { withContractor } from "../lib/tenantRoute";
import { setContractorMaterialCost, deriveUnitCost, recomputeServiceMaterialCost } from "../lib/materialCost";
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
