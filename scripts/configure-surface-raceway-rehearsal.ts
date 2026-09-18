/**
 * ONE CONTRACTOR'S REHEARSAL CONFIGURATION — explicitly theirs, nobody else's.
 *
 * Deliberately NOT Elite. Elite is a real tenant whose economics are real, and
 * this pilot needs package prices and a declared material system that nobody
 * has actually chosen. Writing invented dollar figures onto a real contractor
 * would put fabricated numbers exactly where they are hardest to spot later.
 * So this is its own contractor, provisioned through the same real lifecycle,
 * and every figure below is obviously a fixture.
 *
 * WHAT THIS SCRIPT IS ALLOWED TO DECIDE: nothing. It records decisions ON
 * BEHALF of a rehearsal contractor, the way an admin screen eventually will.
 * The values are fixtures, not recommendations, and none of them is seeded to
 * any other contractor, written to a canonical role, or offered as a default.
 */
import { PrismaClient, TemplatePolicyType } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hostedSlugProblem } from "../lib/siteRouting";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { POLICY_KEYS, SURFACE_RACEWAY_SYSTEM_KEY } from "../lib/electrical/surfaceSystemConfiguration";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";

const prisma = new PrismaClient();
export const REHEARSAL_SLUG = "rv2-rehearsal-surface-system";
const REHEARSAL_NAME = "Routing V2 Surface System Rehearsal (TEST)";
const RESET = process.argv.includes("--reset");

/**
 * Package geometry and price per role.
 *
 * FIXTURE FIGURES. Prices end in 7 and are not any real contractor's; the
 * point of the pilot is that the ARITHMETIC is exact, not that these are what
 * anything costs.
 */
const PRODUCTS: { role: string; pkgQty: number; pkgUnit: string; pkgCents: number; label: string }[] = [
  { role: SURFACE_ROLES.channel,      pkgQty: 5, pkgUnit: "ft",   pkgCents: 1457, label: "5 ft channel stick (fixture)" },
  { role: SURFACE_ROLES.joint,        pkgQty: 1, pkgUnit: "each", pkgCents: 187,  label: "joint cover (fixture)" },
  { role: SURFACE_ROLES.insideElbow,  pkgQty: 1, pkgUnit: "each", pkgCents: 327,  label: "internal elbow (fixture)" },
  { role: SURFACE_ROLES.outsideElbow, pkgQty: 1, pkgUnit: "each", pkgCents: 327,  label: "external elbow (fixture)" },
  { role: SURFACE_ROLES.flatElbow,    pkgQty: 1, pkgUnit: "each", pkgCents: 317,  label: "flat elbow (fixture)" },
  { role: SURFACE_ROLES.supportClip,  pkgQty: 1, pkgUnit: "each", pkgCents: 57,   label: "support clip (fixture)" },
  { role: SURFACE_ROLES.transition,   pkgQty: 1, pkgUnit: "each", pkgCents: 447,  label: "entrance fitting (fixture)" },
  { role: SURFACE_ROLES.end,          pkgQty: 1, pkgUnit: "each", pkgCents: 207,  label: "blank end fitting (fixture)" },
  { role: SURFACE_ROLES.deviceBox,    pkgQty: 1, pkgUnit: "each", pkgCents: 647,  label: "1-gang surface box (fixture)" },
  { role: "CONDUCTOR_THHN_12_UNGROUNDED",      pkgQty: 500, pkgUnit: "ft", pkgCents: 8917, label: "500 ft spool (fixture)" },
  { role: "CONDUCTOR_THHN_12_GROUNDED",        pkgQty: 500, pkgUnit: "ft", pkgCents: 8917, label: "500 ft spool (fixture)" },
  { role: "CONDUCTOR_THHN_12_EQUIPMENT_GROUND", pkgQty: 500, pkgUnit: "ft", pkgCents: 7417, label: "500 ft spool (fixture)" },
];

async function reset() {
  const c = await prisma.contractor.findUnique({ where: { slug: REHEARSAL_SLUG }, select: { id: true } });
  if (!c) { console.log(`  ${REHEARSAL_SLUG} does not exist.\n`); return; }
  // Only this contractor's own rows. Nothing global, nothing shared.
  await prisma.contractorMaterialSystem.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorPolicyValue.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorMaterial.deleteMany({ where: { contractorId: c.id } });
  const svcs = await prisma.service.findMany({ where: { contractorId: c.id }, select: { id: true } });
  for (const s of svcs) {
    await prisma.answerOption.deleteMany({ where: { question: { serviceId: s.id } } });
    await prisma.question.deleteMany({ where: { serviceId: s.id } });
  }
  await prisma.service.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractor.delete({ where: { id: c.id } });
  console.log(`  ${REHEARSAL_SLUG} removed.\n`);
}

