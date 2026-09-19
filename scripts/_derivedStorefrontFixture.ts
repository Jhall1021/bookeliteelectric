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
import { saveServicePricingInputs } from "../lib/servicePricingInputs";
import { publishSuggestedPrice } from "../lib/pricePublication";
import { resetPilotContractor } from "../lib/electrical/pilotReset";
import { liveEndpointOf, PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";
import { authorContractorDisclaimer } from "../lib/disclaimerAuthoring";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const asTenant = <T>(id: string, fn: (db: any) => Promise<T>) => withContractor(id, "test", (db) => fn(db));

export const FIXTURE_COSTS: [string, number, number, string][] = [
  [SURFACE_ROLES.channel, 1457, 5, "ft"], [SURFACE_ROLES.joint, 187, 1, "each"], [SURFACE_ROLES.supportClip, 57, 1, "each"],
  [SURFACE_ROLES.transition, 447, 1, "each"], [SURFACE_ROLES.insideElbow, 327, 1, "each"], [SURFACE_ROLES.outsideElbow, 327, 1, "each"],
  [SURFACE_ROLES.flatElbow, 317, 1, "each"], [SURFACE_ROLES.deviceBox, 647, 1, "each"],
  ["CONDUCTOR_THHN_12_UNGROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_GROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_EQUIPMENT_GROUND", 7417, 500, "ft"],
];
const SURFACE_LABOR_OPERATION_KEYS = [...new Set(
  ELECTRICAL_ATOMIC_LABOR_RECIPES.find((recipe) => recipe.key === "ELECTRICAL_SURFACE_RACEWAY_ROUTE")?.lines.map((line) => line.operationKey) ?? [],
)];

// "Dedicated Circuit & Outlet"'s own materials — the canonical per-unit
// reference costs prisma/seed-materials.ts already documents for these
// exact keys (unitCostCents), not figures invented for this fixture.
const DEDICATED_CIRCUIT_COSTS: [string, number, number, string][] = [
  ["WIRE_14_2", 50, 1, "ft"], ["BREAKER_SINGLE_POLE", 800, 1, "each"], ["WALL_PLATE", 100, 1, "each"],
  ["RECEPTACLE_STANDARD", 200, 1, "each"], ["BOX_OLD_WORK", 300, 1, "each"], ["CONSUMABLES_MEDIUM", 700, 1, "job"],
];

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
  for (const [roleKey, packagePriceCents, packageQuantity, packageUnit] of FIXTURE_COSTS) {
    const r = await asTenant(cid, (db) => writeMaterialCost(db, { contractorId: cid }, { roleKey, packagePriceCents, packageQuantity, packageUnit }));
    if (!r.ok) throw new Error(`cost ${roleKey}: ${r.error}`);
  }
  await asTenant(cid, (db) => saveLaborOperationDecisions(db, cid, "electrical", SURFACE_LABOR_OPERATION_KEYS.map((operationKey) => ({
    operationKey,
    hoursPerUnit: 0.1,
    source: "DIRECT" as const,
    basis: { method: "DIRECT_ENTRY" as const, scenarioKeys: [], note: "STOREFRONT TEST FIXTURE — not a contractor calibration." },
  }))));
  for (const [field, value] of [["crewHourRateCents", 18500], ["primaryMinimumCents", 19500], ["roundingIncrementCents", 500], ["defaultPermitAdminCents", 0]] as const)
    await asTenant(cid, (db) => writePricingSettingsField(db, { contractorId: cid }, { action: "set", field, value }));
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
    // supported actions a real contractor's admin would use — entering
    // crew-hours (Service.fieldLaborHours, the panel edit
    // scripts/onboard-contractor-two.ts's own comment documents),
    // publishing the derived suggestion, then activating — never a raw
    // flag flip. Elite's own copy of this service uses 2.5 crew-hours; this
    // fixture's copy uses the same, openly-reused figure, not a fabricated
    // one.
    //
    // DONE BEFORE new-120v-outlet's OWN approval, not after: the derived-
    // pricing basis fingerprint (lib/electrical/derivedPricingBasis.ts) is
    // computed over ALL of the contractor's ContractorMaterial rows, not
    // just the roles a given service's recipe actually reaches — so writing
    // this dependency's material costs AFTER approving new-120v-outlet
    // would immediately stale that approval's fingerprint, sending a
    // perfectly ordinary straight route to REVIEW for reasons that have
    // nothing to do with its own economics. Configuring every contractor-
    // wide economic input first, then approving once, is what a real
    // contractor's own setup would do too — nobody approves a price mid-
    // configuration.
    const dedicated = await prisma.service.findFirstOrThrow({
      where: { contractorId: cid, slug: "dedicated-120v-circuit-outlet" }, select: { id: true } });
    dedicatedCircuitServiceId = dedicated.id;
    // Its own band question needs a real decision before it can publish —
    // the same [30, 60] boundary scripts/onboard-contractor-two.ts already
    // uses for this exact policy key, not a value invented for this fixture.
    await asTenant(cid, (db) => resolvePolicy(db, cid, "panel_circuit_run.breakpoints", { boundaries: [30, 60] }));
    for (const [roleKey, packagePriceCents, packageQuantity, packageUnit] of DEDICATED_CIRCUIT_COSTS) {
      const r = await asTenant(cid, (db) => writeMaterialCost(db, { contractorId: cid }, { roleKey, packagePriceCents, packageQuantity, packageUnit }));
      if (!r.ok) throw new Error(`dependency cost ${roleKey}: ${r.error}`);
    }
    // WIRE_14_2 and CONSUMABLES_MEDIUM are policy-quantity roles on this
    // service — a cost alone cannot resolve them (lib/templateProvisioning.ts
    // links every role, costed or not, so readiness refuses on an undeclared
    // allowance exactly like an uncosted one). Declared here through the same
    // real path a contractor's Materials panel uses, at real figures:
    // 50 ft is this service's own documented standard-run allowance
    // (prisma/seed-dedicated-circuit.ts: "POLICY[dedicated_circuit.
    // standard_run_ft]: 50"), and 1 job matches CONSUMABLES_MEDIUM's own
    // package unit ("job") — one job's worth of consumables per job, not a
    // number invented for this fixture.
    for (const [roleKey, quantity] of [["WIRE_14_2", 50], ["CONSUMABLES_MEDIUM", 1]] as const) {
      const role = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: roleKey } });
      await asTenant(cid, (db) => declarePolicyMaterialQuantity(db, dedicated.id, role.id, quantity));
    }
    await saveServicePricingInputs(prisma, dedicated.id, { fieldLaborHours: 2.5 });
    const publishedDependency = await publishSuggestedPrice(prisma, cid, dedicated.id);
    if (!publishedDependency.ok) throw new Error(`dependency publish refused: ${JSON.stringify(publishedDependency.refusal)}`);
    // An answer this dependency's own question tree can reach
    // (dedicated_route_access) needs a contractor-authored disclosure before
    // it can go live — activation correctly refuses DISCLAIMER_UNRESOLVED
    // until one exists, the same real function scripts/onboard-contractor-*
    // uses. Elite's own verbatim wording, not text invented for this
    // fixture (lib/disclaimerAuthoring.ts's authorContractorDisclaimer).
    const disclaimer = await asTenant(cid, (db) => authorContractorDisclaimer(db, cid, "EXTERIOR_WALL_CONTINGENCY_DEDICATED",
      "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across, which takes longer, and patching and painting aren't included. We'd show you what we're looking at and give you a price before doing any of it."));
    if (!disclaimer.ok) throw new Error(`dependency disclaimer refused: ${JSON.stringify(disclaimer)}`);
    const dependencyActivation = await activateService(prisma, cid, dedicated.id);
    if (!dependencyActivation.ok) throw new Error(`dependency activation refused: ${JSON.stringify(dependencyActivation)}`);

    // new-120v-outlet's own outlet_load_type question reroutes its "ev"
    // answer to Level 2 EV Charger Installation when the contractor offers
    // it (prisma/seed-outlet-power-source.ts) — a second real prerequisite,
    // invisible until PILOT_ANSWERS actually reached this question. It is a
    // REMOTE_QUOTE service with no materials and no fixed price ever
    // promised (prisma/seed-labor-hours.ts: "QUOTE: null is the correct
    // value... established per job when the office builds the fixed
    // price"), so it activates on its own, through the same real function,
    // with nothing to configure first.
    const evCharger = await prisma.service.findFirstOrThrow({
      where: { contractorId: cid, slug: "level-2-ev-charger" }, select: { id: true } });
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
