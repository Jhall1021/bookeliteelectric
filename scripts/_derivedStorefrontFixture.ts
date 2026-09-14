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
import { writeComponentLabor, writeMaterialCost, writeMaterialSystem, writePricingSettingsField } from "../lib/admin/onboardingActions";
import { resolvePolicy } from "../lib/policyResolution";
import { activateService } from "../lib/serviceActivation";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { resetPilotContractor } from "../lib/electrical/pilotReset";
import { liveEndpointOf, PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const asTenant = <T>(id: string, fn: (db: any) => Promise<T>) => withContractor(id, "test", (db) => fn(db));

export const FIXTURE_COSTS: [string, number, number, string][] = [
  [SURFACE_ROLES.channel, 1457, 5, "ft"], [SURFACE_ROLES.joint, 187, 1, "each"], [SURFACE_ROLES.supportClip, 57, 1, "each"],
  [SURFACE_ROLES.transition, 447, 1, "each"], [SURFACE_ROLES.insideElbow, 327, 1, "each"], [SURFACE_ROLES.outsideElbow, 327, 1, "each"],
  [SURFACE_ROLES.flatElbow, 317, 1, "each"], [SURFACE_ROLES.deviceBox, 647, 1, "each"],
  ["CONDUCTOR_THHN_12_UNGROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_GROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_EQUIPMENT_GROUND", 7417, 500, "ft"],
];
const LABOR: [string, number][] = [["ELEC_ROUTE_SURFACE_MOUNTED", 0], ["SURFACE_ROUTE_FT", 0.02], ["OUTLET_EXTENSION_CORE", 0.6], ["SURFACE_DEVICE_BOX_OUTLET", 0.2]];

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
  for (const [componentKey, hours] of LABOR) await asTenant(cid, (db) => writeComponentLabor(db, { contractorId: cid }, { action: "set", componentKey, hours }));
  for (const [field, value] of [["crewHourRateCents", 18500], ["primaryMinimumCents", 19500], ["roundingIncrementCents", 500], ["defaultPermitAdminCents", 0]] as const)
    await asTenant(cid, (db) => writePricingSettingsField(db, { contractorId: cid }, { action: "set", field, value }));
  const svc = await prisma.service.findFirstOrThrow({ where: { contractorId: cid, slug: "new-120v-outlet" }, select: { id: true } });
  let approvedTotalCents: number | null = null;
  if (pricingStrategy === "FLAT_RATE") {
    const approved = await asTenant(cid, (db) => decideDerivedPricingApproval(db, { contractorId: cid, userId: null }, { action: "approve", serviceId: svc.id }));
    if (approved.status !== 200) throw new Error(`approval refused: ${JSON.stringify(approved.body)}`);
    approvedTotalCents = approved.body.approvedTotalCents as number;
    const act = await activateService(prisma, cid, svc.id);
    if (!act.ok) throw new Error(`activation refused: ${JSON.stringify(act)}`);
  }
  return { contractorId: cid, publicId: site.publicId, serviceId: svc.id, approvedTotalCents };
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
