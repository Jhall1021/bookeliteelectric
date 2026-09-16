/**
 * Fresh Electrical launch rehearsal — Phase 2.
 *
 * Runs against the scratch database Phase 1 (scripts/rehearse-fresh-
 * electrical-launch.ts) built and left running — DATABASE_URL must already
 * point at it when this file is invoked (it is imported before anything
 * else, so it must be correct at process start, not set later).
 *
 * Proves the launch-critical route through SUPPORTED setup functions only —
 * never a raw materialCostResolved=true write:
 *
 *   materials/labor -> pricing -> approval -> activation -> manual price
 *
 * on THREE real contractors, each isolating one question:
 *
 *   legacyZeroStructural   dishwasher-electrical — a Batch 2E service whose
 *                          ENTIRE recipe is one policy-quantity material
 *                          (CONSUMABLES_SMALL). Tests whether the real
 *                          onboarding functions (writeMaterialCost, which
 *                          triggers recomputeServiceMaterialCost internally)
 *                          can resolve materialCostResolved here at all.
 *   legacyStructural       replace-standard-outlet — has real structural
 *                          materials (RECEPTACLE_STANDARD, WALL_PLATE)
 *                          alongside its own CONSUMABLES_SMALL allowance.
 *                          Tests whether the SAME real functions succeed
 *                          when at least one structural material exists.
 *   derived                new-120v-outlet under Routing V2
 *                          (DERIVED_RESOLVED_SCOPE) — reuses scripts/
 *                          _derivedStorefrontFixture.ts's own
 *                          buildPricedDerivedContractor exactly as written,
 *                          the same real function this repo's own storefront
 *                          browser-flow suite already exercises.
 *
 * No raw SQL, no direct materialCostResolved/basePrice writes. Where a
 * supported function refuses, that refusal IS the result being tested for —
 * reported precisely, not routed around.
 */
import { PrismaClient } from "@prisma/client";
import { preflight, installCatalog, templateVersionSource } from "../lib/templateProvisioning";
import { writeMaterialCost } from "../lib/admin/onboardingActions";
import { saveServicePricingInputs } from "../lib/servicePricingInputs";
import { publishSuggestedPrice } from "../lib/pricePublication";
import { activateService } from "../lib/serviceActivation";
import { loadServiceForResolution, resolveRoute, loadPricingSettings } from "../lib/routeResolver";
import { buildPricedDerivedContractor, removeFixture, fixtureSlug } from "./_derivedStorefrontFixture";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL || !/127\.0\.0\.1|localhost/.test(DB_URL)) {
  console.error("DATABASE_URL must be set to a loopback scratch database before running this script.");
  process.exit(1);
}

const prisma = new PrismaClient();

let failures = 0;
function ok(cond: unknown, msg: string): void {
  if (cond) console.log(`  ok    ${msg}`);
  else { failures++; console.error(`  FAIL  ${msg}`); }
}

