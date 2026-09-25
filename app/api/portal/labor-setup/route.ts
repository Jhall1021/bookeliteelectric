import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withAdminRoute } from "@/lib/adminContext";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "@/lib/electrical/atomicLabor";
import { connectedDeviceFactsForService, loadConnectedDeviceLaborFacts } from "@/lib/electrical/connectedDeviceLaborFacts";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { electricalPlatformLaborBaselineByOperation } from "@/lib/electrical/platformLaborBaseline";
import { saveLaborOperationDecisions, type OperationDecisionInput } from "@/lib/laborCalibrationPersistence";
import { saveServicePricingInputs } from "@/lib/servicePricingInputs";

export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    let body: { decisions?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    if (!Array.isArray(body.decisions) || body.decisions.length > 200) {
      return NextResponse.json({ error: "decisions must be an array of no more than 200 labor units." }, { status: 400 });
    }
    const inputDecisions = body.decisions as OperationDecisionInput[];
    try {
      const result = await db.$transaction(async (tx) => {
        const services = await tx.service.findMany({
          where: { contractorId: ctx.contractorId, offered: true },
          select: { id: true, slug: true, bookingType: true, isPrimaryEligible: true },
          orderBy: { id: "asc" },
        });
        const offered = new Set(services.map((service) => service.slug));
        const requiredKeys = [...new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES
          .filter((recipe) => recipe.appliesTo.some((slug) => offered.has(slug)))
          .flatMap((recipe) => recipe.lines.map((line) => line.operationKey)))];
        const preparedDecisions = requiredKeys.map((operationKey) => {
          const baseline = electricalPlatformLaborBaselineByOperation.get(operationKey);
          if (!baseline) throw new Error(`Missing prepared labor baseline for ${operationKey}.`);
          return {
            contractorId: ctx.contractorId, trade: "electrical", operationKey,
            hoursPerUnit: baseline.hoursPerUnit, source: "PLATFORM_BASELINE" as const,
            basis: {
              kind: "PLATFORM_BASELINE", baselineStatus: baseline.status,
              sourceKeys: baseline.sourceKeys, note: baseline.note,
              contractorObservation: false, baselineDate: "2026-09-25",
            },
          };
        });
        // Persist only missing prepared values in one statement. The former
        // one-at-a-time upsert loop could exceed Prisma's interactive
        // transaction timeout before the service-duration writes began.
        await tx.contractorLaborOperationDecision.createMany({
          data: preparedDecisions,
          skipDuplicates: true,
        });
        if (inputDecisions.length > 0) {
          await saveLaborOperationDecisions(tx, ctx.contractorId, "electrical", inputDecisions);
        }
        const [stored, connectedDeviceFacts] = await Promise.all([
          tx.contractorLaborOperationDecision.findMany({
            where: { contractorId: ctx.contractorId, trade: "electrical" },
            select: { operationKey: true, hoursPerUnit: true, source: true },
          }),
          loadConnectedDeviceLaborFacts(tx, ctx.contractorId),
        ]);
        const decisions = stored.map((decision) => ({ operationKey: decision.operationKey, hoursPerUnit: decision.hoursPerUnit, source: decision.source }));
        let updatedServices = 0;
        let routeSpecificServices = 0;
        let blockedServices = 0;
        const serviceUpdates = [];
        for (const service of services) {
          const projection = projectElectricalServiceLabor(service.slug, decisions, connectedDeviceFactsForService(service.slug, connectedDeviceFacts));
          if (projection.kind === "NO_STANDARD_SCOPE" || projection.kind === "NOT_MODELED") {
            routeSpecificServices += 1;
            continue;
          }
          if (projection.kind === "BLOCKED") {
            blockedServices += 1;
            continue;
          }
          const primaryOnly = service.bookingType === "TROUBLESHOOT_ONLY";
          serviceUpdates.push(saveServicePricingInputs(tx, service.id, primaryOnly
            ? { fieldLaborHours: projection.suggestedHours, wwtLaborHours: null }
            : service.isPrimaryEligible
              ? { fieldLaborHours: projection.suggestedHours, wwtLaborHours: projection.suggestedHours }
              : { wwtLaborHours: projection.suggestedHours }));
          updatedServices += 1;
        }
        await Promise.all(serviceUpdates);
        return { updatedOperations: inputDecisions.length, updatedServices, routeSpecificServices, blockedServices };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 20_000,
      });
      return NextResponse.json({ ok: true, published: false, ...result });
    } catch (error) {
      if ((error as { code?: string }).code === "P2034") return NextResponse.json({ error: "A concurrent labor change was detected. Please try again." }, { status: 409 });
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid labor setup." }, { status: 400 });
    }
  });
}
