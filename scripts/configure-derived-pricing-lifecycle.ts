/**
 * A fixture that proves the LIFECYCLE, not the pilot.
 *
 * The rehearsal contractor's four route components have no labor calibration,
 * and typing four plausible hours onto them to reach PRICED would make the
 * pilot's green line meaningless. So the machinery is proved on this separate
 * contractor instead, whose labor values are openly fixtures — 0.25h for a
 * foot of raceway is not anybody's real rate and is not offered as one.
 *
 * What this demonstrates is narrow and worth stating plainly: that once
 * truthful contractor inputs exist, the derived pricing lifecycle can produce,
 * approve and re-derive a price. It demonstrates nothing about what the work
 * actually takes.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hostedSlugProblem } from "../lib/siteRouting";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { POLICY_KEYS, SURFACE_RACEWAY_SYSTEM_KEY } from "../lib/electrical/surfaceSystemConfiguration";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";
import { fingerprintBasis } from "../lib/electrical/derivedPricingBasis";
import { loadDerivedPricingBasis, loadAndPriceDerivedScope } from "../lib/electrical/loadDerivedScope";
import { serviceFor } from "../prisma/_serviceTargets";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";

const prisma = new PrismaClient();
export const LIFECYCLE_SLUG = "rv2-lifecycle-derived-pricing";
const RESET = process.argv.includes("--reset");

/** Openly fixtures. Not a recommendation, not research, not anyone's rate. */
const FIXTURE_LABOR: Record<string, number> = {
  ELEC_ROUTE_SURFACE_MOUNTED: 0,      // strategy marker — deliberate zero
  SURFACE_ROUTE_FT: 0.02,
  OUTLET_EXTENSION_CORE: 0.6,
  SURFACE_DEVICE_BOX_OUTLET: 0.2,
};

const PRODUCTS: { role: string; q: number; u: string; c: number }[] = [
  { role: SURFACE_ROLES.channel, q: 5, u: "ft", c: 1457 },
  { role: SURFACE_ROLES.joint, q: 1, u: "each", c: 187 },
  { role: SURFACE_ROLES.insideElbow, q: 1, u: "each", c: 327 },
  { role: SURFACE_ROLES.outsideElbow, q: 1, u: "each", c: 327 },
  { role: SURFACE_ROLES.flatElbow, q: 1, u: "each", c: 317 },
  { role: SURFACE_ROLES.supportClip, q: 1, u: "each", c: 57 },
  { role: SURFACE_ROLES.transition, q: 1, u: "each", c: 447 },
  { role: SURFACE_ROLES.end, q: 1, u: "each", c: 207 },
  { role: SURFACE_ROLES.deviceBox, q: 1, u: "each", c: 647 },
  { role: "CONDUCTOR_THHN_12_UNGROUNDED", q: 500, u: "ft", c: 8917 },
  { role: "CONDUCTOR_THHN_12_GROUNDED", q: 500, u: "ft", c: 8917 },
  { role: "CONDUCTOR_THHN_12_EQUIPMENT_GROUND", q: 500, u: "ft", c: 7417 },
];

async function reset() {
  const c = await prisma.contractor.findUnique({ where: { slug: LIFECYCLE_SLUG }, select: { id: true } });
  if (!c) { console.log("  absent.\n"); return; }
  await prisma.contractorDerivedPricingApproval.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorMaterialSystem.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorPolicyValue.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorMaterial.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorComponent.deleteMany({ where: { contractorId: c.id } });
  const svcs = await prisma.service.findMany({ where: { contractorId: c.id }, select: { id: true } });
  for (const s of svcs) {
    await prisma.answerOption.deleteMany({ where: { question: { serviceId: s.id } } });
    await prisma.question.deleteMany({ where: { serviceId: s.id } });
  }
  await prisma.service.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractor.delete({ where: { id: c.id } });
  console.log(`  ${LIFECYCLE_SLUG} removed.\n`);
}

