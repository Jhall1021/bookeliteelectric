/**
 * A rehearsal contractor whose New 120V Outlet is live and PRICED from its own
 * approved economics — built only through the supported lifecycle functions
 * (catalog install, wizard writes, the server approval decision, activation).
 * Shared by the storefront derived-pricing suites. `rv2-pilot-rehearsal-*`
 * slugs only; removal goes through the bounded pilot reset.
 */
import { PrismaClient, type PricingStrategy } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { withContractor } from "../lib/tenantRoute";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { writeMaterialCost, writeMaterialSystem, writePricingSettingsField } from "../lib/admin/onboardingActions";
import { saveLaborOperationDecisions } from "../lib/laborCalibrationPersistence";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { declarePolicyMaterialQuantity } from "../lib/materialCost";
import { resolvePolicy } from "../lib/policyResolution";
import { activateService } from "../lib/serviceActivation";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { resetPilotContractor } from "../lib/electrical/pilotReset";
import { liveEndpointOf, PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";
import { authorContractorDisclaimer } from "../lib/disclaimerAuthoring";
import { CONCEALED_ROUTE_POLICY_KEYS } from "../lib/electrical/concealedRouteMaterialConfiguration";
import { backToBackOperationKeys } from "../lib/electrical/backToBackAtomicLaborBridge";
import { accessibleConcealedOperationKeys } from "../lib/electrical/accessibleConcealedAtomicLaborBridge";
import { baseboardConcealedOperationKeys } from "../lib/electrical/baseboardConcealedAtomicLaborBridge";
import { drywallConcealedOperationKeys } from "../lib/electrical/drywallConcealedAtomicLaborBridge";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const asTenant = <T>(id: string, fn: (db: any) => Promise<T>) => withContractor(id, "test", (db) => fn(db));

export const FIXTURE_COSTS: [string, number, number, string][] = [
  [SURFACE_ROLES.channel, 1457, 5, "ft"], [SURFACE_ROLES.joint, 187, 1, "each"], [SURFACE_ROLES.supportClip, 57, 1, "each"],
  [SURFACE_ROLES.transition, 447, 1, "each"], [SURFACE_ROLES.insideElbow, 327, 1, "each"], [SURFACE_ROLES.outsideElbow, 327, 1, "each"],
  [SURFACE_ROLES.flatElbow, 317, 1, "each"], [SURFACE_ROLES.deviceBox, 647, 1, "each"],
  ["CONDUCTOR_THHN_12_UNGROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_GROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_EQUIPMENT_GROUND", 7417, 500, "ft"],
  ["WIRE_14_2", 50, 1, "ft"], ["NM_CABLE_SUPPORT", 800, 100, "each"],
  ["BOX_OLD_WORK", 300, 1, "each"], ["RECEPTACLE_STANDARD", 200, 1, "each"],
  ["WALL_PLATE", 100, 1, "each"], ["CONSUMABLES_SMALL", 300, 1, "job"],
];
export const CIRCUIT_LABOR_SERVICE_SLUGS = new Set([
  "dedicated-120v-circuit-outlet", "sump-pump-dedicated-circuit",
  "electric-fireplace-circuit", "new-240v-appliance-circuit",
]);
export const ROUTE_LABOR_OPERATION_KEYS = [...new Set([
  ...(ELECTRICAL_ATOMIC_LABOR_RECIPES.find((recipe) => recipe.key === "ELECTRICAL_SURFACE_RACEWAY_ROUTE")?.lines.map((line) => line.operationKey) ?? []),
  ...ELECTRICAL_ATOMIC_LABOR_RECIPES
    .filter((recipe) => recipe.appliesTo.some((slug) => CIRCUIT_LABOR_SERVICE_SLUGS.has(slug)))
    .flatMap((recipe) => recipe.lines.map((line) => line.operationKey)),
  ...backToBackOperationKeys("OUTLET"),
  ...accessibleConcealedOperationKeys("OUTLET"),
  ...baseboardConcealedOperationKeys("OUTLET"),
  ...drywallConcealedOperationKeys("OUTLET"),
])];

// The bounded circuit family's materials — canonical per-unit reference
// costs already documented by the material seeds, not fixture-only prices.
export const CIRCUIT_FAMILY_COSTS: [string, number, number, string][] = [
  ["WIRE_14_2", 50, 1, "ft"], ["WIRE_12_2", 72, 1, "ft"],
  ["BREAKER_SINGLE_POLE_15A", 800, 1, "each"], ["BREAKER_SINGLE_POLE_20A", 800, 1, "each"],
  ["RECEPTACLE_STANDARD", 200, 1, "each"], ["GFCI_INTERIOR_20A", 1800, 1, "each"],
  ["WALL_PLATE", 100, 1, "each"], ["BOX_OLD_WORK", 300, 1, "each"],
  ["CONSUMABLES_MEDIUM", 700, 1, "job"],
  ["WIRE_10_3", 40000, 250, "ft"], ["WIRE_6_3", 49600, 125, "ft"],
  ["BREAKER_DOUBLE_POLE_30A", 1824, 1, "each"], ["BREAKER_DOUBLE_POLE_50A", 1824, 1, "each"],
  ["RECEPTACLE_14_30", 1098, 1, "each"], ["RECEPTACLE_14_50", 1142, 1, "each"],
  ["BOX_SURFACE_4S", 267, 1, "each"], ["COVER_RAISED_4S", 350, 1, "each"],
];
export const CIRCUIT_POLICY_ALLOWANCES = {
  "dedicated-120v-circuit-outlet": [["WIRE_14_2", 50], ["CONSUMABLES_MEDIUM", 1]],
  "electric-fireplace-circuit": [["CONSUMABLES_MEDIUM", 1]],
  "new-240v-appliance-circuit": [["CONSUMABLES_MEDIUM", 1]],
} as const;

export function fixtureSlug(tag: string) {
  return `${PILOT_REHEARSAL_PREFIX}${tag}-${process.pid.toString(36)}`;
}

export async function removeFixture(prisma: PrismaClient, slug: string) {
  const c = await prisma.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  const r = await resetPilotContractor(prisma, { slug, liveEndpoint: liveEndpointOf(process.env.DATABASE_URL ?? ""), dryRun: false });
  if (!r.ok) throw new Error(`could not clean up ${slug}: ${r.refusal.code}`);
  await prisma.visit.deleteMany({ where: { contractorId: c.id } });
  await prisma.guidedFlowSession.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorSite.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorTrade.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractor.delete({ where: { id: c.id } });
}

export async function buildPricedDerivedContractor(prisma: PrismaClient, slug: string, pricingStrategy: PricingStrategy = "FLAT_RATE") {
  const c = await prisma.contractor.create({
    data: { slug, name: "Storefront Pricing Rehearsal (TEST)", active: true, countryCode: "US", trade: "residential electrician", pricingStrategy },
    select: { id: true } });
  const site = await prisma.contractorSite.create({ data: { contractorId: c.id, hostedSlug: slug, publicId: `site_${randomBytes(16).toString("hex")}`, active: true }, select: { publicId: true } });
  await prisma.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
  const cid = c.id;
  const pf = await preflight(prisma, cid, templateVersionSource(prisma, "electrical"));
  if (!pf.ok) throw new Error(pf.message);
  await installCatalog(prisma, cid, pf.catalog);
  await asTenant(cid, (db) => writeMaterialSystem(db, { contractorId: cid }, { systemKey: "SURFACE_RACEWAY", groundingStrategy: "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR",
    supportSpacingFt: 5, supportAtEachTerminus: true, sourceTermination: "FITTING_REQUIRED", sourceTerminationRole: SURFACE_ROLES.transition, destinationTermination: "DIRECT_ENTRY" }));
  await asTenant(cid, (db) => resolvePolicy(db, cid, "surface_outlet.branch_conductor_spec", { choice: "12" }));
  await asTenant(cid, (db) => resolvePolicy(db, cid, "surface_raceway.conductor_slack_per_termination", { measurement: 0.5 }));
  await asTenant(cid, (db) => resolvePolicy(db, cid, CONCEALED_ROUTE_POLICY_KEYS.cableRole, { choice: "WIRE_14_2" }));
  // This disposable fixture uses a conservative seven-foot rise/drop at each
  // end. A real contractor sets this during onboarding; it is not a catalog
  // default and is never inferred from the homeowner's rough route length.
  await asTenant(cid, (db) => resolvePolicy(db, cid, CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination, { measurement: 7 }));
  await asTenant(cid, (db) => resolvePolicy(db, cid, CONCEALED_ROUTE_POLICY_KEYS.backToBackCableAllowance, { measurement: 3 }));
  await asTenant(cid, (db) => resolvePolicy(db, cid, CONCEALED_ROUTE_POLICY_KEYS.supportSpacing, { measurement: 4.5 }));
  await asTenant(cid, (db) => resolvePolicy(db, cid, CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination, { choice: "YES" }));
  await asTenant(cid, (db) => resolvePolicy(db, cid, CONCEALED_ROUTE_POLICY_KEYS.drywallFramingSpacing, { measurement: 16 }));
  for (const [roleKey, packagePriceCents, packageQuantity, packageUnit] of FIXTURE_COSTS) {
    const r = await asTenant(cid, (db) => writeMaterialCost(db, { contractorId: cid }, { roleKey, packagePriceCents, packageQuantity, packageUnit }));
    if (!r.ok) throw new Error(`cost ${roleKey}: ${r.error}`);
  }
  await asTenant(cid, (db) => saveLaborOperationDecisions(db, cid, "electrical", ROUTE_LABOR_OPERATION_KEYS.map((operationKey) => ({
    operationKey,
    hoursPerUnit: 0.1,
    source: "DIRECT" as const,
    basis: { method: "DIRECT_ENTRY" as const, scenarioKeys: [], note: "STOREFRONT TEST FIXTURE — not a contractor calibration." },
  }))));
  for (const [field, value] of [["crewHourRateCents", 18500], ["primaryMinimumCents", 19500], ["roundingIncrementCents", 500], ["defaultPermitAdminCents", 0]] as const)
    await asTenant(cid, (db) => writePricingSettingsField(db, { contractorId: cid }, { action: "set", field, value }));
  await prisma.contractorCapability.createMany({
    data: ["BASEBOARD_ACCESS_REINSTALL", "DRYWALL_ACCESS_CUTTING"].map((key) => ({ contractorId: cid, key })),
    skipDuplicates: true,
  });
  const svc = await prisma.service.findFirstOrThrow({ where: { contractorId: cid, slug: "new-120v-outlet" }, select: { id: true } });
  let approvedTotalCents: number | null = null;
  let dedicatedCircuitServiceId: string | null = null;
  if (pricingStrategy === "FLAT_RATE") {
    // The qualification gate above the surface-route module can hand a
    // homeowner off to "Dedicated Circuit & Outlet" ("What will this outlet
    // power?" -> a specific large appliance) — a real, reachable answer, so
    // activateService correctly refuses DEPENDENCY_UNAVAILABLE until that
    // target is live too (lib/serviceActivation.ts's own ordering rule; a
    // real Review & Launch would sequence the same way, launching a
    // dependency before what hands off to it). Taken through the SAME
    // supported actions a real contractor's admin would use: cost materials,
    // calibrate the atomic labor operations, approve each calculated pricing
    // basis, and then activate it — never a raw flag flip or legacy base-price
    // publication.
    //
    // DONE BEFORE new-120v-outlet's OWN approval, not after: the derived-
    // pricing basis fingerprint for new-120v-outlet predates the circuit-
    // family role scoping and observes contractor material changes broadly.
    // Writing these costs after approving the outlet would therefore stale
    // that approval. Configure the contractor's economics first and approve
    // once, as the real setup flow does.
    const dedicated = await prisma.service.findFirstOrThrow({
      where: { contractorId: cid, slug: "dedicated-120v-circuit-outlet" }, select: { id: true } });
    dedicatedCircuitServiceId = dedicated.id;
    // Its own band question needs a real decision before calculated prices
    // can be approved —
    // the same [30, 60] boundary scripts/onboard-contractor-two.ts already
    // uses for this exact policy key, not a value invented for this fixture.
    await asTenant(cid, (db) => resolvePolicy(db, cid, "panel_circuit_run.breakpoints", { boundaries: [30, 60] }));
    for (const [roleKey, packagePriceCents, packageQuantity, packageUnit] of CIRCUIT_FAMILY_COSTS) {
      const r = await asTenant(cid, (db) => writeMaterialCost(db, { contractorId: cid }, { roleKey, packagePriceCents, packageQuantity, packageUnit }));
      if (!r.ok) throw new Error(`dependency cost ${roleKey}: ${r.error}`);
    }
    // Template extraction intentionally leaves contractor-policy quantities
    // unresolved. A material cost alone cannot activate these services, so
    // declare the fixture's bounded allowances through the same supported
    // Materials path used by onboarding. The 50-foot wire allowance comes
    // from the dedicated-circuit seed; consumables are one job package.
    for (const [serviceSlug, allowances] of Object.entries(CIRCUIT_POLICY_ALLOWANCES)) {
      const circuit = await prisma.service.findFirstOrThrow({
        where: { contractorId: cid, slug: serviceSlug }, select: { id: true },
      });
      for (const [roleKey, quantity] of allowances) {
        const role = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: roleKey } });
        await asTenant(cid, (db) => declarePolicyMaterialQuantity(db, circuit.id, role.id, quantity));
      }
    }
    // An answer this dependency's own question tree can reach
    // (dedicated_route_access) needs a contractor-authored disclosure before
    // it can go live — activation correctly refuses DISCLAIMER_UNRESOLVED
    // until one exists, the same real function scripts/onboard-contractor-*
    // uses. Elite's own verbatim wording, not text invented for this
    // fixture (lib/disclaimerAuthoring.ts's authorContractorDisclaimer).
    const disclaimer = await asTenant(cid, (db) => authorContractorDisclaimer(db, cid, "EXTERIOR_WALL_CONTINGENCY_DEDICATED",
      "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across, which takes longer, and patching and painting aren't included. We'd show you what we're looking at and give you a price before doing any of it."));
    if (!disclaimer.ok) throw new Error(`dependency disclaimer refused: ${JSON.stringify(disclaimer)}`);
    for (const circuitSlug of ["dedicated-120v-circuit-outlet", "electric-fireplace-circuit", "new-240v-appliance-circuit"]) {
      const circuit = await prisma.service.findFirstOrThrow({
        where: { contractorId: cid, slug: circuitSlug }, select: { id: true },
      });
      const approval = await asTenant(cid, (db) => decideDerivedPricingApproval(
        db, { contractorId: cid, userId: null }, { action: "approve", serviceId: circuit.id },
      ));
      if (approval.status !== 200) throw new Error(`${circuitSlug} approval refused: ${JSON.stringify(approval.body)}`);
      const activation = await activateService(prisma, cid, circuit.id);
      if (!activation.ok) throw new Error(`${circuitSlug} activation refused: ${JSON.stringify(activation)}`);
    }

    // new-120v-outlet's own outlet_load_type question reroutes its "ev"
    // answer to Level 2 EV Charger Installation when the contractor offers
    // it (prisma/seed-outlet-power-source.ts) — a second real prerequisite,
    // invisible until PILOT_ANSWERS actually reached this question. It is a
    // REMOTE_QUOTE service with no fixed price ever promised
    // (prisma/seed-labor-hours.ts: "QUOTE: null is the correct value...
    // established per job when the office builds the fixed price"). Its
    // consumables line is still contractor policy, so the fixture must
    // explicitly approve one job's allowance before activation.
    const evCharger = await prisma.service.findFirstOrThrow({
      where: { contractorId: cid, slug: "level-2-ev-charger" }, select: { id: true } });
    const evConsumables = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: "CONSUMABLES_MEDIUM" } });
    await asTenant(cid, (db) => declarePolicyMaterialQuantity(db, evCharger.id, evConsumables.id, 1));
    const evActivation = await activateService(prisma, cid, evCharger.id);
    if (!evActivation.ok) throw new Error(`level-2-ev-charger activation refused: ${JSON.stringify(evActivation)}`);

    // NOW approve new-120v-outlet — every contractor-wide economic input
    // (this dependency's materials included) is already in its final state.
    const approved = await asTenant(cid, (db) => decideDerivedPricingApproval(db, { contractorId: cid, userId: null }, { action: "approve", serviceId: svc.id }));
    if (approved.status !== 200) throw new Error(`approval refused: ${JSON.stringify(approved.body)}`);
    approvedTotalCents = approved.body.approvedTotalCents as number;

    const act = await activateService(prisma, cid, svc.id);
    if (!act.ok) throw new Error(`activation refused: ${JSON.stringify(act)}`);
  }
  return { contractorId: cid, publicId: site.publicId, serviceId: svc.id, approvedTotalCents, dedicatedCircuitServiceId };
}

/** Re-approve the CURRENT economics through the server decision. */
export async function reapprove(prisma: PrismaClient, contractorId: string, serviceId: string) {
  const r = await asTenant(contractorId, (db) => decideDerivedPricingApproval(db, { contractorId, userId: null }, { action: "approve", serviceId }));
  if (r.status !== 200) throw new Error(`re-approval refused: ${JSON.stringify(r.body)}`);
  return r.body.approvedTotalCents as number;
}

/** A supported contractor material-cost change: the channel pack price moves. */
export async function changeChannelCost(contractorId: string, packagePriceCents: number) {
  const r = await asTenant(contractorId, (db) => writeMaterialCost(db, { contractorId }, { roleKey: SURFACE_ROLES.channel, packagePriceCents, packageQuantity: 5, packageUnit: "ft" }));
  if (!r.ok) throw new Error(`cost change refused: ${r.error}`);
}
