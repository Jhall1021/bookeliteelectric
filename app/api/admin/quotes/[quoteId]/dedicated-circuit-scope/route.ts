import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { concealedNmSupportCount, CONCEALED_ROUTE_POLICY_KEYS } from "@/lib/electrical/concealedRouteMaterialConfiguration";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { assembleMaterialCostCents } from "@/lib/materialCost";
import { suggestPrimaryPrice } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";

const SLUG = "dedicated-120v-circuit-outlet";
const ACCESSIBLE_PATHS = new Set(["unfinished_basement", "drop_ceiling", "accessible_attic", "combination"]);
const DISTANCE_BANDS = new Set(["under_25", "25_to_50"]);
const FIFTEEN_AMP_EQUIPMENT = new Set(["fridge_freezer", "bidet"]);
const MATERIAL_ROLES = [
  "BREAKER_SINGLE_POLE", "RECEPTACLE_STANDARD", "BOX_OLD_WORK", "WALL_PLATE",
  "WIRE_14_2", "NM_CABLE_SUPPORT", "CONSUMABLES_MEDIUM",
] as const;

function isFifteenAmpPath(answers: Record<string, string>): boolean {
  return FIFTEEN_AMP_EQUIPMENT.has(answers.dedicated_equipment)
    || (answers.dedicated_equipment === "knows_size" && answers.dedicated_amperage === "15a_120v");
}

