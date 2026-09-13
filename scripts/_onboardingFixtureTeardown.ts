/**
 * Tear down an onboarding fixture contractor — including what the HOMEOWNER side made.
 *
 * `destroyContractor` follows the graph a catalog install creates. The HTTP
 * smoke and browser walkthrough go further: a homeowner books through
 * /api/visit (visits, line items), the contractor approves a price, declares a
 * material system and selects supplier products. Line items hold a RESTRICT
 * foreign key to services, so the install-shaped teardown failed — and the
 * first versions of these scripts wrapped it in `.catch(() => {})`, which left
 * four contractors with contractor-owned labor behind and turned two unrelated
 * suites red. A teardown that fails must say so.
 *
 * Refuses any slug that is not one of the known throwaway prefixes, so it can
 * never be pointed at a real tenant.
 */
import type { PrismaClient } from "@prisma/client";
import { destroyContractor } from "./_throwaway";

const THROWAWAY = [/^rv2-http-smoke-/, /^rv2-walkthrough-/];

export async function teardownOnboardingFixture(prisma: PrismaClient, slug: string): Promise<void> {
  if (!THROWAWAY.some((re) => re.test(slug))) {
    throw new Error(`refusing to tear down "${slug}" — not a throwaway onboarding fixture`);
  }
  const c = await prisma.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  const visits = await prisma.visit.findMany({ where: { contractorId: c.id }, select: { id: true } });
  const visitIds = visits.map((v) => v.id);
  if (visitIds.length) {
    await prisma.lineItem.deleteMany({ where: { visitId: { in: visitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: visitIds } } });
  }
  await prisma.contractorDerivedPricingApproval.deleteMany({ where: { contractorId: c.id } });
  const mats = await prisma.contractorMaterial.findMany({ where: { contractorId: c.id }, select: { id: true } });
  if (mats.length) {
    await prisma.contractorMaterial.updateMany({ where: { contractorId: c.id }, data: { activeSupplierLinkId: null } });
    await prisma.materialSupplierLink.deleteMany({ where: { contractorMaterialId: { in: mats.map((m) => m.id) } } });
  }
  await prisma.contractorMaterialSystem.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorComponent.deleteMany({ where: { contractorId: c.id } });
  await destroyContractor(prisma, slug);   // throws on failure — deliberately not caught
  if (await prisma.contractor.findUnique({ where: { slug }, select: { id: true } })) {
    throw new Error(`teardown of ${slug} reported success but the contractor still exists`);
  }
}
