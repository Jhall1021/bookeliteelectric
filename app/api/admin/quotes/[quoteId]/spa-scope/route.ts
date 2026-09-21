import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { reviewedSpaPackage } from "@/lib/electrical/spaReviewPackage";
import { assembleMaterialCostCents } from "@/lib/materialCost";
import { suggestPrimaryPrice } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";

const FIXED_ROLES = ["SPA_PANEL_GFCI_50A", "BREAKER_DOUBLE_POLE_50A", "CONDUIT_FITTINGS_1", "CONDUIT_LFNC_FITTINGS_1", "CONSUMABLES_MEDIUM"] as const;
const ROUTE_ROLES = ["CONDUIT_PVC_1", "CONDUIT_LFNC_1"] as const;
const BONDING_ROLES = ["SPA_BONDING_CONDUCTOR_8_BARE", "SPA_BONDING_LUG_CLAMP"] as const;

type Body = { racewayFeet?: unknown; equipmentWhipFeet?: unknown; conductorRunFeet?: unknown; bondingRequired?: unknown; bondingConductorFeet?: unknown; bondingConnectionCount?: unknown };

export async function PATCH(req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    let body: Body;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    const { racewayFeet, equipmentWhipFeet, conductorRunFeet, bondingRequired, bondingConductorFeet, bondingConnectionCount } = body;
    if (typeof racewayFeet !== "number" || !Number.isFinite(racewayFeet) || racewayFeet < 1 || racewayFeet > 25) return NextResponse.json({ error: "Confirmed exterior PVC route must be between 1 and 25 feet for this package." }, { status: 400 });
    if (typeof equipmentWhipFeet !== "number" || !Number.isFinite(equipmentWhipFeet) || equipmentWhipFeet < 1 || equipmentWhipFeet > 15) return NextResponse.json({ error: "Confirmed liquidtight equipment route must be between 1 and 15 feet for this package." }, { status: 400 });
    if (typeof conductorRunFeet !== "number" || !Number.isFinite(conductorRunFeet) || conductorRunFeet < racewayFeet + equipmentWhipFeet || conductorRunFeet > 50) return NextResponse.json({ error: "Installed length for each conductor must cover both raceways and cannot exceed 50 feet." }, { status: 400 });
    if (typeof bondingRequired !== "boolean") return NextResponse.json({ error: "Confirm whether this reviewed installation requires included external bonding work." }, { status: 400 });
    const bondFeet: number = bondingRequired ? bondingConductorFeet as number : 0;
    const bondConnections: number = bondingRequired ? bondingConnectionCount as number : 0;
    if (bondingRequired && (typeof bondFeet !== "number" || !Number.isFinite(bondFeet) || bondFeet < 1 || bondFeet > 50)) return NextResponse.json({ error: "Confirmed bonding-conductor length must be between 1 and 50 feet." }, { status: 400 });
    if (bondingRequired && (typeof bondConnections !== "number" || !Number.isSafeInteger(bondConnections) || bondConnections < 1 || bondConnections > 12)) return NextResponse.json({ error: "Confirmed bonding connection count must be a whole number between 1 and 12." }, { status: 400 });

    const quote = await db.quote.findUnique({ where: { id: params.quoteId }, include: { service: true } });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (!["SUBMITTED", "IN_REVIEW"].includes(quote.status)) return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    const config = reviewedSpaPackage(quote.service.slug, quote.answersSnapshot as Record<string, string>);
    if (!config) return NextResponse.json({ error: "This request falls outside the reviewed 50A four-wire spa package." }, { status: 409 });

    const conductorRoles = [config.ungroundedConductorRole, config.groundedConductorRole, config.equipmentGroundRole] as const;
    const requiredRoles = [...FIXED_ROLES, ...ROUTE_ROLES, ...conductorRoles, ...(bondingRequired ? BONDING_ROLES : [])];
    const [materials, serviceMaterials, decisions, settings] = await Promise.all([
      db.contractorMaterial.findMany({ where: { contractorId: ctx.contractorId, active: true, canonicalMaterial: { key: { in: requiredRoles } } }, select: { unitCostCents: true, canonicalMaterial: { select: { key: true } } } }),
      db.serviceMaterial.findMany({ where: { serviceId: quote.serviceId, canonicalMaterial: { key: { in: [...FIXED_ROLES] } } }, select: { quantity: true, canonicalMaterial: { select: { key: true } } } }),
      db.contractorLaborOperationDecision.findMany({ where: { contractorId: ctx.contractorId, trade: "electrical" }, select: { operationKey: true, hoursPerUnit: true, source: true } }),
      loadPricingSettings(db as never, ctx.contractorId),
    ]);
    const costs = new Map(materials.map((row) => [row.canonicalMaterial.key, row.unitCostCents]));
    if (requiredRoles.some((role) => !costs.has(role))) return NextResponse.json({ error: "Enter costs for every selected spa-circuit material before calculating this package." }, { status: 409 });
    const fixedQuantities = new Map(serviceMaterials.flatMap((line) => line.quantity !== null && line.canonicalMaterial ? [[line.canonicalMaterial.key, line.quantity] as const] : []));
    if (FIXED_ROLES.some((role) => fixedQuantities.get(role) !== 1)) return NextResponse.json({ error: "The fixed spa disconnect and raceway-fittings recipe is incomplete." }, { status: 409 });

    const conductorFeet = conductorRunFeet * config.conductorCount;
    const materialCostCents = assembleMaterialCostCents([
      ...FIXED_ROLES.map((role) => ({ unitCostCents: costs.get(role)!, quantity: fixedQuantities.get(role)! })),
      { unitCostCents: costs.get("CONDUIT_PVC_1")!, quantity: racewayFeet },
      { unitCostCents: costs.get("CONDUIT_LFNC_1")!, quantity: equipmentWhipFeet },
      { unitCostCents: costs.get(config.ungroundedConductorRole)!, quantity: conductorRunFeet * 2 },
      { unitCostCents: costs.get(config.groundedConductorRole)!, quantity: conductorRunFeet },
      { unitCostCents: costs.get(config.equipmentGroundRole)!, quantity: conductorRunFeet },
      ...(bondingRequired ? [
        { unitCostCents: costs.get("SPA_BONDING_CONDUCTOR_8_BARE")!, quantity: bondFeet },
        { unitCostCents: costs.get("SPA_BONDING_LUG_CLAMP")!, quantity: bondConnections },
      ] : []),
    ]);
    const labor = projectElectricalServiceLabor(quote.service.slug, decisions, { racewayFeet, equipmentWhipFeet, conductorFeet, spaConfigurationConfirmed: true, spaBondingRequired: bondingRequired, bondingConductorFeet: bondFeet, bondingConnectionCount: bondConnections });
    if (labor.kind !== "READY_FOR_APPROVAL") return NextResponse.json({ error: "Approve every atomic labor operation used by this package before calculating its price.", code: labor.kind }, { status: 409 });
    const suggestion = suggestPrimaryPrice({ ...quote.service, materialCostCents }, settings, { fieldLaborHours: labor.suggestedHours });
    if (suggestion.totalCents === null) return NextResponse.json({ error: suggestion.unavailableReason ?? "This package is not ready to price." }, { status: 409 });

    const basisFingerprint = createHash("sha256").update(JSON.stringify({ serviceId: quote.serviceId, config, racewayFeet, equipmentWhipFeet, conductorRunFeet, conductorFeet, bondingRequired, bondingConductorFeet: bondFeet, bondingConnectionCount: bondConnections, materials: [...costs.entries()].sort(), fixedQuantities: [...fixedQuantities.entries()].sort(), materialCostCents, labor: labor.projection.lines, materialMultiplier: quote.service.materialMultiplier, permitAdminCents: quote.service.permitAdminCents, otherDirectCostCents: quote.service.otherDirectCostCents, settings })).digest("hex");
    const touched = await db.quote.updateMany({ where: { id: quote.id, status: { in: ["SUBMITTED", "IN_REVIEW"] } }, data: {
      reviewFactsSnapshot: {
        racewayFeet: { value: racewayFeet, source: "CONTRACTOR_MEASUREMENT" }, equipmentWhipFeet: { value: equipmentWhipFeet, source: "CONTRACTOR_MEASUREMENT" },
        conductorRunFeet: { value: conductorRunFeet, source: "CONTRACTOR_MEASUREMENT" }, conductorFeet: { value: conductorFeet, source: "SYSTEM_DERIVED" },
        spaConfigurationConfirmed: { value: true, source: "GUIDED_PHOTO_REVIEW" }, spaBondingRequired: { value: bondingRequired, source: "GUIDED_PHOTO_REVIEW" },
        bondingConductorFeet: { value: bondFeet, source: "CONTRACTOR_MEASUREMENT" }, bondingConnectionCount: { value: bondConnections, source: "CONTRACTOR_MEASUREMENT" },
      },
      reviewSuggestedPriceCents: suggestion.totalCents, reviewBasisFingerprint: basisFingerprint, reviewedAt: new Date(), status: "IN_REVIEW",
    } });
    if (touched.count !== 1) return NextResponse.json({ error: "Quote changed while it was being reviewed. Reload and try again." }, { status: 409 });
    return NextResponse.json({ ok: true, suggestedPriceCents: suggestion.totalCents, laborHours: labor.suggestedHours, materialCostCents, racewayFeet, equipmentWhipFeet, conductorRunFeet, conductorFeet, bondingRequired, bondingConductorFeet: bondFeet, bondingConnectionCount: bondConnections, basisFingerprint, sent: false });
  });
}
