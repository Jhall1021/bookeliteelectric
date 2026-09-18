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
import { declarePolicyMaterialQuantity } from "../lib/materialCost";
import { resolvePolicy } from "../lib/policyResolution";
import { saveServicePricingInputs } from "../lib/servicePricingInputs";
import { publishSuggestedPrice } from "../lib/pricePublication";
import { activateService } from "../lib/serviceActivation";
import { loadServiceForResolution, resolveRoute, loadPricingSettings } from "../lib/routeResolver";
import { buildPricedDerivedContractor, removeFixture, fixtureSlug } from "./_derivedStorefrontFixture";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL must be set to Phase 1's scratch database before running this script.");
  process.exit(1);
}
// Parsed host, matching the pattern the naive regex here used to duplicate,
// plus the stamped-identity check the regex never had — same authority
// scripts/rehearse-fresh-electrical-launch.ts itself now checks with, so a
// DATABASE_URL pointed at some OTHER loopback Postgres (one never stamped
// "local-*" by this run) is refused here too, not just trusted because the
// host looks right.
const DB_NAME = DB_URL.replace(/^.*\//, "").replace(/\?.*$/, "");

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
 * Declare a contractor's own quantity for a policy-quantity role on ONE
 * service, by role KEY (this script's own convention throughout) rather than
 * canonical id — a thin wrapper over lib/materialCost.ts's
 * declarePolicyMaterialQuantity, the one real place this write happens
 * (shared with scripts/_derivedStorefrontFixture.ts and, in spirit, the
 * admin "quantity" action).
 */
async function declarePolicyQuantity(serviceId: string, roleKey: string, quantity: number) {
  const role = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: roleKey } });
  return declarePolicyMaterialQuantity(prisma, serviceId, role.id, quantity);
}

/** Independently recomputed from the raw rows, to check the engine's own total against. */
async function expectedMaterialTotalCents(serviceId: string, contractorId: string): Promise<number> {
  const rows = await prisma.serviceMaterial.findMany({
    where: { serviceId }, select: { quantity: true, canonicalMaterialId: true } });
  let total = 0;
  for (const r of rows) {
    if (r.quantity === null || !r.canonicalMaterialId) {
      throw new Error("expectedMaterialTotalCents: an undeclared policy quantity remains — the service is not actually resolved.");
    }
    const cm = await prisma.contractorMaterial.findFirstOrThrow({
      where: { contractorId, canonicalMaterialId: r.canonicalMaterialId } });
    total += Math.round(cm.unitCostCents * r.quantity);
  }
  return total;
}

/**
 * Walks ONE legacy service through the real onboarding functions and
 * reports exactly how far it gets — success or a named, specific refusal,
 * never forced.
 *
 * `policyQuantities` are declared AFTER every cost is entered and BEFORE
 * anything downstream — proving the order the earlier report got backwards:
 * a policy role's cost being entered is not the same as its quantity being
 * declared, and readiness must refuse on the second gap exactly as it does
 * on the first, not report ready because a cost happened to land.
 */
