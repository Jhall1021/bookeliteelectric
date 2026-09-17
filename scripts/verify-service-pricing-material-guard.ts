/**
 * Manual service pricing must never overwrite an itemized recipe's derived
 * material total — the guard added to lib/servicePricingInputs.ts's
 * saveServicePricingInputs().
 *
 *   npx tsx scripts/verify-service-pricing-material-guard.ts
 *
 * WHY THIS EXISTS
 *
 * Once a service is itemized (>=1 ServiceMaterial recipe line),
 * Service.materialCostCents is DERIVED — owned exclusively by
 * lib/materialCost.ts's recomputeServiceMaterialCost, off
 * lib/materialResolution.ts's requiredRolesFor/assessMaterialReadiness (the
 * repository's one existing definition of a service's recipe and its
 * readiness). saveServicePricingInputs is the shared authority BOTH the
 * pricing form's "save" and "publish" actions call — before this guard, it
 * would silently accept and store a hand-typed materialCostCents on an
 * itemized service, overwriting the recipe-derived figure with no recipe
 * change behind it.
 *
 * Proves, on disposable fixtures only, through the same guarded
 * `withContractor` door every admin route uses:
 *
 *   1. a non-itemized service's material allowance still saves normally
 *   2. an itemized service refuses a manual materialCostCents write, with a
 *      stable ServicePricingInputError code
 *   3. that refusal is BEFORE any write — every other field in the SAME
 *      call is also left untouched, not partially saved
 *   4. the recipe-driven path (recomputeServiceMaterialCost) still updates
 *      the cached total normally — the guard blocks the MANUAL path only
 *   5. tenant isolation is unchanged — the guard's own read, and the
 *      update it gates, both still run inside whatever tenant context the
 *      caller's client carries
 *   6. wantsMaterialCostWrite (the pricing route's own key-presence
 *      contract — app/api/admin/services/[serviceId]/pricing/route.ts) is
 *      false for a body that never mentions materialCostCents and true
 *      whenever it does, value or explicit null alike
 *   7. simulating the FIXED route's body -> overrides mapping for a request
 *      that never mentions materialCostCents against a real itemized
 *      fixture succeeds and leaves the derived total untouched — proving
 *      the compatibility fix, not just the original guard: before it, this
 *      exact body shape still produced an overrides object with the key
 *      present (as an implied null) and would have been refused
 *
 * FIXTURES ONLY. Everything this script creates is torn down in a
 * `finally`, whether checks pass or the run throws. WIRE_12_2 is a real,
 * shared platform canonical role — this script never creates, deletes or
 * mutates it; it only adds and removes its OWN ContractorMaterial/Service
 * rows.
 */