async function bootstrapPlainContractor(slug: string, name: string) {
  const c = await prisma.contractor.create({
    data: { slug, name, active: true, countryCode: "US", trade: "residential electrician" },
    select: { id: true },
  });
  await prisma.contractorSite.create({ data: { contractorId: c.id, hostedSlug: slug, publicId: `site_${Math.random().toString(36).slice(2)}`, active: true } });
  await prisma.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
  await prisma.pricingSettings.create({
    data: { contractorId: c.id, crewHourRateCents: 25000, primaryMinimumCents: 25000, roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
  });
  const pf = await preflight(prisma, c.id, templateVersionSource(prisma, "electrical"));
  if (!pf.ok) throw new Error(`preflight refused: ${pf.message}`);
  const result = await installCatalog(prisma, c.id, pf.catalog);
  console.log(`  installed ${result.services} services, ${result.unresolvedMaterialRoles} material role(s) unresolved`);
  return c.id;
}

async function removePlainContractor(slug: string) {
  const c = await prisma.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  await prisma.visit.deleteMany({ where: { contractorId: c.id } });
  await prisma.guidedFlowSession.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await prisma.contractorSite.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorTrade.deleteMany({ where: { contractorId: c.id } });
  await prisma.answerOption.deleteMany({ where: { question: { service: { contractorId: c.id } } } });
  await prisma.question.deleteMany({ where: { service: { contractorId: c.id } } });
  await prisma.serviceMaterial.deleteMany({ where: { service: { contractorId: c.id } } });
  await prisma.service.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorMaterial.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorComponent.deleteMany({ where: { contractorId: c.id } });
  await prisma.pricingSettings.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractor.delete({ where: { id: c.id } });
}

/**
 * Walks ONE legacy service through the real onboarding functions and
 * reports exactly how far it gets — success or a named, specific refusal,
 * never forced.
 */
async function walkLegacyService(contractorId: string, slug: string, materials: { roleKey: string; packagePriceCents: number; packageQuantity: number; packageUnit: string }[], fieldLaborHours: number) {
  const svc = await prisma.service.findFirstOrThrow({ where: { contractorId, slug } });
  console.log(`\n  --- ${slug} ---`);
  console.log(`  unresolvedMaterialKeys before: ${JSON.stringify(svc.unresolvedMaterialKeys)}`);

  for (const m of materials) {
    const r = await writeMaterialCost(prisma, { contractorId }, m);
    if (!r.ok) { console.log(`  writeMaterialCost(${m.roleKey}) REFUSED: ${JSON.stringify(r)}`); }
  }

  const afterCosts = await prisma.service.findUniqueOrThrow({ where: { id: svc.id } });
  console.log(`  materialCostResolved after writeMaterialCost: ${afterCosts.materialCostResolved} (materialCostCents=${afterCosts.materialCostCents}, unresolvedMaterialKeys=${JSON.stringify(afterCosts.unresolvedMaterialKeys)})`);

  await saveServicePricingInputs(prisma, svc.id, { fieldLaborHours });

  const published = await publishSuggestedPrice(prisma, contractorId, svc.id);
  console.log(`  publishSuggestedPrice: ${JSON.stringify(published)}`);

  if (!published.ok) {
    return { slug, materialCostResolved: afterCosts.materialCostResolved, published, activated: false };
  }

  const activated = await activateService(prisma, contractorId, svc.id);
  console.log(`  activateService: ${JSON.stringify(activated)}`);

  return { slug, materialCostResolved: afterCosts.materialCostResolved, published, activated: activated.ok };
}

async function main() {
  console.log(`Phase 2 — against ${DB_URL}\n`);

  console.log("=== legacyZeroStructural: dishwasher-electrical ===");
  const zeroId = await bootstrapPlainContractor("__freshlaunch-legacy-zero__", "Fresh Launch Rehearsal (zero-structural)");
  try {
    const r = await walkLegacyService(zeroId, "dishwasher-electrical", [
      { roleKey: "CONSUMABLES_SMALL", packagePriceCents: 300, packageQuantity: 1, packageUnit: "each" },
    ], 1.0);
    ok(r.materialCostResolved === true, "dishwasher-electrical: materialCostResolved reached true via the real, supported writeMaterialCost path alone (zero structural materials)");
    ok(r.published.ok === true, "dishwasher-electrical: publishSuggestedPrice succeeded");
    ok(r.activated === true, "dishwasher-electrical: activateService succeeded");
  } finally {
    await removePlainContractor("__freshlaunch-legacy-zero__");
  }

  console.log("\n=== legacyStructural: replace-standard-outlet ===");
  const structId = await bootstrapPlainContractor("__freshlaunch-legacy-struct__", "Fresh Launch Rehearsal (structural)");
  try {
    // replace-standard-outlet's own device_replacement_reason question has a
    // real REROUTE_TROUBLESHOOTING branch to electrical-troubleshooting —
    // activateService correctly refuses DEPENDENCY_UNAVAILABLE until that
    // reroute target is live too (lib/serviceActivation.ts's own ordering
    // rule). electrical-troubleshooting is a REMOTE_QUOTE, no-tree service
    // (prisma/seed-content-fixes.ts already gives it a real $249 published
    // price), so it needs no materials of its own — just activation, the
    // same real function, called first.
    const diag = await prisma.service.findFirstOrThrow({ where: { contractorId: structId, slug: "electrical-troubleshooting" } });
    // prisma/seed-content-fixes.ts deliberately sets no fieldLaborHours or
    // basePrice for this service — its own comment says that approval
    // "happens in the admin, or in one explicit reconciliation migration.
    // Not here." A fresh contractor genuinely has to set this themselves;
    // 1.0h matches the service's own "up to an hour" description.
    await saveServicePricingInputs(prisma, diag.id, { fieldLaborHours: 1.0 });
    const diagPublished = await publishSuggestedPrice(prisma, structId, diag.id);
    console.log(`  electrical-troubleshooting publishSuggestedPrice (dependency): ${JSON.stringify(diagPublished)}`);
    const diagActivated = await activateService(prisma, structId, diag.id);
    console.log(`  electrical-troubleshooting activateService (dependency): ${JSON.stringify(diagActivated)}`);
    ok(diagActivated.ok === true, "electrical-troubleshooting: activates via the real activateService path (no materials of its own)");

    const r = await walkLegacyService(structId, "replace-standard-outlet", [
      { roleKey: "RECEPTACLE_STANDARD", packagePriceCents: 200, packageQuantity: 1, packageUnit: "each" },
      { roleKey: "WALL_PLATE", packagePriceCents: 100, packageQuantity: 1, packageUnit: "each" },
      { roleKey: "CONSUMABLES_SMALL", packagePriceCents: 300, packageQuantity: 1, packageUnit: "each" },
    ], 0.5);
    ok(r.materialCostResolved === true, "replace-standard-outlet: materialCostResolved reached true via the real, supported writeMaterialCost path (has structural materials)");
    ok(r.published.ok === true, "replace-standard-outlet: publishSuggestedPrice succeeded");
    ok(r.activated === true, "replace-standard-outlet: activateService succeeded");

    if (r.published.ok) {
      const loaded = await loadServiceForResolution(prisma, (await prisma.service.findFirstOrThrow({ where: { contractorId: structId, slug: "replace-standard-outlet" } })).id);
      const settings = await loadPricingSettings(prisma, structId);
      const priced = resolveRoute(loaded!, { device_replacement_reason: "works_upgrading" }, true, settings);
      console.log(`  manual homeowner price (works_upgrading): ${JSON.stringify(priced)}`);
      ok(priced.status === "PRICED", "replace-standard-outlet: a real customer answer path prices through the real resolver");
    }
  } finally {
    await removePlainContractor("__freshlaunch-legacy-struct__");
  }

  console.log("\n=== derived: new-120v-outlet under Routing V2 (reusing the real, proven fixture builder) ===");
  const derivedSlug = fixtureSlug("freshlaunch");
  try {
    try {
      const built = await buildPricedDerivedContractor(prisma, derivedSlug, "FLAT_RATE");
      ok(built.approvedTotalCents !== null, `new-120v-outlet: DERIVED_RESOLVED_SCOPE approved at $${((built.approvedTotalCents ?? 0) / 100).toFixed(2)} via the real decideDerivedPricingApproval path`);
      const svc = await prisma.service.findUniqueOrThrow({ where: { id: built.serviceId } });
      ok(svc.active === true, "new-120v-outlet: activated via the real activateService path");
    } catch (e) {
      // A real, precise, UNRESOLVED finding — reported, not routed around.
      // scripts/_derivedStorefrontFixture.ts (an existing, otherwise-proven
      // fixture other suites rely on) refuses against this run's freshly-
      // extracted catalog with NOT_READY_TO_APPROVE / NO_CONTRACTOR_PRODUCT
      // (SURFACE_RACEWAY_JOINT). Diagnosed as far as this run went: the
      // ContractorMaterial row for that role IS created correctly (real
      // packageQuantity/packagePriceCents, confirmed by direct query — not
      // a missing-cost gap), and zero CanonicalComponentMaterial rows
      // reference the role at all — so the requirement is not a component-
      // recipe line but lib/electrical/materialTakeoff.ts's own SEGMENTATION-
      // based joint calculation, which this run did not have time to trace
      // to its root cause. Resolving all three of new-120v-outlet's
      // TemplatePolicyDefinition-backed policies (including surface_raceway.
      // offcut_reuse, which the shared fixture itself never resolves — a
      // second, separate real gap this run's fresh extraction surfaced)
      // does not clear it. NOT fixed here, NOT routed around with an
      // invented approval — reported precisely as UNPROVEN for this run.
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  UNRESOLVED — buildPricedDerivedContractor refused against the freshly-extracted catalog: ${msg}`);

      const c = await prisma.contractor.findUnique({ where: { slug: derivedSlug }, select: { id: true } });
      if (c) {
        const jointMaterial = await prisma.canonicalMaterial.findUnique({ where: { key: "SURFACE_RACEWAY_JOINT" } });
        const jointCost = jointMaterial ? await prisma.contractorMaterial.findFirst({ where: { contractorId: c.id, canonicalMaterialId: jointMaterial.id } }) : null;
        const recipeLines = jointMaterial ? await prisma.canonicalComponentMaterial.findMany({
          where: { canonicalMaterialId: jointMaterial.id }, include: { canonicalComponent: { select: { key: true } } },
        }) : [];
        console.log(`  diagnostic — ContractorMaterial row for SURFACE_RACEWAY_JOINT: ${JSON.stringify(jointCost)}`);
        console.log(`  diagnostic — canonical components whose recipe consumes it: ${JSON.stringify(recipeLines.map((r) => r.canonicalComponent.key))}`);
      }
      failures++;
      console.error(`  FAIL  new-120v-outlet: the launch-critical DERIVED_RESOLVED_SCOPE route could not be proven through the existing fixture-builder function against this run's fresh catalog (see log above for the full diagnostic trail)`);
    }
  } finally {
    await removeFixture(prisma, derivedSlug);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
