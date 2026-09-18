/**
 * Onboard a brand-new contractor and see what Price2Book actually gives them.
 *
 * THE QUESTION THIS ANSWERS
 *
 * Routing V2 was built on Elite. Elite is a mature tenant with real component
 * economics, hand-seeded history and five years of decisions baked into its
 * rows — exactly the conditions under which a customization can pass for an
 * architecture. The only way to tell the two apart is to onboard somebody who
 * has none of that and look at what arrives.
 *
 * SO NOTHING HERE IS CONSTRUCTED BY HAND.
 *
 * Every step is the same domain operation the product runs: contractor row,
 * storefront identity, trade enrolment, then `preflight` + `installCatalog`
 * against `templateVersionSource(db, "electrical")` — the latest published
 * SNAPSHOT with every later DELTA folded in, which is precisely what a real
 * signup resolves. Nothing is copied from Elite and no row is nudged toward
 * the state the proof wants to find.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No published prices, no activation, no capability declarations, no service
 * selection. A real electrician has not made those decisions at the end of
 * their first minute either, and manufacturing them would be answering the
 * question instead of asking it. The acceptance suite expects physical routing
 * to succeed anyway and pricing to wait — if that needs economics to hold, it
 * was never an onboarding architecture.
 *
 * THE ONE ECONOMIC ROW, AND WHY IT EXISTS
 *
 * PricingSettings is written, because the platform requires it before any
 * route can resolve at all: loadPricingSettings throws "Onboarding must create
 * them; they are not defaulted." The real onboarding path writes them too.
 *
 * All four columns are non-null Ints, so there is no way to say "not decided
 * yet" — onboarding has to commit four business decisions before a homeowner
 * can be asked a single question. That is the same "zero is never unknown"
 * problem the material lifecycle solved, still unsolved here, and it is
 * recorded rather than worked around.
 *
 * The figures below are deliberately synthetic and deliberately unlike any
 * real tenant's, so the isolation proof can assert they are not Elite's. They
 * reach no customer: every V2 route returns REVIEW at the component-approval
 * gate long before a crew-hour rate is multiplied by anything.
 *
 *   npx tsx scripts/provision-routing-v2-proof-contractor.ts          # report
 *   npx tsx scripts/provision-routing-v2-proof-contractor.ts --apply
 *   npx tsx scripts/provision-routing-v2-proof-contractor.ts --reset  # remove it
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { hostedSlugProblem } from "../lib/siteRouting";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");

/** Obviously test-only. Nobody should mistake this for a tenant. */
export const PROOF_SLUG = "rv2-proof-electric-test";
const PROOF_NAME = "Routing V2 Proof Electric (TEST — not a real contractor)";

async function reset() {
  const c = await prisma.contractor.findUnique({ where: { slug: PROOF_SLUG }, select: { id: true } });
  if (!c) { console.log(`  ${PROOF_SLUG} does not exist.\n`); return; }
  // Scoped to this contractor at every step. A reset that swept a shared table
  // would be a worse accident than anything it is clearing up.
  const services = await prisma.service.findMany({ where: { contractorId: c.id }, select: { id: true } });
  const ids = services.map((s) => s.id);
  await prisma.answerOptionComponent.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } });
  await prisma.answerOptionMaterial.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } });
  await prisma.answerOptionDisclaimer.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } });
  await prisma.answerOptionPhotoGroup.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } });
  await prisma.answerOption.deleteMany({ where: { question: { serviceId: { in: ids } } } });
  await prisma.question.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.service.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorComponent.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorMaterial.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorDisclaimer.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorCapability.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorPolicyValue.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorCategory.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorTrade.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorSite.deleteMany({ where: { contractorId: c.id } });
  await prisma.pricingSettings.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractor.delete({ where: { id: c.id } });
  console.log(`  ${PROOF_SLUG} removed (${ids.length} services).\n`);
}

async function main() {
  console.log(`\nPROVISION A BRAND-NEW CONTRACTOR  [${RESET ? "RESET" : APPLY ? "APPLY" : "REPORT"}]\n`);
  if (RESET) { await reset(); await prisma.$disconnect(); return; }

  const existing = await prisma.contractor.findUnique({
    where: { slug: PROOF_SLUG }, select: { id: true } });
  if (existing) {
    console.log(`  ${PROOF_SLUG} already exists (${existing.id}).`);
    console.log(`  Re-run with --reset first; this proof is only meaningful from nothing.\n`);
    await prisma.$disconnect();
    return;
  }

  // What a signup today would resolve to, reported before anything is written.
  const source = templateVersionSource(prisma, "electrical");
  const catalog = await source.load();
  const outlet = (catalog.services as Record<string, unknown>[]).find((s) => s.key === "new-120v-outlet");
  console.log(`  catalog: ${catalog.services.length} services`);
  console.log(`  new-120v-outlet present: ${outlet ? "yes" : "NO"}`);
  if (outlet) {
    const qs = (outlet as { questions: { key: string }[] }).questions ?? [];
    console.log(`    ${qs.length} questions: ${qs.map((q) => q.key).join(", ")}`);
  }
  if (!APPLY) { console.log(`\n  Report only — nothing written.\n`); await prisma.$disconnect(); return; }

  if (hostedSlugProblem(PROOF_SLUG)) throw new Error(`bad storefront address: ${PROOF_SLUG}`);

  const c = await prisma.contractor.create({
    data: {
      slug: PROOF_SLUG, name: PROOF_NAME, active: true,
      trade: "residential electrician",
      legalName: "Routing V2 Proof Electric (TEST)",
      countryCode: "US", city: "Trenton", state: "NJ", postalCode: "08608",
      schedulingAuthority: "NATIVE",
    },
    select: { id: true },
  });
  console.log(`\n  1  contractor created  ${c.id}`);

  await prisma.contractorSite.create({
    data: { contractorId: c.id, hostedSlug: PROOF_SLUG,
            publicId: `site_${randomBytes(16).toString("hex")}`, active: true },
  });
  console.log(`  2  storefront at /${PROOF_SLUG}`);

  await prisma.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
  console.log(`  3  enrolled in electrical`);

  const pre = await preflight(prisma, c.id, templateVersionSource(prisma, "electrical"));
  if (!pre.ok) throw new Error(`${pre.code}: ${pre.message}`);
  const install = await installCatalog(prisma, c.id, pre.catalog);
  console.log(`  4  installed ${install.services} services, ` +
              `${install.unresolvedMaterialRoles} material roles uncosted`);

  // Obviously fake. Not Elite's 25000, not BrightPath's 21500 — a number no
  // business would choose, so a leak is visible rather than plausible.
  await prisma.pricingSettings.create({
    data: {
      contractorId: c.id,
      crewHourRateCents: 11111,
      primaryMinimumCents: 11111,
      roundingIncrementCents: 100,
      defaultPermitAdminCents: 0,
    },
  });
  console.log(`  5  pricing settings written (synthetic $111.11/crew-hour — the platform`);
  console.log(`     refuses to resolve any route without them)`);

  console.log(`\n  No prices, no activation, no capabilities, no service selection.`);
  console.log(`  That is day one, and the acceptance suite reads it as it is.\n`);
  await prisma.$disconnect();
}

// Guarded: this module EXPORTS PROOF_SLUG, and several suites import it. An
// unguarded call meant importing the name also provisioned a contractor —
// side effects on import, printed into the middle of other suites' output.
if (process.argv[1] && process.argv[1].endsWith("provision-routing-v2-proof-contractor.ts")) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