import { PrismaClient } from "@prisma/client";
import { withContractor } from "../lib/tenantRoute";
import {
  saveServicePricingInputs,
  ServicePricingInputError,
  wantsMaterialCostWrite,
  type ServicePricingInputOverrides,
} from "../lib/servicePricingInputs";
import { recomputeServiceMaterialCost } from "../lib/materialCost";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_A = `test-pricing-material-guard-a-${RUN}`;
const SLUG_B = `test-pricing-material-guard-b-${RUN}`;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => {
  if (!c) fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`);
};

async function removeFixture(slug: string) {
  const c = await raw.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  await raw.materialCostEvent.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractorMaterial.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractor.delete({ where: { id: c.id } }).catch(() => {});
}

async function main() {
  console.log(`\nSERVICE PRICING — MATERIAL COST GUARD (disposable fixtures only)\n`);
  await removeFixture(SLUG_A);
  await removeFixture(SLUG_B);

  try {
    const wire122 = await raw.canonicalMaterial.findUniqueOrThrow({
      where: { key: "WIRE_12_2" }, select: { id: true },
    });
    const cat = await raw.serviceCategory.findFirstOrThrow({ select: { id: true } });

    const contractorA = await raw.contractor.create({
      data: { slug: SLUG_A, name: "Pricing Material Guard Fixture A", active: false },
      select: { id: true },
    });

    // ── S1: NOT itemized — a hand-entered material allowance is legitimate ──
    const { id: s1 } = await raw.service.create({
      data: {
        contractorId: contractorA.id, categoryId: cat.id,
        slug: "s1-not-itemized", name: "s1-not-itemized",
        bookingType: "INSTANT", photoState: "NONE",
        fieldLaborHours: 1, materialCostCents: 500,
      },
      select: { id: true },
    });

    // ── S2: itemized — its material total is derived, never hand-set ──
    const cm = await raw.contractorMaterial.create({
      data: {
        contractorId: contractorA.id, canonicalMaterialId: wire122.id,
        unitCostCents: 72, unitCostMilliCents: 72000,
        costSource: "CUSTOM", costConfidence: "CONFIRMED", costStatus: "OK",
      },
      select: { id: true },
    });
    const { id: s2 } = await raw.service.create({
      data: {
        contractorId: contractorA.id, categoryId: cat.id,
        slug: "s2-itemized", name: "s2-itemized",
        bookingType: "INSTANT", photoState: "NONE",
        fieldLaborHours: 1, materialCostCents: 1800,
        materials: { create: [{ canonicalMaterialId: wire122.id, quantity: 25, order: 0 }] },
      },
      select: { id: true },
    });
    await recomputeServiceMaterialCost(raw, s2);
    const s2Before = await raw.service.findUniqueOrThrow({
      where: { id: s2 }, select: { materialCostCents: true, fieldLaborHours: true, permitAdminCents: true },
    });
    ok(`fixture S2 starts itemized and resolved (72c * 25 = 1800)`,
      s2Before.materialCostCents === 1800, `got ${s2Before.materialCostCents}`);

    // ── 1. non-itemized: material allowance still saves normally ──────────
    const s1Result = await withContractor(contractorA.id, "admin-session", (db) =>
      saveServicePricingInputs(db, s1, { materialCostCents: 900, fieldLaborHours: 2 })
    );
    ok(`1. non-itemized service: saveServicePricingInputs succeeds`, s1Result.id === s1);
    const s1After = await raw.service.findUniqueOrThrow({
      where: { id: s1 }, select: { materialCostCents: true, fieldLaborHours: true },
    });
    ok(`   ...and the hand-entered material allowance is stored (900c)`,
      s1After.materialCostCents === 900, `got ${s1After.materialCostCents}`);
    ok(`   ...alongside the other submitted field (fieldLaborHours = 2)`,
      s1After.fieldLaborHours === 2, `got ${s1After.fieldLaborHours}`);

    // ── 1b. non-itemized: clearing the allowance (explicit null) also still works ──
    await withContractor(contractorA.id, "admin-session", (db) =>
      saveServicePricingInputs(db, s1, { materialCostCents: null })
    );
    const s1Cleared = await raw.service.findUniqueOrThrow({ where: { id: s1 }, select: { materialCostCents: true } });
    ok(`1b. non-itemized service: an explicit null still clears the allowance`,
      s1Cleared.materialCostCents === null, `got ${s1Cleared.materialCostCents}`);

    // ── 2. itemized: a manual materialCostCents write is refused ──────────
    let refusal: unknown = null;
    try {
      await withContractor(contractorA.id, "admin-session", (db) =>
        saveServicePricingInputs(db, s2, { materialCostCents: 999999, fieldLaborHours: 3, permitAdminCents: 500 })
      );
    } catch (e) {
      refusal = e;
    }
    ok(`2. itemized service: the call throws`, refusal instanceof Error);
    ok(`   ...specifically ServicePricingInputError`, refusal instanceof ServicePricingInputError);
    ok(`   ...with the stable code ITEMIZED_MATERIAL_COST_LOCKED`,
      refusal instanceof ServicePricingInputError && refusal.code === "ITEMIZED_MATERIAL_COST_LOCKED",
      refusal instanceof ServicePricingInputError ? refusal.code : String(refusal));

    // ── 2b. an explicit null against an itemized service is refused too — clearing IS overwriting ──
    let nullRefusal: unknown = null;
    try {
      await withContractor(contractorA.id, "admin-session", (db) =>
        saveServicePricingInputs(db, s2, { materialCostCents: null })
      );
    } catch (e) {
      nullRefusal = e;
    }
    ok(`2b. itemized service: an explicit null for materialCostCents is refused too`,
      nullRefusal instanceof ServicePricingInputError && nullRefusal.code === "ITEMIZED_MATERIAL_COST_LOCKED");

    // ── 3. the refusal leaves EVERYTHING from that call untouched, not partially saved ──
    const s2After = await raw.service.findUniqueOrThrow({
      where: { id: s2 }, select: { materialCostCents: true, fieldLaborHours: true, permitAdminCents: true },
    });
    ok(`3. materialCostCents is byte-for-byte unchanged (still 1800, not 999999)`,
      s2After.materialCostCents === 1800, `got ${s2After.materialCostCents}`);
    ok(`   ...fieldLaborHours from the SAME refused call is also unchanged (still 1, not 3)`,
      s2After.fieldLaborHours === s2Before.fieldLaborHours, `got ${s2After.fieldLaborHours}`);
    ok(`   ...permitAdminCents from the SAME refused call is also unchanged`,
      s2After.permitAdminCents === s2Before.permitAdminCents, `got ${s2After.permitAdminCents}`);

    // ── 2c. a call that never mentions materialCostCents at all is unaffected by the guard ──
    const s2NoMaterialField = await withContractor(contractorA.id, "admin-session", (db) =>
      saveServicePricingInputs(db, s2, { fieldLaborHours: 4 })
    );
    ok(`2c. an itemized service's OTHER fields still save normally when materialCostCents is not in the request at all`,
      s2NoMaterialField.id === s2);
    const s2AfterOtherField = await raw.service.findUniqueOrThrow({
      where: { id: s2 }, select: { materialCostCents: true, fieldLaborHours: true },
    });
    ok(`   ...fieldLaborHours updated (1 -> 4)`, s2AfterOtherField.fieldLaborHours === 4, `got ${s2AfterOtherField.fieldLaborHours}`);
    ok(`   ...materialCostCents still untouched (still 1800)`,
      s2AfterOtherField.materialCostCents === 1800, `got ${s2AfterOtherField.materialCostCents}`);

    // ── 4. the recipe-driven path still updates the cached total normally ──
    const repriced = await raw.contractorMaterial.update({
      where: { id: cm.id }, data: { unitCostCents: 100, unitCostMilliCents: 100000 },
      select: { id: true },
    });
    ok(`   (setup) the fixture's ContractorMaterial cost was actually changed (72c -> 100c)`, !!repriced.id);
    const recomputeResult = await recomputeServiceMaterialCost(raw, s2);
    ok(`4. recomputeServiceMaterialCost (the recipe-driven path) is NOT blocked by this guard`,
      recomputeResult !== null && recomputeResult.changed);
    const s2AfterRecompute = await raw.service.findUniqueOrThrow({ where: { id: s2 }, select: { materialCostCents: true } });
    ok(`   ...and the cached total updates correctly (100c * 25 = 2500)`,
      s2AfterRecompute.materialCostCents === 2500, `got ${s2AfterRecompute.materialCostCents}`);

    // ── 5. tenant isolation is unchanged — a foreign contractor cannot reach S2 through this path ──
    const contractorB = await raw.contractor.create({
      data: { slug: SLUG_B, name: "Pricing Material Guard Fixture B", active: false },
      select: { id: true },
    });
    let crossTenantOutcome: unknown = null;
    try {
      await withContractor(contractorB.id, "admin-session", (db) =>
        saveServicePricingInputs(db, s2, { fieldLaborHours: 9 })
      );
      crossTenantOutcome = "no-throw";
    } catch (e) {
      crossTenantOutcome = e;
    }
    ok(`5. a DIFFERENT contractor's guarded client cannot update S1's owner's service through saveServicePricingInputs`,
      crossTenantOutcome !== "no-throw",
      crossTenantOutcome === "no-throw" ? "the call succeeded — cross-tenant write was NOT refused" : String(crossTenantOutcome));
    const s2AfterCrossTenantAttempt = await raw.service.findUniqueOrThrow({ where: { id: s2 }, select: { fieldLaborHours: true } });
    ok(`   ...and S2's fieldLaborHours is unchanged by the refused cross-tenant attempt (still 4, not 9)`,
      s2AfterCrossTenantAttempt.fieldLaborHours === 4, `got ${s2AfterCrossTenantAttempt.fieldLaborHours}`);

    // ── 6. wantsMaterialCostWrite — the route's own key-presence contract ──
    // (app/api/admin/services/[serviceId]/pricing/route.ts). PricingPanel's
    // itemized branch now omits the key from its request body entirely; the
    // route must forward that absence into overrides faithfully rather than
    // collapsing "absent" and "explicit null" into the same thing the way it
    // used to. Pure function, no DB or fixtures involved.
    ok(`6. wantsMaterialCostWrite: a body without the key -> false`,
      wantsMaterialCostWrite({ fieldLaborHours: 5 }) === false);
    ok(`   ...a body with a real value -> true`,
      wantsMaterialCostWrite({ materialCostCents: 500 }) === true);
    ok(`   ...a body with an explicit null -> true (clearing IS an attempt)`,
      wantsMaterialCostWrite({ materialCostCents: null }) === true);

    // ── 7. end-to-end simulation of the FIXED route for a real itemized fixture ──
    // Builds `overrides` exactly the way the route now does — via
    // wantsMaterialCostWrite, not an unconditional assignment — for a body
    // that never mentions materialCostCents (what PricingPanel's itemized
    // branch actually sends). Before the route fix, this exact body shape
    // still produced an overrides object with the key present (as an
    // implied null), so this call would have been refused even though the
    // request never touched material cost at all.
    const simulatedItemizedBody: Record<string, unknown> = { fieldLaborHours: 7 };
    const simulatedOverrides: ServicePricingInputOverrides = { fieldLaborHours: 7 };
    if (wantsMaterialCostWrite(simulatedItemizedBody)) {
      simulatedOverrides.materialCostCents = 999999; // would only run on a regression
    }
    const s2RouteSimResult = await withContractor(contractorA.id, "admin-session", (db) =>
      saveServicePricingInputs(db, s2, simulatedOverrides)
    );
    ok(`7. route-simulated save (body omits the key) succeeds for the itemized fixture`,
      s2RouteSimResult.id === s2);
    const s2AfterRouteSim = await raw.service.findUniqueOrThrow({
      where: { id: s2 }, select: { fieldLaborHours: true, materialCostCents: true },
    });
    ok(`   ...fieldLaborHours updated (4 -> 7)`, s2AfterRouteSim.fieldLaborHours === 7, `got ${s2AfterRouteSim.fieldLaborHours}`);
    ok(`   ...materialCostCents still untouched (still 2500)`,
      s2AfterRouteSim.materialCostCents === 2500, `got ${s2AfterRouteSim.materialCostCents}`);
  } finally {
    console.log(`\n  cleanup, then done\n`);
    await removeFixture(SLUG_A);
    await removeFixture(SLUG_B);
    const residueA = await raw.contractor.count({ where: { slug: SLUG_A } });
    const residueB = await raw.contractor.count({ where: { slug: SLUG_B } });
    ok(`both fixture contractors and everything under them are gone`, residueA === 0 && residueB === 0);
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