async function walkLegacyService(
  contractorId: string, slug: string,
  materials: { roleKey: string; packagePriceCents: number; packageQuantity: number; packageUnit: string }[],
  policyQuantities: { roleKey: string; quantity: number }[],
  fieldLaborHours: number,
) {
  const svc = await prisma.service.findFirstOrThrow({ where: { contractorId, slug } });
  console.log(`\n  --- ${slug} ---`);
  console.log(`  unresolvedMaterialKeys before: ${JSON.stringify(svc.unresolvedMaterialKeys)}`);

  for (const m of materials) {
    const r = await writeMaterialCost(prisma, { contractorId }, m);
    if (!r.ok) { console.log(`  writeMaterialCost(${m.roleKey}) REFUSED: ${JSON.stringify(r)}`); }
  }

  const afterCosts = await prisma.service.findUniqueOrThrow({ where: { id: svc.id } });
  console.log(`  materialCostResolved after every cost entered, BEFORE any policy quantity declared: ${afterCosts.materialCostResolved} (materialCostCents=${afterCosts.materialCostCents}, unresolvedMaterialKeys=${JSON.stringify(afterCosts.unresolvedMaterialKeys)})`);
  const stillBlockedOnQuantity = policyQuantities.length > 0 && afterCosts.materialCostResolved === false
    && policyQuantities.every((p) => afterCosts.unresolvedMaterialKeys.includes(p.roleKey));
  if (policyQuantities.length > 0) {
    ok(stillBlockedOnQuantity, `${slug}: every cost entered but a policy quantity still undeclared correctly blocks readiness (no silent "ready" on an unset allowance)`);
  }

  for (const p of policyQuantities) {
    const recompute = await declarePolicyQuantity(svc.id, p.roleKey, p.quantity);
    console.log(`  declared ${p.roleKey} quantity=${p.quantity}: ${JSON.stringify(recompute)}`);
  }

  const afterQuantities = await prisma.service.findUniqueOrThrow({ where: { id: svc.id } });
  console.log(`  materialCostResolved after policy quantities declared: ${afterQuantities.materialCostResolved} (materialCostCents=${afterQuantities.materialCostCents}, unresolvedMaterialKeys=${JSON.stringify(afterQuantities.unresolvedMaterialKeys)})`);
  if (afterQuantities.materialCostResolved) {
    const expected = await expectedMaterialTotalCents(svc.id, contractorId);
    ok(afterQuantities.materialCostCents === expected,
      `${slug}: materialCostCents ($${((afterQuantities.materialCostCents ?? 0) / 100).toFixed(2)}) equals every role's cost x declared quantity summed once, including the policy role(s) — no silent omission ($${(expected / 100).toFixed(2)} expected)`);
  }

  await saveServicePricingInputs(prisma, svc.id, { fieldLaborHours });

  const published = await publishSuggestedPrice(prisma, contractorId, svc.id);
  console.log(`  publishSuggestedPrice: ${JSON.stringify(published)}`);

  if (!published.ok) {
    return { slug, materialCostResolved: afterQuantities.materialCostResolved, published, activated: false };
  }

  const activated = await activateService(prisma, contractorId, svc.id);
  console.log(`  activateService: ${JSON.stringify(activated)}`);

  return { slug, materialCostResolved: afterQuantities.materialCostResolved, published, activated: activated.ok };
}

/**
 * Launch "Dedicated Circuit & Outlet" through the real supported lifecycle —
 * a real prerequisite for both dishwasher-electrical (a fixed appliance load
 * always reroutes here) and, on a different branch, new-120v-outlet's own
 * FLAT_RATE dependency (scripts/_derivedStorefrontFixture.ts carries its own
 * identical copy of this, since that fixture's contractor is built by a
 * different function). Same real figures both places: 50 ft is the
 * service's own documented standard-run allowance (prisma/seed-dedicated-
 * circuit.ts: "POLICY[dedicated_circuit.standard_run_ft]: 50"), 1 job
 * matches CONSUMABLES_MEDIUM's own package unit, [30, 60] is the real
 * panel_circuit_run.breakpoints boundary scripts/onboard-contractor-two.ts
 * already uses, and 2.5 crew-hours is Elite's own figure for this service.
 */
async function launchDedicatedCircuitDependency(contractorId: string) {
  const dedicated = await prisma.service.findFirstOrThrow({ where: { contractorId, slug: "dedicated-120v-circuit-outlet" } });
  await resolvePolicy(prisma, contractorId, "panel_circuit_run.breakpoints", { boundaries: [30, 60] });
  for (const m of [
    { roleKey: "WIRE_14_2", packagePriceCents: 50, packageQuantity: 1, packageUnit: "ft" },
    { roleKey: "BREAKER_SINGLE_POLE", packagePriceCents: 800, packageQuantity: 1, packageUnit: "each" },
    { roleKey: "WALL_PLATE", packagePriceCents: 100, packageQuantity: 1, packageUnit: "each" },
    { roleKey: "RECEPTACLE_STANDARD", packagePriceCents: 200, packageQuantity: 1, packageUnit: "each" },
    { roleKey: "BOX_OLD_WORK", packagePriceCents: 300, packageQuantity: 1, packageUnit: "each" },
    { roleKey: "CONSUMABLES_MEDIUM", packagePriceCents: 700, packageQuantity: 1, packageUnit: "job" },
  ]) {
    const r = await writeMaterialCost(prisma, { contractorId }, m);
    if (!r.ok) throw new Error(`dedicated-120v-circuit-outlet cost ${m.roleKey}: ${r.error}`);
  }
  await declarePolicyQuantity(dedicated.id, "WIRE_14_2", 50);
  await declarePolicyQuantity(dedicated.id, "CONSUMABLES_MEDIUM", 1);
  await saveServicePricingInputs(prisma, dedicated.id, { fieldLaborHours: 2.5 });
  const published = await publishSuggestedPrice(prisma, contractorId, dedicated.id);
  if (!published.ok) throw new Error(`dedicated-120v-circuit-outlet publish refused: ${JSON.stringify(published.refusal)}`);
  const activated = await activateService(prisma, contractorId, dedicated.id);
  if (!activated.ok) throw new Error(`dedicated-120v-circuit-outlet activation refused: ${JSON.stringify(activated)}`);
  console.log(`  dedicated-120v-circuit-outlet: launched as a prerequisite (published $${(published.basePrice / 100).toFixed(2)})`);
}

