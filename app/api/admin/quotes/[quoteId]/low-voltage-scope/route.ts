import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { suggestPrimaryPrice } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";

const SUPPORTED = new Set(["new-ethernet-line", "new-coax-line"]);
const POLICY_KEY = "data_cable_run.breakpoints";

export async function POST(_req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    const quote = await db.quote.findUnique({ where: { id: params.quoteId }, include: { service: true } });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (quote.status !== "SUBMITTED" && quote.status !== "IN_REVIEW") {
      return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    }
    const slug = quote.service.slug;
    if (!SUPPORTED.has(slug)) return NextResponse.json({ error: "This is not a supported low-voltage package." }, { status: 409 });

    const answers = quote.answersSnapshot as Record<string, string>;
    if (answers[`${slug}_route_access`] !== "accessible" || answers[`${slug}_distance`] !== "standard") {
      return NextResponse.json({ error: "Only the homeowner's standard accessible-route branch can use this package." }, { status: 409 });
    }

    const policy = await db.contractorPolicyValue.findUnique({
      where: { contractorId_key: { contractorId: ctx.contractorId, key: POLICY_KEY } },
      select: { boundaries: true, resolvedAt: true },
    });
    const packageFeet = policy?.resolvedAt && policy.boundaries.length === 1 ? policy.boundaries[0] : null;
    if (!packageFeet || packageFeet <= 0) {
      return NextResponse.json({ error: "Set your standard data-cable distance in onboarding before calculating this package." }, { status: 409 });
    }
    if (!quote.service.materialCostResolved || quote.service.materialCostCents === null) {
      return NextResponse.json({ error: "Approve this service's standard material package before calculating its price." }, { status: 409 });
    }
    const cableRole = slug === "new-ethernet-line" ? "CABLE_CAT6" : "CABLE_RG6";
    const cableLine = await db.serviceMaterial.findFirst({
      where: { serviceId: quote.serviceId, canonicalMaterial: { key: cableRole } },
      select: { quantity: true },
    });
    if (cableLine?.quantity === null || cableLine?.quantity === undefined || cableLine.quantity < packageFeet) {
      return NextResponse.json({
        error: `Your approved ${cableRole} package must cover at least ${packageFeet} feet before calculating this standard route.`,
      }, { status: 409 });
    }

    const decisions = await db.contractorLaborOperationDecision.findMany({
      where: { contractorId: ctx.contractorId, trade: "electrical" },
      select: { operationKey: true, hoursPerUnit: true, source: true },
    });
    const labor = projectElectricalServiceLabor(slug, decisions, {
      accessibleRoute: true,
      finishedRoute: false,
      accessibleRouteFeet: packageFeet,
    });
    if (labor.kind !== "READY_FOR_APPROVAL") {
      return NextResponse.json({
        error: "Approve every atomic labor operation used by this package before calculating its price.",
        code: labor.kind,
      }, { status: 409 });
    }

    const settings = await loadPricingSettings(db as never, ctx.contractorId);
    const suggestion = suggestPrimaryPrice(quote.service, settings, { fieldLaborHours: labor.suggestedHours });
    if (suggestion.totalCents === null) {
      return NextResponse.json({ error: suggestion.unavailableReason ?? "This package is not ready to price." }, { status: 409 });
    }
    const basisFingerprint = createHash("sha256").update(JSON.stringify({
      serviceId: quote.serviceId,
      packageFeet,
      cableRole,
      cableQuantity: cableLine.quantity,
      labor: labor.projection.lines,
      materialCostCents: quote.service.materialCostCents,
      materialMultiplier: quote.service.materialMultiplier,
      permitAdminCents: quote.service.permitAdminCents,
      otherDirectCostCents: quote.service.otherDirectCostCents,
      settings,
    })).digest("hex");

    const touched = await db.quote.updateMany({
      where: { id: quote.id, status: { in: ["SUBMITTED", "IN_REVIEW"] } },
      data: {
        reviewFactsSnapshot: {
          routeAccess: { value: "ACCESSIBLE", source: "HOMEOWNER_CONTEXT" },
          standardPackageFeet: { value: packageFeet, source: "CONTRACTOR_POLICY" },
        },
        reviewSuggestedPriceCents: suggestion.totalCents,
        reviewBasisFingerprint: basisFingerprint,
        reviewedAt: new Date(),
        status: "IN_REVIEW",
      },
    });
    if (touched.count !== 1) return NextResponse.json({ error: "Quote changed while it was being reviewed. Reload and try again." }, { status: 409 });

    return NextResponse.json({
      ok: true,
      suggestedPriceCents: suggestion.totalCents,
      laborHours: labor.suggestedHours,
      materialCostCents: quote.service.materialCostCents,
      packageFeet,
      basisFingerprint,
      sent: false,
    });
  });
}