export async function PATCH(req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    let body: { accessibleRouteFeet?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    const routeFeet = body.accessibleRouteFeet;
    if (typeof routeFeet !== "number" || !Number.isFinite(routeFeet) || routeFeet < 1 || routeFeet > 50) {
      return NextResponse.json({ error: "Confirmed accessible route must be between 1 and 50 feet for this package." }, { status: 400 });
    }

    const quote = await db.quote.findUnique({ where: { id: params.quoteId }, include: { service: true } });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (quote.status !== "SUBMITTED" && quote.status !== "IN_REVIEW") return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    if (quote.service.slug !== SLUG) return NextResponse.json({ error: "This is not the reviewed 15A dedicated-circuit package." }, { status: 409 });

    const answers = quote.answersSnapshot as Record<string, string>;
    if (!isFifteenAmpPath(answers)
      || !ACCESSIBLE_PATHS.has(answers.dedicated_route_access)
      || !DISTANCE_BANDS.has(answers.dedicated_distance)
      || !["accepted", "review_first"].includes(answers.dedicated_finish_ack)) {
      return NextResponse.json({ error: "This request falls outside the reviewed 15A accessible dedicated-circuit package." }, { status: 409 });
    }

    const [policies, materialRows, serviceMaterials, storedDecisions, settings] = await Promise.all([
      db.contractorPolicyValue.findMany({
        where: { contractorId: ctx.contractorId, key: { in: [
          CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination,
          CONCEALED_ROUTE_POLICY_KEYS.supportSpacing,
          CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination,
        ] } },
        select: { key: true, choice: true, measurement: true, resolvedAt: true },
      }),
      db.contractorMaterial.findMany({
        where: { contractorId: ctx.contractorId, canonicalMaterial: { key: { in: [...MATERIAL_ROLES] } } },
        select: { unitCostCents: true, canonicalMaterial: { select: { key: true } } },
      }),
      db.serviceMaterial.findMany({
        where: { serviceId: quote.serviceId, canonicalMaterial: { key: { in: [...MATERIAL_ROLES] } } },
        select: { quantity: true, canonicalMaterial: { select: { key: true } } },
      }),
      db.contractorLaborOperationDecision.findMany({
        where: { contractorId: ctx.contractorId, trade: "electrical" },
        select: { operationKey: true, hoursPerUnit: true, source: true },
      }),
      loadPricingSettings(db as never, ctx.contractorId),
    ]);

    const policyByKey = new Map(policies.filter((row) => row.resolvedAt !== null).map((row) => [row.key, row]));
    const slackPerTermination = policyByKey.get(CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination)?.measurement ?? null;
    const supportSpacing = policyByKey.get(CONCEALED_ROUTE_POLICY_KEYS.supportSpacing)?.measurement ?? null;
    const supportChoice = policyByKey.get(CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination)?.choice ?? null;
    const supportAtEachTermination = supportChoice === "YES" ? true : supportChoice === "NO" ? false : null;
    if (slackPerTermination === null || slackPerTermination < 0 || supportSpacing === null || supportSpacing <= 0 || supportAtEachTermination === null) {
      return NextResponse.json({ error: "Complete the accessible-cable slack and support policies before calculating this package." }, { status: 409 });
    }

    const supportCount = concealedNmSupportCount(routeFeet, supportSpacing, supportAtEachTermination);
    const cableFeet = routeFeet + (2 * slackPerTermination);
    const costs = new Map(materialRows.map((row) => [row.canonicalMaterial.key, row.unitCostCents]));
    if (MATERIAL_ROLES.some((role) => !costs.has(role))) {
      return NextResponse.json({ error: "Enter costs for every material used by this package before calculating its price." }, { status: 409 });
    }
    const serviceQuantity = new Map(serviceMaterials.flatMap((line) => line.canonicalMaterial && line.quantity !== null
      ? [[line.canonicalMaterial.key, line.quantity] as const]
      : []));
    for (const role of ["BREAKER_SINGLE_POLE", "RECEPTACLE_STANDARD", "BOX_OLD_WORK", "WALL_PLATE", "CONSUMABLES_MEDIUM"] as const) {
      if ((serviceQuantity.get(role) ?? 0) <= 0) return NextResponse.json({ error: `Approve the ${role} material quantity before calculating this package.` }, { status: 409 });
    }
    const materialCostCents = assembleMaterialCostCents([
      ...(["BREAKER_SINGLE_POLE", "RECEPTACLE_STANDARD", "BOX_OLD_WORK", "WALL_PLATE", "CONSUMABLES_MEDIUM"] as const).map((role) => ({ unitCostCents: costs.get(role)!, quantity: serviceQuantity.get(role)! })),
      { unitCostCents: costs.get("WIRE_14_2")!, quantity: cableFeet },
      { unitCostCents: costs.get("NM_CABLE_SUPPORT")!, quantity: supportCount },
    ]);

    const labor = projectElectricalServiceLabor(SLUG, storedDecisions, {
      accessibleRoute: true,
      finishedRoute: false,
      accessibleRouteFeet: routeFeet,
      nmCableSupportCount: supportCount,
      panelCapacityConfirmed: true,
    });
    if (labor.kind !== "READY_FOR_APPROVAL") {
      return NextResponse.json({ error: "Approve every atomic labor operation used by this package before calculating its price.", code: labor.kind }, { status: 409 });
    }
    const suggestion = suggestPrimaryPrice({ ...quote.service, materialCostCents }, settings, { fieldLaborHours: labor.suggestedHours });
    if (suggestion.totalCents === null) return NextResponse.json({ error: suggestion.unavailableReason ?? "This package is not ready to price." }, { status: 409 });

    const basisFingerprint = createHash("sha256").update(JSON.stringify({
      serviceId: quote.serviceId,
      routeFeet,
      cableFeet,
      supportCount,
      panelCapacityConfirmed: true,
      policy: { slackPerTermination, supportSpacing, supportAtEachTermination },
      materials: [...costs.entries()].sort(),
      fixedMaterialQuantities: [...serviceQuantity.entries()].sort(),
      materialCostCents,
      labor: labor.projection.lines,
      materialMultiplier: quote.service.materialMultiplier,
      permitAdminCents: quote.service.permitAdminCents,
      otherDirectCostCents: quote.service.otherDirectCostCents,
      settings,
    })).digest("hex");

    const touched = await db.quote.updateMany({
      where: { id: quote.id, status: { in: ["SUBMITTED", "IN_REVIEW"] } },
      data: {
        reviewFactsSnapshot: {
          accessibleRoute: { value: true, source: "GUIDED_PHOTO_REVIEW" },
          accessibleRouteFeet: { value: routeFeet, source: "CONTRACTOR_MEASUREMENT" },
          nmCableSupportCount: { value: supportCount, source: "SYSTEM_DERIVED" },
          panelCapacityConfirmed: { value: true, source: "GUIDED_PHOTO_REVIEW" },
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
      materialCostCents,
      routeFeet,
      cableFeet,
      supportCount,
      basisFingerprint,
      sent: false,
    });
  });
}