async function main() {
  console.log(`Phase 2 — against scratch database "${DB_NAME}"\n`);
  await assertDisposableLocalDatabase(prisma);

  console.log("=== legacyZeroStructural: dishwasher-electrical ===");
  try {
    // Bootstrap INSIDE the try — a failure partway through creating this
    // contractor (installCatalog throws after the row exists, say) used to
    // leave an orphaned row with no cleanup, since the finally below only
    // ran for failures inside the walk that followed. Ownership starts the
    // moment the row can exist, not once setup finishes.
    const zeroId = await bootstrapPlainContractor("__freshlaunch-legacy-zero__", "Fresh Launch Rehearsal (zero-structural)");
    // dishwasher-electrical's own fixed-appliance load always reroutes to
    // Dedicated Circuit & Outlet — activateService correctly refuses
    // DEPENDENCY_UNAVAILABLE until that reroute target is live too, same
    // ordering rule as replace-standard-outlet's electrical-troubleshooting
    // dependency below.
    await launchDedicatedCircuitDependency(zeroId);
    const svc = await prisma.service.findFirstOrThrow({ where: { contractorId: zeroId, slug: "dishwasher-electrical" } });
    const r = await walkLegacyService(zeroId, "dishwasher-electrical", [
      { roleKey: "CONSUMABLES_SMALL", packagePriceCents: 300, packageQuantity: 1, packageUnit: "each" },
    ], [
      { roleKey: "CONSUMABLES_SMALL", quantity: 1 },
    ], 1.0);
    ok(r.materialCostResolved === true, "dishwasher-electrical: materialCostResolved reached true through the real, supported cost-then-quantity path (a wholly policy-quantity recipe)");
    ok(r.published.ok === true, "dishwasher-electrical: publishSuggestedPrice succeeded");
    ok(r.activated === true, "dishwasher-electrical: activateService succeeded");

    // ANOTHER TENANT IS UNAFFECTED — a second contractor declares a
    // DIFFERENT cost and quantity for the same canonical role on the same
    // service while the first is still live, and the first's own total must
    // not move. Nested in the same try/finally so both contractors are
    // cleaned up even if this check throws.
    const otherId = await bootstrapPlainContractor("__freshlaunch-legacy-zero-other__", "Fresh Launch Rehearsal (zero-structural, other tenant)");
    try {
      const otherSvc = await prisma.service.findFirstOrThrow({ where: { contractorId: otherId, slug: "dishwasher-electrical" } });
      const before = await prisma.service.findUniqueOrThrow({ where: { id: svc.id }, select: { materialCostCents: true } });
      const otherCost = await writeMaterialCost(prisma, { contractorId: otherId }, { roleKey: "CONSUMABLES_SMALL", packagePriceCents: 1000, packageQuantity: 1, packageUnit: "each" });
      if (!otherCost.ok) throw new Error(`other-tenant cost refused: ${otherCost.error}`);
      await declarePolicyQuantity(otherSvc.id, "CONSUMABLES_SMALL", 3);
      const after = await prisma.service.findUniqueOrThrow({ where: { id: svc.id }, select: { materialCostCents: true } });
      ok(after.materialCostCents === before.materialCostCents,
        `dishwasher-electrical: another tenant declaring a different CONSUMABLES_SMALL cost ($10.00) and quantity (3) leaves this contractor's own total ($${((before.materialCostCents ?? 0) / 100).toFixed(2)}) unchanged`);
    } finally {
      await removePlainContractor("__freshlaunch-legacy-zero-other__");
    }
  } finally {
    await removePlainContractor("__freshlaunch-legacy-zero__");
  }

  console.log("\n=== legacyStructural: replace-standard-outlet ===");
  try {
    // Same reason as legacyZeroStructural above: bootstrap owned by the try
    // that cleans it up, not called before it.
    const structId = await bootstrapPlainContractor("__freshlaunch-legacy-struct__", "Fresh Launch Rehearsal (structural)");
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

    const outletSvc = await prisma.service.findFirstOrThrow({ where: { contractorId: structId, slug: "replace-standard-outlet" } });
    const r = await walkLegacyService(structId, "replace-standard-outlet", [
      { roleKey: "RECEPTACLE_STANDARD", packagePriceCents: 200, packageQuantity: 1, packageUnit: "each" },
      { roleKey: "WALL_PLATE", packagePriceCents: 100, packageQuantity: 1, packageUnit: "each" },
      { roleKey: "CONSUMABLES_SMALL", packagePriceCents: 300, packageQuantity: 1, packageUnit: "each" },
    ], [
      { roleKey: "CONSUMABLES_SMALL", quantity: 1 },
    ], 0.5);
    ok(r.materialCostResolved === true, "replace-standard-outlet: materialCostResolved reached true through the real, supported cost-then-quantity path (structural AND policy materials mixed)");
    ok(r.published.ok === true, "replace-standard-outlet: publishSuggestedPrice succeeded");
    ok(r.activated === true, "replace-standard-outlet: activateService succeeded");

    // SUBSEQUENT EDITS RECOMPUTE CORRECTLY — an ordinary cost change on an
    // already-resolved mixed recipe must move the total by exactly the
    // delta, once, through the same setContractorMaterialCost cascade every
    // other cost edit uses.
    if (r.materialCostResolved) {
      const before = await prisma.service.findUniqueOrThrow({ where: { id: outletSvc.id }, select: { materialCostCents: true } });
      const revised = await writeMaterialCost(prisma, { contractorId: structId }, { roleKey: "CONSUMABLES_SMALL", packagePriceCents: 500, packageQuantity: 1, packageUnit: "each" });
      if (!revised.ok) throw new Error(`revised cost refused: ${revised.error}`);
      const after = await prisma.service.findUniqueOrThrow({ where: { id: outletSvc.id }, select: { materialCostCents: true } });
      const expectedAfter = (before.materialCostCents ?? 0) + (500 - 300) * 1;
      ok(after.materialCostCents === expectedAfter,
        `replace-standard-outlet: raising CONSUMABLES_SMALL from $3.00 to $5.00 moves the total by exactly the $2.00 delta once ($${((before.materialCostCents ?? 0) / 100).toFixed(2)} -> $${((after.materialCostCents ?? 0) / 100).toFixed(2)})`);
    }

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
    // PREVIOUSLY UNRESOLVED, NOW ROOT-CAUSED AND FIXED. This refused with
    // NOT_READY_TO_APPROVE / NO_CONTRACTOR_PRODUCT (SURFACE_RACEWAY_JOINT)
    // against this run's freshly-extracted catalog — a materials-layer
    // refusal that looked like a missing joint product but was not one. The
    // real cause: lib/electrical/onboardingPilotReadiness.ts's PILOT_ANSWERS
    // answered a RETIRED question (`purpose: "general_use"`, deleted by
    // prisma/seed-outlet-power-source.ts, which runs after prisma/seed-
    // questions.ts and explicitly retires it) instead of the two real,
    // current ones (`outlet_load_type: "everyday"`, `outlet_power_source:
    // "tap_existing"`) — a prior correction here had the rename backwards.
    // resolveRoute therefore returned INVALID before it ever reached the
    // surface-raceway module, config.components came back empty,
    // loadSurfaceTakeoff never saw a channel purchase, and the joint's "not
    // established" reason was reporting a route that was never walked, not
    // a real materials gap. Fixed by correcting PILOT_ANSWERS itself — see
    // its own doc comment for the full citation trail.
    //
    // Fixing that surfaced two further real, narrow gaps in the shared
    // fixture builder (scripts/_derivedStorefrontFixture.ts), now also
    // fixed: its dependency service (dedicated-120v-circuit-outlet) has two
    // policy-quantity roles (WIRE_14_2, CONSUMABLES_MEDIUM) that a cost alone
    // no longer resolves, now declared at real, documented figures; and
    // new-120v-outlet's own outlet_load_type "ev" answer reroutes to Level 2
    // EV Charger Installation, a second real prerequisite that needed
    // activating first (trivially — it is a REMOTE_QUOTE service with no
    // materials and no fixed price ever promised).
    const built = await buildPricedDerivedContractor(prisma, derivedSlug, "FLAT_RATE");
    ok(built.approvedTotalCents !== null, `new-120v-outlet: DERIVED_RESOLVED_SCOPE approved at $${((built.approvedTotalCents ?? 0) / 100).toFixed(2)} via the real decideDerivedPricingApproval path`);
    const svc = await prisma.service.findUniqueOrThrow({ where: { id: built.serviceId } });
    ok(svc.active === true, "new-120v-outlet: activated via the real activateService path");
  } finally {
    await removeFixture(prisma, derivedSlug);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
