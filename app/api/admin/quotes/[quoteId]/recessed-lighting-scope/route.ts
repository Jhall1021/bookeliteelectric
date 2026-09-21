import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { concealedNmSupportCount, CONCEALED_ROUTE_POLICY_KEYS } from "@/lib/electrical/concealedRouteMaterialConfiguration";
import { evaluateRecessedLightingTakeoff } from "@/lib/electrical/recessedLightingTakeoff";
import { resolveReviewedAccessibleRecessedLightingPackage } from "@/lib/electrical/recessedLightingReviewPackage";
import { assembleMaterialCostCents } from "@/lib/materialCost";
import { suggestPrimaryPrice } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";

const SLUG = "recessed-lighting";
const MATERIAL_ROLES = ["RECESSED_WAFER", "WIRE_14_2", "NM_CABLE_SUPPORT", "CONSUMABLES_SMALL"] as const;

export async function PATCH(req: Request, { params }: { params: { quoteId: string } }) {
  return withAdminRoute(async (db, ctx) => {
    let body: { installedCablePathFeet?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    const installedCablePathFeet = body.installedCablePathFeet;
    if (typeof installedCablePathFeet !== "number" || !Number.isFinite(installedCablePathFeet) || installedCablePathFeet < 1 || installedCablePathFeet > 300) {
      return NextResponse.json({ error: "Confirmed accessible cable path must be between 1 and 300 feet." }, { status: 400 });
    }

    const quote = await db.quote.findUnique({ where: { id: params.quoteId }, include: { service: true } });
    if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (quote.status !== "SUBMITTED" && quote.status !== "IN_REVIEW") return NextResponse.json({ error: "This quote is no longer awaiting review." }, { status: 409 });
    if (quote.service.slug !== SLUG) return NextResponse.json({ error: "This is not the reviewed recessed-lighting package." }, { status: 409 });
    const answers = quote.answersSnapshot as Record<string, string>;
    const reviewPackage = resolveReviewedAccessibleRecessedLightingPackage(answers);
    if (!reviewPackage) return NextResponse.json({ error: "This request falls outside the reviewed accessible recessed-lighting package." }, { status: 409 });

    const [policies, materialRows, storedDecisions, settings] = await Promise.all([
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
        select: { unitCostCents: true, canonicalMaterial: { select: { key: true, unit: true } } },
      }),
      db.contractorLaborOperationDecision.findMany({
        where: { contractorId: ctx.contractorId, trade: "electrical" },
        select: { operationKey: true, hoursPerUnit: true },
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

    const costs = new Map(materialRows.map((row) => [row.canonicalMaterial.key, row.unitCostCents]));
    if (MATERIAL_ROLES.some((role) => !costs.has(role))) {
      return NextResponse.json({ error: "Enter costs for every material used by this package before calculating its price." }, { status: 409 });
    }
    const supportCount = concealedNmSupportCount(installedCablePathFeet, supportSpacing, supportAtEachTermination);
    const totalCableSlackFeet = 2 * reviewPackage.lightCount * slackPerTermination;
    const contractorHours = Object.fromEntries(storedDecisions.map((row) => [row.operationKey, row.hoursPerUnit]));
    const takeoff = evaluateRecessedLightingTakeoff({
      facts: {
        access: { value: reviewPackage.access, source: "CUSTOMER_TREE" },
        lightCount: { value: reviewPackage.lightCount, source: "CUSTOMER_TREE" },
        existingLightingSourceConfirmed: { value: true, source: "GUIDED_PHOTO_REVIEW" },
        installedCablePathFeet: { value: installedCablePathFeet, source: "CONTRACTOR_MEASUREMENT" },
        nmCableSupportCount: { value: supportCount, source: "SYSTEM_DERIVED" },
        perpendicularCeilingFeet: { value: null, source: "CONTRACTOR_MEASUREMENT" },
        framingSpacingInches: { value: null, source: "CONTRACTOR_POLICY" },
        totalCableSlackFeet: { value: totalCableSlackFeet, source: "CONTRACTOR_POLICY" },
      },
      contractorHours,
      selections: materialRows.map((row) => ({
        role: row.canonicalMaterial.key,
        packageQuantity: 1,
        packageUnit: row.canonicalMaterial.unit,
        packagePriceCents: row.unitCostCents,
      })),
    });
    if (takeoff.kind !== "EVALUATED" || takeoff.labor.kind !== "READY" || !takeoff.materials.purchaseComplete) {
      return NextResponse.json({ error: "Approve every atomic labor operation and material used by this package before calculating its price." }, { status: 409 });
    }
    const materialCostCents = assembleMaterialCostCents(takeoff.materials.physicalRequirements.map((line) => ({
      unitCostCents: costs.get(line.role)!,
      quantity: line.quantity,
    })));
    const suggestion = suggestPrimaryPrice({ ...quote.service, materialCostCents }, settings, { fieldLaborHours: takeoff.labor.hours });
    if (suggestion.totalCents === null) return NextResponse.json({ error: suggestion.unavailableReason ?? "This package is not ready to price." }, { status: 409 });

    const basisFingerprint = createHash("sha256").update(JSON.stringify({
      serviceId: quote.serviceId,
      lightCount: reviewPackage.lightCount,
      installedCablePathFeet,
      supportCount,
      totalCableSlackFeet,
      existingLightingSourceConfirmed: true,
      policy: { slackPerTermination, supportSpacing, supportAtEachTermination },
      materials: [...costs.entries()].sort(),
      materialRequirements: takeoff.materials.physicalRequirements,
      materialCostCents,
      labor: takeoff.labor.quantities,
      materialMultiplier: quote.service.materialMultiplier,
      permitAdminCents: quote.service.permitAdminCents,
      otherDirectCostCents: quote.service.otherDirectCostCents,
      settings,
    })).digest("hex");

    const touched = await db.quote.updateMany({
      where: { id: quote.id, status: { in: ["SUBMITTED", "IN_REVIEW"] } },
      data: {
        reviewFactsSnapshot: {
          accessibleRoute: { value: true, source: "CUSTOMER_TREE" },
          lightCount: { value: reviewPackage.lightCount, source: "CUSTOMER_TREE" },
          existingLightingSourceConfirmed: { value: true, source: "GUIDED_PHOTO_REVIEW" },
          interLightCableFeet: { value: installedCablePathFeet, source: "CONTRACTOR_MEASUREMENT" },
          nmCableSupportCount: { value: supportCount, source: "SYSTEM_DERIVED" },
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
      laborHours: takeoff.labor.hours,
      materialCostCents,
      lightCount: reviewPackage.lightCount,
      installedCablePathFeet,
      cableFeet: installedCablePathFeet + totalCableSlackFeet,
      supportCount,
      basisFingerprint,
      sent: false,
    });
  });
}
