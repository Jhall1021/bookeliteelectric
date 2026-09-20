import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "@/lib/routeResolver";
import { proposeDerivedScope } from "@/lib/electrical/loadDerivedScope";
import { ACCESSIBLE_KEYS } from "@/prisma/_concealedRouteModules";

export async function PATCH(req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    let body: { accessibleRouteFeet?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    const feet = body.accessibleRouteFeet;
    if (typeof feet !== "number" || !Number.isFinite(feet) || feet < 1 || feet > 300) {
      return NextResponse.json({ error: "Confirmed accessible route must be between 1 and 300 feet." }, { status: 400 });
    }

    const quote = await db.quote.findUnique({
      where: { id: params.quoteId },
      include: { service: true, lineItem: { select: { isPrimary: true } } },
    });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (quote.status !== "SUBMITTED" && quote.status !== "IN_REVIEW") {
      return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    }
    if (quote.service.pricingMethod !== "DERIVED_RESOLVED_SCOPE") {
      return NextResponse.json({ error: "This service does not use resolved-scope pricing." }, { status: 409 });
    }

    const homeownerAnswers = quote.answersSnapshot as Record<string, string>;
    if (!(ACCESSIBLE_KEYS.feet in homeownerAnswers)) {
      return NextResponse.json({ error: "This request is not an accessible-route review." }, { status: 409 });
    }
    const reviewedAnswers = { ...homeownerAnswers, [ACCESSIBLE_KEYS.feet]: String(feet) };
    const [loaded, settings] = await Promise.all([
      loadServiceForResolution(db as never, quote.serviceId),
      loadPricingSettings(db as never, ctx.contractorId),
    ]);
    if (!loaded) return NextResponse.json({ error: "Service not found." }, { status: 404 });
    const resolved = resolveRoute(loaded, reviewedAnswers, true, settings) as ReturnType<typeof resolveRoute>;
    const components = ("config" in resolved ? resolved.config?.components ?? [] : []) as { key: string; quantity: number }[];
    const routeLine = components.find((component) => component.key === "CONCEALED_ROUTE_FT");
    if (!components.some((component) => component.key === "ELEC_ROUTE_ACCESSIBLE_CONCEALED") || routeLine?.quantity !== feet) {
      return NextResponse.json({ error: "The confirmed measurement no longer matches this quote's accessible route." }, { status: 409 });
    }

    const { proposal, basisFingerprint } = await proposeDerivedScope(db as never, {
      contractorId: ctx.contractorId,
      serviceId: quote.serviceId,
      components,
      routeFeet: feet,
      turnCount: 0,
      context: {
        isPrimary: quote.lineItem?.isPrimary ?? true,
        isPrimaryEligible: quote.service.isPrimaryEligible,
        servicePermitAdminEstablished: quote.service.permitAdminCents !== null,
      },
      service: {
        materialMultiplier: quote.service.materialMultiplier,
        permitAdminCents: quote.service.permitAdminCents,
        otherDirectCostCents: quote.service.otherDirectCostCents,
        isPrimaryEligible: quote.service.isPrimaryEligible,
      },
    });
    if (proposal.kind !== "PRICED") {
      return NextResponse.json({ error: proposal.reason, code: proposal.code, detail: proposal.detail ?? [] }, { status: 409 });
    }

    const touched = await db.quote.updateMany({
      where: { id: quote.id, status: { in: ["SUBMITTED", "IN_REVIEW"] } },
      data: {
        reviewFactsSnapshot: {
          accessibleRouteFeet: { value: feet, source: "CONTRACTOR_MEASUREMENT" },
        },
        reviewSuggestedPriceCents: proposal.totalCents,
        reviewBasisFingerprint: basisFingerprint,
        reviewedAt: new Date(),
        status: "IN_REVIEW",
      },
    });
    if (touched.count !== 1) return NextResponse.json({ error: "Quote changed while it was being reviewed. Reload and try again." }, { status: 409 });

    return NextResponse.json({
      ok: true,
      suggestedPriceCents: proposal.totalCents,
      laborHours: proposal.laborHours,
      materialCostCents: proposal.materialCostCents,
      basisFingerprint,
      sent: false,
    });
  });
}