async function main() {
  console.log("\nDERIVED PRICING LIFECYCLE FIXTURE\n");
  if (RESET) { await reset(); await prisma.$disconnect(); return; }

  let c = await prisma.contractor.findUnique({ where: { slug: LIFECYCLE_SLUG }, select: { id: true } });
  if (!c) {
    if (hostedSlugProblem(LIFECYCLE_SLUG)) throw new Error("bad slug");
    c = await prisma.contractor.create({ data: {
      slug: LIFECYCLE_SLUG, name: "Routing V2 Derived Pricing Lifecycle (TEST)", active: true,
      trade: "residential electrician", legalName: "RV2 Lifecycle (TEST)",
      countryCode: "US", city: "Trenton", state: "NJ", postalCode: "08608",
      schedulingAuthority: "NATIVE" }, select: { id: true } });
    await prisma.contractorSite.create({ data: { contractorId: c.id, hostedSlug: LIFECYCLE_SLUG,
      publicId: `site_${randomBytes(16).toString("hex")}`, active: true } });
    await prisma.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
    const pre = await preflight(prisma, c.id, templateVersionSource(prisma, "electrical"));
    if (!pre.ok) throw new Error(`${pre.code}: ${pre.message}`);
    await installCatalog(prisma, c.id, pre.catalog);
    console.log("  provisioned through the real lifecycle");
  }

  await prisma.pricingSettings.upsert({ where: { contractorId: c.id }, update: {},
    create: { contractorId: c.id, crewHourRateCents: 33333, primaryMinimumCents: 33333,
              roundingIncrementCents: 100, defaultPermitAdminCents: 0 } });

  // material system + policies + products, same shape as the pilot's
  const transition = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: SURFACE_ROLES.transition }, select: { id: true } });
  await prisma.contractorMaterialSystem.upsert({
    where: { contractorId_systemKey: { contractorId: c.id, systemKey: SURFACE_RACEWAY_SYSTEM_KEY } },
    update: {},
    create: { contractorId: c.id, systemKey: SURFACE_RACEWAY_SYSTEM_KEY,
      declaredSystemLabel: "Nonmetallic surface raceway (lifecycle fixture)",
      groundingStrategy: "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR",
      supportSpacingFt: 5, supportAtEachTerminus: true,
      sourceTermination: "FITTING_REQUIRED", sourceTerminationMaterialId: transition.id,
      destinationTermination: "DIRECT_ENTRY", declaredAt: new Date() } });

  for (const [key, patch] of [[POLICY_KEYS.conductorSpec, { choice: "12" }],
                              [POLICY_KEYS.terminationSlack, { measurement: 0.5 }]] as const) {
    const def = await prisma.templatePolicyDefinition.findFirstOrThrow({ where: { key }, select: { type: true, unit: true, prompt: true } });
    await prisma.contractorPolicyValue.upsert({
      where: { contractorId_key: { contractorId: c.id, key } },
      update: { ...patch, resolvedAt: new Date() },
      create: { contractorId: c.id, key, type: def.type, unit: def.unit, boundaryCount: 0,
                prompt: def.prompt, boundaries: [], ...patch, resolvedAt: new Date() } });
  }

  for (const p of PRODUCTS) {
    const role = await prisma.canonicalMaterial.findUnique({ where: { key: p.role }, select: { id: true } });
    if (!role) continue;
    await prisma.contractorMaterial.upsert({
      where: { contractorId_canonicalMaterialId: { contractorId: c.id, canonicalMaterialId: role.id } },
      update: { packageQuantity: p.q, packageUnit: p.u, packagePriceCents: p.c, unitCostCents: Math.round(p.c / p.q) },
      create: { contractorId: c.id, canonicalMaterialId: role.id, packageQuantity: p.q, packageUnit: p.u,
                packagePriceCents: p.c, unitCostCents: Math.round(p.c / p.q) } });
  }

  // FIXTURE LABOR — the thing the pilot deliberately does not have.
  for (const [key, hours] of Object.entries(FIXTURE_LABOR)) {
    const canon = await prisma.canonicalComponent.findUnique({ where: { key }, select: { id: true } });
    if (!canon) { console.log(`     unknown component ${key}`); continue; }
    await prisma.contractorComponent.upsert({
      where: { contractorId_canonicalComponentId: { contractorId: c.id, canonicalComponentId: canon.id } },
      update: { addFieldLaborHours: hours },
      create: { contractorId: c.id, canonicalComponentId: canon.id, addFieldLaborHours: hours,
                notes: "LIFECYCLE FIXTURE — not a calibration, not research, not anyone's rate." } });
  }
  console.log("  labor fixtures written (openly fictional)");

  // opt the service into derived pricing and approve the current basis
  const svc = await serviceFor(prisma, c.id, "surface-mounted-outlet");
  await prisma.service.update({ where: { id: svc.id }, data: { pricingMethod: "DERIVED_RESOLVED_SCOPE" } });

  const loaded = await loadServiceForResolution(prisma, svc.id);
  const settings = await loadPricingSettings(prisma, c.id);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = resolveRoute(loaded!, { [SURFACE_KEYS.feet]: "31", [SURFACE_KEYS.inside]: "0",
    [SURFACE_KEYS.outside]: "0", [SURFACE_KEYS.flat]: "0", [SURFACE_KEYS.surface]: "drywall",
    [SURFACE_KEYS.obstacles]: "clear" }, true, settings) as any;
  const components = (r?.config?.components ?? []) as { key: string; quantity: number }[];

  const basis = await loadDerivedPricingBasis(prisma, c.id, components.map((x) => x.key));
  const fp = fingerprintBasis(basis);
  const priced = await loadAndPriceDerivedScope(prisma, {
    contractorId: c.id, serviceId: svc.id, components, routeFeet: 31, turnCount: 0,
    context: { isPrimary: true, isPrimaryEligible: true, servicePermitAdminEstablished: false },
    service: { materialMultiplier: null, permitAdminCents: null, otherDirectCostCents: null, isPrimaryEligible: true } });

  await prisma.contractorDerivedPricingApproval.upsert({
    where: { contractorId_serviceId: { contractorId: c.id, serviceId: svc.id } },
    update: { approvedBasisFingerprint: fp, approvedAt: new Date(),
              approvedTotalCents: priced.kind === "PRICED" ? priced.totalCents : 0,
              approvedLaborCents: priced.kind === "PRICED" ? priced.breakdown.laborCents : 0,
              approvedMaterialCents: priced.kind === "PRICED" ? priced.breakdown.materialCents : 0 },
    create: { contractorId: c.id, serviceId: svc.id, approvedBasisFingerprint: fp, approvedAt: new Date(),
              approvedTotalCents: priced.kind === "PRICED" ? priced.totalCents : 0,
              approvedLaborCents: priced.kind === "PRICED" ? priced.breakdown.laborCents : 0,
              approvedMaterialCents: priced.kind === "PRICED" ? priced.breakdown.materialCents : 0 } });
  console.log(`  basis approved  ${fp}`);
  const after = await loadAndPriceDerivedScope(prisma, {
    contractorId: c.id, serviceId: svc.id, components, routeFeet: 31, turnCount: 0,
    context: { isPrimary: true, isPrimaryEligible: true, servicePermitAdminEstablished: false },
    service: { materialMultiplier: null, permitAdminCents: null, otherDirectCostCents: null, isPrimaryEligible: true } });
  console.log(`  result: ${after.kind}${after.kind === "PRICED" ? ` ${after.totalCents}c` : ` ${after.code}`}\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && process.argv[1].endsWith("configure-derived-pricing-lifecycle.ts")) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
