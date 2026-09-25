import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { loadConnectedDeviceLaborFacts } from "@/lib/electrical/connectedDeviceLaborFacts";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { suggestPrimaryPrice } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";

const SLUG = "new-exterior-flood-camera";
const EXPECTED_ANSWERS: Record<string, string> = {
  flood_camera_connection: "hardwired",
  flood_camera_location: "new_location",
  flood_camera_power_source: "back_to_back",
};
const INCLUDED_HEIGHTS = new Set(["under_20"]);

export async function POST(_req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    const quote = await db.quote.findUnique({ where: { id: params.quoteId }, include: { service: true } });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (quote.status !== "SUBMITTED" && quote.status !== "IN_REVIEW") return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    if (quote.service.slug !== SLUG) return NextResponse.json({ error: "This is not the reviewed hardwired floodlight-camera package." }, { status: 409 });

    const answers = quote.answersSnapshot as Record<string, string>;
    if (!Object.entries(EXPECTED_ANSWERS).every(([key, value]) => answers[key] === value)
      || !INCLUDED_HEIGHTS.has(answers.flood_camera_height)) {
      return NextResponse.json({ error: "This request falls outside the reviewed hardwired back-to-back package." }, { status: 409 });
    }
    if (!quote.service.materialCostResolved || quote.service.materialCostCents === null) {
      return NextResponse.json({ error: "Approve this service's material package before calculating its price." }, { status: 409 });
    }

    const materials = await db.serviceMaterial.findMany({
      where: { serviceId: quote.serviceId, canonicalMaterial: { key: { in: ["WIRE_12_2", "BOX_CEILING_STANDARD"] } } },
      select: { quantity: true, canonicalMaterial: { select: { key: true } } },
    });
    const materialByKey = new Map(materials.flatMap((line) => line.canonicalMaterial ? [[line.canonicalMaterial.key, line.quantity] as const] : []));
    const cableAllowanceFeet = materialByKey.get("WIRE_12_2") ?? null;
    const fixtureBoxCount = materialByKey.get("BOX_CEILING_STANDARD") ?? null;
    if (cableAllowanceFeet === null || cableAllowanceFeet <= 0 || fixtureBoxCount === null || fixtureBoxCount < 1) {
      return NextResponse.json({ error: "Approve a positive cable allowance and one fixture box before calculating this package." }, { status: 409 });
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
      backToBackRoute: true,
      accessibleRoute: false,
      finishedRoute: false,
      ...commissioningFacts,
    });
    if (labor.kind !== "READY_FOR_APPROVAL") {
      return NextResponse.json({ error: "Approve every atomic labor operation used by this package before calculating its price.", code: labor.kind }, { status: 409 });
    }
    const suggestion = suggestPrimaryPrice(quote.service, settings, { fieldLaborHours: labor.suggestedHours });
    if (suggestion.totalCents === null) return NextResponse.json({ error: suggestion.unavailableReason ?? "This package is not ready to price." }, { status: 409 });

    const basisFingerprint = createHash("sha256").update(JSON.stringify({
      serviceId: quote.serviceId,
      backToBackRoute: true,
      heightBand: answers.flood_camera_height,
      cableAllowanceFeet,
      fixtureBoxCount,
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
          backToBackRoute: { value: true, source: "GUIDED_PHOTO_REVIEW" },
          heightBand: { value: answers.flood_camera_height, source: "GUIDED_PHOTO_REVIEW" },
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
      ok: true,
      suggestedPriceCents: suggestion.totalCents,
      laborHours: labor.suggestedHours,
      materialCostCents: quote.service.materialCostCents,
      basisFingerprint,
      sent: false,
    });
  });
}
