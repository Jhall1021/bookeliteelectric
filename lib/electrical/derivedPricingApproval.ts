/**
 * Approving the economics a derived service prices from.
 *
 * A contractor approves the price their CURRENT costs, labour and pricing
 * decisions produce. Three refusals protect that:
 *
 *   - Only a contractor this pilot supports may approve. Stage 1A is a
 *     fixed-price pilot (lib/electrical/pilotEligibility.ts): a derived fixed
 *     total is not what a time-and-materials storefront shows, so approving one
 *     would record a price no homeowner is offered. Refused with a named code.
 *   - Nothing incomplete can be approved. The first authenticated HTTP pass
 *     approved a basis whose material takeoff could not be computed; the
 *     service then activated and every homeowner route went to review. The
 *     basis is now evaluated server-side and approval is refused, with the
 *     specific reason, unless approving is the only thing left.
 *   - A screen left open while a cost changed cannot approve the old numbers.
 *     The client echoes the token it was shown; any difference is a 409.
 *
 * The totals recorded for audit are computed HERE, never taken from the
 * request body — a client-supplied figure is exactly the kind of number that
 * should not be able to reach an approval record.
 *
 * The whole decision lives here so /api/admin/derived-pricing-approval is a
 * thin authenticated door, and the proofs exercise the code that decides.
 */
import type { PrismaClient } from "@prisma/client";
import { pilotLog } from "./pilotLog";
import { proposeDerivedScope } from "./loadDerivedScope";
import { PILOT_ANSWERS } from "./onboardingPilotReadiness";
import { routeShapeFromAnswers } from "./resolveWithDerivedPricing";
import { loadPilotEligibility } from "./pilotEligibility";
import { pilotRefusalBody } from "./pilotRefusal";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../routeResolver";

export type ApprovalRequest = { action?: "approve" | "withdraw"; serviceId?: string; expectedFingerprint?: string };
export type ApprovalOutcome = { status: number; body: Record<string, unknown> };

export async function decideDerivedPricingApproval(
  db: PrismaClient,
  ctx: { contractorId: string; userId?: string | null },
  body: ApprovalRequest,
): Promise<ApprovalOutcome> {
  if (!body.serviceId) return { status: 400, body: { error: "serviceId required" } };

  const service = await db.service.findFirst({
    where: { id: body.serviceId, contractorId: ctx.contractorId },
    select: { id: true, pricingMethod: true, name: true, isPrimaryEligible: true,
              materialMultiplier: true, permitAdminCents: true, otherDirectCostCents: true },
  });
  if (!service) return { status: 404, body: { error: "No such service for this contractor." } };

  // Withdrawing only ever removes an approval, which is the safe direction for
  // every contractor — including one this pilot does not support.
  if (body.action === "withdraw") {
    await db.contractorDerivedPricingApproval.deleteMany({
      where: { contractorId: ctx.contractorId, serviceId: service.id } });
    return { status: 200, body: { ok: true, approved: false } };
  }
  if (service.pricingMethod !== "DERIVED_RESOLVED_SCOPE") {
    return { status: 400, body: { error: `${service.name} uses a published price; there is nothing calculated to approve.` } };
  }

  const eligibility = await loadPilotEligibility(db, ctx.contractorId);
  if (!eligibility.eligible) {
    pilotLog("price_approval", { contractorId: ctx.contractorId, serviceId: service.id, step: "approval", outcome: "refused", status: 409, code: eligibility.code });
    return { status: 409, body: pilotRefusalBody(eligibility) };
  }

  // The representative route the price is reviewed on — the same one the
  // readiness screen shows, so the contractor approves what they saw.
  const loaded = await loadServiceForResolution(db, service.id);
  let settings: unknown = null;
  try { settings = await loadPricingSettings(db, ctx.contractorId); } catch { settings = null; }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const resolved = loaded ? (resolveRoute(loaded as never, PILOT_ANSWERS, true, settings as never) as any) : null;
  const components = (resolved?.config?.components ?? []) as { key: string; quantity: number }[];
  const shape = routeShapeFromAnswers(PILOT_ANSWERS);

  const { proposal, basisFingerprint } = await proposeDerivedScope(db, {
    contractorId: ctx.contractorId, serviceId: service.id, components,
    routeFeet: shape.routeFeet, turnCount: shape.turnCount,
    context: { isPrimary: true, isPrimaryEligible: service.isPrimaryEligible,
               servicePermitAdminEstablished: service.permitAdminCents !== null },
    service: { materialMultiplier: service.materialMultiplier, permitAdminCents: service.permitAdminCents,
               otherDirectCostCents: service.otherDirectCostCents, isPrimaryEligible: service.isPrimaryEligible },
  });

  if (proposal.kind !== "PRICED") {
    pilotLog("price_approval", { contractorId: ctx.contractorId, serviceId: service.id, step: "approval", outcome: "refused", status: 409, code: proposal.code });
    return { status: 409, body: { error: "NOT_READY_TO_APPROVE", message: proposal.reason, detail: proposal.detail ?? [] } };
  }
  if (body.expectedFingerprint && body.expectedFingerprint !== basisFingerprint) {
    pilotLog("price_approval", { contractorId: ctx.contractorId, serviceId: service.id, step: "approval", outcome: "refused", status: 409, code: "PRICE_CHANGED" });
    return { status: 409, body: { error: "PRICE_CHANGED", message: "Your costs changed while this was open. Review the updated price and approve again." } };
  }

  const data = {
    approvedBasisFingerprint: basisFingerprint,
    approvedTotalCents: proposal.totalCents,
    approvedLaborCents: Math.round(proposal.breakdown.laborCents),
    approvedMaterialCents: proposal.breakdown.materialCents,
    approvedAt: new Date(),
    approvedByUserId: ctx.userId ?? null,
  };
  const row = await db.contractorDerivedPricingApproval.upsert({
    where: { contractorId_serviceId: { contractorId: ctx.contractorId, serviceId: service.id } },
    update: data,
    create: { contractorId: ctx.contractorId, serviceId: service.id, ...data },
    select: { approvedTotalCents: true, approvedAt: true },
  });
  pilotLog("price_approval", { contractorId: ctx.contractorId, serviceId: service.id, step: "approval", outcome: "ok", totalCents: row.approvedTotalCents });
  return { status: 200, body: { ok: true, approved: true, ...row } };
}
