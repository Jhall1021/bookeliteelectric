import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { concealedNmSupportCount, CONCEALED_ROUTE_POLICY_KEYS } from "@/lib/electrical/concealedRouteMaterialConfiguration";
import { reviewedGarage240vConfiguration } from "@/lib/electrical/garage240vReviewPackage";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { assembleMaterialCostCents } from "@/lib/materialCost";
import { suggestPrimaryPrice } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";

export async function PATCH(req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    let body: { accessibleRouteFeet?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    const routeFeet = body.accessibleRouteFeet;
    if (typeof routeFeet !== "number" || !Number.isFinite(routeFeet) || routeFeet < 1 || routeFeet > 300) {
      return NextResponse.json({ error: "Confirmed open-route length must be between 1 and 300 feet." }, { status: 400 });
    }

    const quote = await db.quote.findUnique({ where: { id: params.quoteId }, include: { service: true } });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (!['SUBMITTED', 'IN_REVIEW'].includes(quote.status)) return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    const config = reviewedGarage240vConfiguration(quote.service.slug, quote.answersSnapshot as Record<string, string>);
    if (!config) return NextResponse.json({ error: "This request falls outside the reviewed open-garage 240V package." }, { status: 409 });

    const fixedRoles = [config.receptacleRole, config.breakerRole, "BOX_SURFACE_4S", "COVER_RAISED_4S", "CONSUMABLES_MEDIUM"] as const;
    const materialRoles = [...fixedRoles, config.wireRole, "NM_CABLE_SUPPORT"] as const;
    const [policies, materials, serviceMaterials, decisions, settings] = await Promise.all([
      db.contractorPolicyValue.findMany({ where: { contractorId: ctx.contractorId, key: { in: [CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination, CONCEALED_ROUTE_POLICY_KEYS.supportSpacing, CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination] } }, select: { key: true, choice: true, measurement: true, resolvedAt: true } }),
      db.contractorMaterial.findMany({ where: { contractorId: ctx.contractorId, canonicalMaterial: { key: { in: [...materialRoles] } } }, select: { unitCostCents: true, canonicalMaterial: { select: { key: true } } } }),
      db.serviceMaterial.findMany({ where: { serviceId: quote.serviceId, canonicalMaterial: { key: { in: [...fixedRoles] } } }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } }),
      db.contractorLaborOperationDecision.findMany({ where: { contractorId: ctx.contractorId, trade: "electrical" }, select: { operationKey: true, hoursPerUnit: true, source: true } }),
      loadPricingSettings(db as never, ctx.contractorId),
    ]);
    const policy = new Map(policies.filter((row) => row.resolvedAt !== null).map((row) => [row.key, row]));
    const slack = policy.get(CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination)?.measurement ?? null;
    const spacing = policy.get(CONCEALED_ROUTE_POLICY_KEYS.supportSpacing)?.measurement ?? null;
    const supportChoice = policy.get(CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination)?.choice ?? null;
    const terminalSupports = supportChoice === "YES" ? true : supportChoice === "NO" ? false : null;
    if (slack === null || slack < 0 || spacing === null || spacing <= 0 || terminalSupports === null) return NextResponse.json({ error: "Complete cable slack and support policies before calculating this package." }, { status: 409 });

    const supportCount = concealedNmSupportCount(routeFeet, spacing, terminalSupports);
    const cableFeet = routeFeet + (2 * slack);
    const costs = new Map(materials.map((row) => [row.canonicalMaterial.key, row.unitCostCents]));
    if (materialRoles.some((role) => !costs.has(role))) return NextResponse.json({ error: "Enter costs for every selected 240V package material before calculating its price." }, { status: 409 });
    const quantities = new Map(serviceMaterials.flatMap((line) => line.canonicalMaterial && line.quantity !== null ? [[line.canonicalMaterial.key, line.quantity] as const] : []));
    if (fixedRoles.some((role) => (quantities.get(role) ?? 0) <= 0)) return NextResponse.json({ error: "Approve every fixed 240V package material quantity before calculating its price." }, { status: 409 });
    const materialCostCents = assembleMaterialCostCents([
      ...fixedRoles.map((role) => ({ unitCostCents: costs.get(role)!, quantity: quantities.get(role)! })),
      { unitCostCents: costs.get(config.wireRole)!, quantity: cableFeet },
      { unitCostCents: costs.get("NM_CABLE_SUPPORT")!, quantity: supportCount },
    ]);
    const labor = projectElectricalServiceLabor(quote.service.slug, decisions, { accessibleRoute: true, finishedRoute: false, accessibleRouteFeet: routeFeet, nmCableSupportCount: supportCount, panelCapacityConfirmed: true });
    if (labor.kind !== "READY_FOR_APPROVAL") return NextResponse.json({ error: "Approve every atomic labor operation used by this package before calculating its price.", code: labor.kind }, { status: 409 });
    const suggestion = suggestPrimaryPrice({ ...quote.service, materialCostCents }, settings, { fieldLaborHours: labor.suggestedHours });
    if (suggestion.totalCents === null) return NextResponse.json({ error: suggestion.unavailableReason ?? "This package is not ready to price." }, { status: 409 });
    const basisFingerprint = createHash("sha256").update(JSON.stringify({
      serviceId: quote.serviceId, config, routeFeet, cableFeet, supportCount, panelCapacityConfirmed: true,
      policy: { slack, spacing, terminalSupports }, materials: [...costs.entries()].sort(),
      fixedQuantities: [...quantities.entries()].sort(), materialCostCents, labor: labor.projection.lines,
      materialMultiplier: quote.service.materialMultiplier, permitAdminCents: quote.service.permitAdminCents,
      otherDirectCostCents: quote.service.otherDirectCostCents, settings,
    })).digest("hex");
    const touched = await db.quote.updateMany({ where: { id: quote.id, status: { in: ["SUBMITTED", "IN_REVIEW"] } }, data: { reviewFactsSnapshot: { accessibleRoute: { value: true, source: "GUIDED_PHOTO_REVIEW" }, accessibleRouteFeet: { value: routeFeet, source: "CONTRACTOR_MEASUREMENT" }, nmCableSupportCount: { value: supportCount, source: "SYSTEM_DERIVED" }, panelCapacityConfirmed: { value: true, source: "GUIDED_PHOTO_REVIEW" } }, reviewSuggestedPriceCents: suggestion.totalCents, reviewBasisFingerprint: basisFingerprint, reviewedAt: new Date(), status: "IN_REVIEW" } });
    if (touched.count !== 1) return NextResponse.json({ error: "Quote changed while it was being reviewed. Reload and try again." }, { status: 409 });
    return NextResponse.json({ ok: true, suggestedPriceCents: suggestion.totalCents, laborHours: labor.suggestedHours, materialCostCents, routeFeet, cableFeet, supportCount, configuration: `${config.amperage}A/${config.prongs}-prong`, basisFingerprint, sent: false });
  });
}
