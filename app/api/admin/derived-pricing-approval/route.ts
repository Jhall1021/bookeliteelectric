/**
 * Approving the economics a derived service prices from.
 *
 * A contractor approves the price their CURRENT costs, labour and pricing
 * decisions produce. Two refusals protect that:
 *
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
 */
import { pilotLog } from "@/lib/electrical/pilotLog";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { proposeDerivedScope } from "@/lib/electrical/loadDerivedScope";
import { PILOT_ANSWERS } from "@/lib/electrical/onboardingPilotReadiness";
import { routeShapeFromAnswers } from "@/lib/electrical/resolveWithDerivedPricing";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "@/lib/routeResolver";

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as { action?: "approve" | "withdraw"; serviceId?: string; expectedFingerprint?: string };
  if (!body.serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 });

  return withAdminContractor(async (db, ctx) => {
    const service = await db.service.findFirst({
      where: { id: body.serviceId, contractorId: ctx.contractorId },
      select: { id: true, pricingMethod: true, name: true, isPrimaryEligible: true,
                materialMultiplier: true, permitAdminCents: true, otherDirectCostCents: true },
    });
    if (!service) return NextResponse.json({ error: "No such service for this contractor." }, { status: 404 });

    if (body.action === "withdraw") {
      await db.contractorDerivedPricingApproval.deleteMany({
        where: { contractorId: ctx.contractorId, serviceId: service.id } });
      return NextResponse.json({ ok: true, approved: false });
    }
    if (service.pricingMethod !== "DERIVED_RESOLVED_SCOPE") {
      return NextResponse.json(
        { error: `${service.name} uses a published price; there is nothing calculated to approve.` },
        { status: 400 });
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
      return NextResponse.json(
        { error: "NOT_READY_TO_APPROVE", message: proposal.reason, detail: proposal.detail ?? [] },
        { status: 409 });
    }
    if (body.expectedFingerprint && body.expectedFingerprint !== basisFingerprint) {
      pilotLog("price_approval", { contractorId: ctx.contractorId, serviceId: service.id, step: "approval", outcome: "refused", status: 409, code: "PRICE_CHANGED" });
      return NextResponse.json(
        { error: "PRICE_CHANGED", message: "Your costs changed while this was open. Review the updated price and approve again." },
        { status: 409 });
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
    return NextResponse.json({ ok: true, approved: true, ...row });
  });
}
