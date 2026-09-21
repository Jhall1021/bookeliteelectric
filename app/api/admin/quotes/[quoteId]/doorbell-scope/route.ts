import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { loadConnectedDeviceLaborFacts } from "@/lib/electrical/connectedDeviceLaborFacts";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { suggestPrimaryPrice } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";

const SLUG = "new-video-doorbell-wiring";
const EXPECTED_ANSWERS: Record<string, string> = {
  doorbell_existing: "none",
  doorbell_access: "accessible",
  doorbell_surface: "standard",
  doorbell_supply: "customer",
  doorbell_chime: "no_chime",
};

export async function POST(_req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    const quote = await db.quote.findUnique({ where: { id: params.quoteId }, include: { service: true } });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (quote.status !== "SUBMITTED" && quote.status !== "IN_REVIEW") return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    if (quote.service.slug !== SLUG) return NextResponse.json({ error: "This is not the standard new-doorbell package." }, { status: 409 });
    const answers = quote.answersSnapshot as Record<string, string>;
    if (!Object.entries(EXPECTED_ANSWERS).every(([key, value]) => answers[key] === value)) {
      return NextResponse.json({ error: "This request falls outside the standard new-doorbell package." }, { status: 409 });
    }
    if (!quote.service.materialCostResolved || quote.service.materialCostCents === null) {
      return NextResponse.json({ error: "Approve this service's material package before calculating its price." }, { status: 409 });
    }

    const materials = await db.serviceMaterial.findMany({
      where: { serviceId: quote.serviceId, canonicalMaterial: { key: { in: ["WIRE_BELL_18_2", "DOORBELL_TRANSFORMER"] } } },
      select: { quantity: true, canonicalMaterial: { select: { key: true } } },
    });
    const materialByKey = new Map(materials.flatMap((line) => line.canonicalMaterial ? [[line.canonicalMaterial.key, line.quantity] as const] : []));
    const routeFeet = materialByKey.get("WIRE_BELL_18_2") ?? null;
    const transformerCount = materialByKey.get("DOORBELL_TRANSFORMER") ?? null;
    if (routeFeet === null || routeFeet <= 0 || transformerCount === null || transformerCount < 1) {
      return NextResponse.json({ error: "Approve a positive doorbell-wire allowance and one transformer before calculating this package." }, { status: 409 });
    }

    const [storedDecisions, commissioningFacts, settings] = await Promise.all([
      db.contractorLaborOperationDecision.findMany({
        where: { contractorId: ctx.contractorId, trade: "electrical" },
        select: { operationKey: true, hoursPerUnit: true, source: true },
      }),
      loadConnectedDeviceLaborFacts(db as never, ctx.contractorId),
      loadPricingSettings(db as never, ctx.contractorId),
    ]);
    if (!commissioningFacts) return NextResponse.json({ error: "Choose whether connected-device commissioning is included before calculating this package." }, { status: 409 });
    const labor = projectElectricalServiceLabor(SLUG, storedDecisions, {
      routeFeet,
      platePenetrationRequired: true,
      newTransformerRequired: true,
      ...commissioningFacts,
    });
    if (labor.kind !== "READY_FOR_APPROVAL") {
      return NextResponse.json({ error: "Approve every atomic labor operation used by this package before calculating its price.", code: labor.kind }, { status: 409 });
    }
    const suggestion = suggestPrimaryPrice(quote.service, settings, { fieldLaborHours: labor.suggestedHours });
    if (suggestion.totalCents === null) return NextResponse.json({ error: suggestion.unavailableReason ?? "This package is not ready to price." }, { status: 409 });

    const basisFingerprint = createHash("sha256").update(JSON.stringify({
      serviceId: quote.serviceId,
      routeFeet,
      transformerCount,
      platePenetrationRequired: true,
      commissioningFacts,
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
          routeFeet: { value: routeFeet, source: "CONTRACTOR_POLICY" },
          platePenetrationRequired: { value: true, source: "GUIDED_PHOTO_REVIEW" },
          newTransformerRequired: { value: true, source: "SYSTEM_DERIVED" },
          commissioningIncluded: { value: commissioningFacts.commissioningIncluded, source: "CONTRACTOR_POLICY" },
        },
        reviewSuggestedPriceCents: suggestion.totalCents,
        reviewBasisFingerprint: basisFingerprint,
        reviewedAt: new Date(),
        status: "IN_REVIEW",
      },
    });
    if (touched.count !== 1) return NextResponse.json({ error: "Quote changed while it was being reviewed. Reload and try again." }, { status: 409 });
    return NextResponse.json({
      ok: true, suggestedPriceCents: suggestion.totalCents, laborHours: labor.suggestedHours,
      materialCostCents: quote.service.materialCostCents, routeFeet, basisFingerprint, sent: false,
    });
  });
}