async function main() {
  console.log(`\nSURFACE RACEWAY REHEARSAL CONFIGURATION\n`);
  if (RESET) { await reset(); await prisma.$disconnect(); return; }

  let c = await prisma.contractor.findUnique({ where: { slug: REHEARSAL_SLUG }, select: { id: true } });
  if (!c) {
    if (hostedSlugProblem(REHEARSAL_SLUG)) throw new Error(`bad storefront address: ${REHEARSAL_SLUG}`);
    c = await prisma.contractor.create({
      data: {
        slug: REHEARSAL_SLUG, name: REHEARSAL_NAME, active: true,
        trade: "residential electrician",
        legalName: "Routing V2 Surface System Rehearsal (TEST)",
        countryCode: "US", city: "Trenton", state: "NJ", postalCode: "08608",
        schedulingAuthority: "NATIVE",
      }, select: { id: true },
    });
    await prisma.contractorSite.create({
      data: { contractorId: c.id, hostedSlug: REHEARSAL_SLUG,
              publicId: `site_${randomBytes(16).toString("hex")}`, active: true } });
    await prisma.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
    const pre = await preflight(prisma, c.id, templateVersionSource(prisma, "electrical"));
    if (!pre.ok) throw new Error(`${pre.code}: ${pre.message}`);
    const install = await installCatalog(prisma, c.id, pre.catalog);
    console.log(`  provisioned through the real lifecycle: ${install.services} services, ` +
                `${install.unresolvedMaterialRoles} roles uncosted`);
    // Required before resolveRoute will run at all — the resolver refuses to
    // price for a contractor with no settings rather than defaulting them.
    // Obviously fake, in the same shape the proof contractor uses: 22222 is
    // not Elite's rate, not BrightPath's, and not a number any business picks.
    await prisma.pricingSettings.create({
      data: { contractorId: c.id, crewHourRateCents: 22222, primaryMinimumCents: 22222,
              roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
    });
  } else {
    console.log(`  contractor exists (${c.id}); re-applying its configuration`);
  }

  // ── 1. the contractor selects and describes their material system ─────────
  const transition = await prisma.canonicalMaterial.findUniqueOrThrow({
    where: { key: SURFACE_ROLES.transition }, select: { id: true } });
  const endFitting = await prisma.canonicalMaterial.findUniqueOrThrow({
    where: { key: SURFACE_ROLES.end }, select: { id: true } });

  await prisma.contractorMaterialSystem.upsert({
    where: { contractorId_systemKey: { contractorId: c.id, systemKey: SURFACE_RACEWAY_SYSTEM_KEY } },
    update: {},
    create: {
      contractorId: c.id,
      systemKey: SURFACE_RACEWAY_SYSTEM_KEY,
      declaredSystemLabel: "Nonmetallic surface raceway (rehearsal fixture)",
      // Declared, not derived: this contractor states their family does not
      // serve as the grounding path, so a separate EGC is pulled.
      groundingStrategy: "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR",
      supportSpacingFt: 5,
      supportAtEachTerminus: true,
      // The run leaves an existing flush receptacle enclosure, so it takes an
      // entrance fitting there; the new surface box accepts the raceway
      // directly, which is a declared none rather than an omission.
      sourceTermination: "FITTING_REQUIRED",
      sourceTerminationMaterialId: transition.id,
      destinationTermination: "DIRECT_ENTRY",
      destinationTerminationMaterialId: null,
      declaredAt: new Date(),
    },
  });
  console.log(`  1  material system declared`);

  // ── 2. the contractor answers the policies they owe ───────────────────────
  const setPolicy = async (key: string, patch: { choice?: string; measurement?: number }) => {
    const def = await prisma.templatePolicyDefinition.findFirstOrThrow({
      where: { key }, select: { type: true, unit: true, prompt: true } });
    await prisma.contractorPolicyValue.upsert({
      where: { contractorId_key: { contractorId: c!.id, key } },
      update: { ...patch, resolvedAt: new Date() },
      create: {
        contractorId: c!.id, key, type: def.type, unit: def.unit,
        boundaryCount: 0, prompt: def.prompt, boundaries: [],
        ...patch, resolvedAt: new Date(),
      },
    });
  };
  await setPolicy(POLICY_KEYS.conductorSpec, { choice: "12" });
  // An EXPLICIT allowance, not a platform default and not a silent zero.
  await setPolicy(POLICY_KEYS.terminationSlack, { measurement: 0.5 });
  console.log(`  2  conductor specification and slack allowance declared`);
  console.log(`     offcut reuse deliberately LEFT UNRESOLVED — turned routes must stay incomplete`);

  // ── 3. the contractor's product selections ────────────────────────────────
  let products = 0;
  for (const p of PRODUCTS) {
    const role = await prisma.canonicalMaterial.findUnique({ where: { key: p.role }, select: { id: true } });
    if (!role) { console.log(`     SKIPPED unknown role ${p.role}`); continue; }
    await prisma.contractorMaterial.upsert({
      where: { contractorId_canonicalMaterialId: { contractorId: c.id, canonicalMaterialId: role.id } },
      update: { packageQuantity: p.pkgQty, packageUnit: p.pkgUnit, packagePriceCents: p.pkgCents,
                unitCostCents: Math.round(p.pkgCents / p.pkgQty), nameOverride: p.label },
      create: { contractorId: c.id, canonicalMaterialId: role.id,
                packageQuantity: p.pkgQty, packageUnit: p.pkgUnit, packagePriceCents: p.pkgCents,
                unitCostCents: Math.round(p.pkgCents / p.pkgQty), nameOverride: p.label },
    });
    products++;
  }
  console.log(`  3  ${products} product selections with package geometry\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && process.argv[1].endsWith("configure-surface-raceway-rehearsal.ts")) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
