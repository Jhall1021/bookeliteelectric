/**
 * Return a REHEARSAL contractor to "catalog not installed" so onboarding can
 * be walked again — without hand-written SQL.
 *
 * RESET BOUNDARY: everything the catalog install and the first-service wizard
 * create, and nothing about who the contractor is.
 *
 *   removed   provisioned services and their questions, options, rules and
 *             materials; contractor categories; policy decisions; material
 *             costs, product links and their cost history; material system;
 *             labor calibration; pricing settings; price approvals; and the
 *             TEST visits, line items, quotes and photos homeowner rehearsal
 *             created against those services.
 *   kept      the contractor, its storefront site, memberships, trade
 *             enrolment, and every user account.
 *
 * REFUSED, not trimmed, when the contractor has any Booking or payment. A
 * rehearsal contractor with a real booking is no longer only a rehearsal, and
 * deleting a booking is not something a reset should ever decide to do.
 *
 * It removes cost-event history for the reset materials. That is rehearsal
 * data by construction — the eligibility check refuses anything else.
 */
import type { PrismaClient } from "@prisma/client";
import { resetRefusal, type ResetRefusal } from "./pilotScope";

export type ResetCounts = Record<string, number>;

export type ResetResult =
  | { ok: true; dryRun: boolean; contractorId: string; counts: ResetCounts; kept: ResetCounts }
  | { ok: false; refusal: ResetRefusal };

export async function resetPilotContractor(
  db: PrismaClient,
  args: { slug: string; liveEndpoint: string; dryRun: boolean },
): Promise<ResetResult> {
  const identity = await db.databaseIdentity.findUnique({
    where: { id: "singleton" }, select: { key: true, neonEndpoint: true } });
  const refusal = resetRefusal({ slug: args.slug, identity, liveEndpoint: args.liveEndpoint });
  if (refusal) return { ok: false, refusal };

  const c = await db.contractor.findUnique({ where: { slug: args.slug }, select: { id: true } });
  if (!c) return { ok: false, refusal: { code: "UNKNOWN_CONTRACTOR", message: `No contractor with slug ${args.slug}.` } };
  const contractorId = c.id;

  const visits = await db.visit.findMany({ where: { contractorId }, select: { id: true } });
  const visitIds = visits.map((v) => v.id);
  const bookings = await db.booking.count({ where: { visitId: { in: visitIds } } });
  if (bookings > 0) {
    return { ok: false, refusal: { code: "HAS_REAL_BOOKINGS",
      message: `${args.slug} has ${bookings} booking(s). Reset never deletes bookings — remove them deliberately first if they are test data.` } };
  }

  const services = await db.service.findMany({ where: { contractorId }, select: { id: true } });
  const serviceIds = services.map((s) => s.id);
  const materials = await db.contractorMaterial.findMany({ where: { contractorId }, select: { id: true } });
  const materialIds = materials.map((m) => m.id);
  const quotes = await db.quote.findMany({ where: { serviceId: { in: serviceIds } }, select: { id: true } });
  const quoteIds = quotes.map((q) => q.id);
  const lineItems = await db.lineItem.findMany({ where: { visitId: { in: visitIds } }, select: { id: true } });

  const counts: ResetCounts = {
    services: serviceIds.length,
    questions: await db.question.count({ where: { serviceId: { in: serviceIds } } }),
    contractorCategories: await db.contractorCategory.count({ where: { contractorId } }),
    policyDecisions: await db.contractorPolicyValue.count({ where: { contractorId } }),
    materialCosts: materialIds.length,
    productLinks: await db.materialSupplierLink.count({ where: { contractorMaterialId: { in: materialIds } } }),
    materialSystems: await db.contractorMaterialSystem.count({ where: { contractorId } }),
    laborCalibrations: await db.contractorComponent.count({ where: { contractorId } }),
    pricingSettings: await db.pricingSettings.count({ where: { contractorId } }),
    priceApprovals: await db.contractorDerivedPricingApproval.count({ where: { contractorId } }),
    testVisits: visitIds.length,
    testLineItems: lineItems.length,
    testQuotes: quoteIds.length,
  };
  const kept: ResetCounts = {
    contractor: 1,
    sites: await db.contractorSite.count({ where: { contractorId } }),
    memberships: await db.contractorMembership.count({ where: { contractorId } }),
    tradeEnrolments: await db.contractorTrade.count({ where: { contractorId } }),
  };
  if (args.dryRun) return { ok: true, dryRun: true, contractorId, counts, kept };

  await db.$transaction(async (tx) => {
    await tx.photo.deleteMany({ where: { OR: [{ quoteId: { in: quoteIds } }, { lineItemId: { in: lineItems.map((l) => l.id) } }] } });
    await tx.quote.deleteMany({ where: { id: { in: quoteIds } } });
    await tx.lineItem.deleteMany({ where: { visitId: { in: visitIds } } });
    await tx.visit.deleteMany({ where: { id: { in: visitIds } } });
    await tx.contractorDerivedPricingApproval.deleteMany({ where: { contractorId } });
    await tx.contractorMaterial.updateMany({ where: { contractorId }, data: { activeSupplierLinkId: null } });
    await tx.materialSupplierLink.deleteMany({ where: { contractorMaterialId: { in: materialIds } } });
    await tx.contractorMaterial.deleteMany({ where: { contractorId } });          // cost events cascade
    await tx.contractorMaterialSystem.deleteMany({ where: { contractorId } });
    await tx.contractorComponent.deleteMany({ where: { contractorId } });
    await tx.contractorPolicyValue.deleteMany({ where: { contractorId } });
    await tx.pricingSettings.deleteMany({ where: { contractorId } });
    await tx.answerOption.updateMany({ where: { question: { serviceId: { in: serviceIds } } }, data: { rerouteServiceId: null } });
    await tx.answerOption.deleteMany({ where: { question: { serviceId: { in: serviceIds } } } });
    await tx.question.deleteMany({ where: { serviceId: { in: serviceIds } } });
    await tx.pricingRule.deleteMany({ where: { serviceId: { in: serviceIds } } });
    await tx.serviceMaterial.deleteMany({ where: { serviceId: { in: serviceIds } } });
    await tx.service.deleteMany({ where: { contractorId } });
    await tx.contractorCategory.deleteMany({ where: { contractorId } });
  }, { timeout: 120000 });

  return { ok: true, dryRun: false, contractorId, counts, kept };
}
