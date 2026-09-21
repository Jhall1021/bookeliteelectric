import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { reviewedLandscapeLightingPackage } from "@/lib/electrical/landscapeLightingReviewPackage";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { assembleMaterialCostCents } from "@/lib/materialCost";
import { suggestPrimaryPrice } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";

const SHARED_FIXED_ROLES = ["CONSUMABLES_MEDIUM"] as const;

export async function PATCH(req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    let body: { cableRouteFeet?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    const cableRouteFeet = body.cableRouteFeet;
    if (typeof cableRouteFeet !== "number" || !Number.isFinite(cableRouteFeet) || cableRouteFeet < 1 || cableRouteFeet > 100) {
      return NextResponse.json({ error: "Confirmed landscape cable route must be between 1 and 100 feet for this package." }, { status: 400 });
    }

    const quote = await db.quote.findUnique({ where: { id: params.quoteId }, include: { service: true } });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (!["SUBMITTED", "IN_REVIEW"].includes(quote.status)) return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    const config = reviewedLandscapeLightingPackage(quote.service.slug, quote.answersSnapshot as Record<string, string>);
    if (!config) return NextResponse.json({ error: "This request falls outside the reviewed landscape-lighting package." }, { status: 409 });

    const materialRoles = [config.cableRole, config.connectorRole, ...SHARED_FIXED_ROLES] as const;
    const [materials, serviceMaterials, decisions, settings] = await Promise.all([
      db.contractorMaterial.findMany({ where: { contractorId: ctx.contractorId, active: true, canonicalMaterial: { key: { in: [...materialRoles] } } }, select: { unitCostCents: true, canonicalMaterial: { select: { key: true } } } }),
      db.serviceMaterial.findMany({ where: { serviceId: quote.serviceId, canonicalMaterial: { key: { in: [...SHARED_FIXED_ROLES] } } }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } }),
      db.contractorLaborOperationDecision.findMany({ where: { contractorId: ctx.contractorId, trade: "electrical" }, select: { operationKey: true, hoursPerUnit: true, source: true } }),
      loadPricingSettings(db as never, ctx.contractorId),
    ]);
    const costs = new Map(materials.map((row) => [row.canonicalMaterial.key, row.unitCostCents]));
    if (materialRoles.some((role) => !costs.has(role))) return NextResponse.json({ error: "Enter costs for the selected landscape cable, waterproof fixture connections, and consumables before calculating this package." }, { status: 409 });
    const quantities = new Map(serviceMaterials.flatMap((line) => line.quantity !== null && line.canonicalMaterial
      ? [[line.canonicalMaterial.key, line.quantity] as const]
      : []));
    if (SHARED_FIXED_ROLES.some((role) => quantities.get(role) !== 1)) return NextResponse.json({ error: "The landscape-lighting consumables recipe is incomplete." }, { status: 409 });

    const materialCostCents = assembleMaterialCostCents([
      { unitCostCents: costs.get(config.cableRole)!, quantity: cableRouteFeet },
      { unitCostCents: costs.get(config.connectorRole)!, quantity: config.fixtureCount },
      ...SHARED_FIXED_ROLES.map((role) => ({ unitCostCents: costs.get(role)!, quantity: quantities.get(role)! })),
    ]);
    const labor = projectElectricalServiceLabor(quote.service.slug, decisions, {
      landscapeCableFeet: cableRouteFeet,
      landscapeFixtureCount: config.fixtureCount,
      landscapeConfigurationConfirmed: true,
    });
    if (labor.kind !== "READY_FOR_APPROVAL") return NextResponse.json({ error: "Approve every atomic labor operation used by this package before calculating its price.", code: labor.kind }, { status: 409 });
    const suggestion = suggestPrimaryPrice({ ...quote.service, materialCostCents }, settings, { fieldLaborHours: labor.suggestedHours });
    if (suggestion.totalCents === null) return NextResponse.json({ error: suggestion.unavailableReason ?? "This package is not ready to price." }, { status: 409 });

    const basisFingerprint = createHash("sha256").update(JSON.stringify({
      serviceId: quote.serviceId, config, cableRouteFeet,
      landscapeConfigurationConfirmed: true,
      materials: [...costs.entries()].sort(), sharedFixedQuantities: [...quantities.entries()].sort(),
      materialCostCents, labor: labor.projection.lines,
      materialMultiplier: quote.service.materialMultiplier, permitAdminCents: quote.service.permitAdminCents,
      otherDirectCostCents: quote.service.otherDirectCostCents, settings,
    })).digest("hex");
    const touched = await db.quote.updateMany({ where: { id: quote.id, status: { in: ["SUBMITTED", "IN_REVIEW"] } }, data: {
      reviewFactsSnapshot: {
        landscapeFixtureCount: { value: config.fixtureCount, source: "CUSTOMER_TREE" },
        landscapeCableFeet: { value: cableRouteFeet, source: "CONTRACTOR_MEASUREMENT" },
        landscapeConfigurationConfirmed: { value: true, source: "GUIDED_PHOTO_REVIEW" },
      },
      reviewSuggestedPriceCents: suggestion.totalCents, reviewBasisFingerprint: basisFingerprint,
      reviewedAt: new Date(), status: "IN_REVIEW",
    } });
    if (touched.count !== 1) return NextResponse.json({ error: "Quote changed while it was being reviewed. Reload and try again." }, { status: 409 });
    return NextResponse.json({
      ok: true, suggestedPriceCents: suggestion.totalCents, laborHours: labor.suggestedHours,
      materialCostCents, cableRouteFeet, fixtureCount: config.fixtureCount,
      basisFingerprint, sent: false,
    });
  });
}
