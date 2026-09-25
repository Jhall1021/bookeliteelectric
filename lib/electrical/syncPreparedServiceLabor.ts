import type { Prisma, PrismaClient } from "@prisma/client";
import { mapWithConcurrency } from "../concurrency";
import { saveServicePricingInputs } from "../servicePricingInputs";
import { connectedDeviceFactsForService, loadConnectedDeviceLaborFacts } from "./connectedDeviceLaborFacts";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "./atomicLabor";
import { projectElectricalServiceLabor } from "./laborServiceApproval";
import { electricalPlatformLaborBaselineByOperation } from "./platformLaborBaseline";
import { loadStandardScopeLaborFacts } from "./standardScopeLaborFacts";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Keep selected services derived from the contractor's atomic labor ledger.
 * Saved contractor decisions win; untouched operations use Price2Book's
 * prepared baseline. This writes pricing inputs only—never a customer price,
 * approval, publication, or activation.
 */
export async function syncPreparedServiceLabor(
  db: Db,
  contractorId: string,
  serviceIds?: string[],
): Promise<{ updated: number; routeSpecific: number; blocked: number }> {
  const [services, saved, connectedFacts, standardFacts] = await Promise.all([
    db.service.findMany({
      where: {
        contractorId,
        offered: true,
        ...(serviceIds ? { id: { in: serviceIds } } : {}),
      },
      select: {
        id: true, slug: true, bookingType: true, isPrimaryEligible: true,
        fieldLaborHours: true, wwtLaborHours: true,
      },
      orderBy: { id: "asc" },
    }),
    db.contractorLaborOperationDecision.findMany({
      where: { contractorId, trade: "electrical" },
      select: { operationKey: true, hoursPerUnit: true, source: true },
    }),
    loadConnectedDeviceLaborFacts(db, contractorId),
    loadStandardScopeLaborFacts(db, contractorId),
  ]);
  const savedByKey = new Map(saved.map((decision) => [decision.operationKey, decision]));
  const decisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.flatMap((operation) => {
    const stored = savedByKey.get(operation.key);
    const baseline = electricalPlatformLaborBaselineByOperation.get(operation.key);
    if (!stored && !baseline) return [];
    return [{
      operationKey: operation.key,
      hoursPerUnit: stored?.hoursPerUnit ?? baseline!.hoursPerUnit,
      source: stored?.source ?? "PLATFORM_BASELINE" as const,
    }];
  });

  let routeSpecific = 0;
  let blocked = 0;
  const updates: { serviceId: string; input: { fieldLaborHours?: number | null; wwtLaborHours?: number | null } }[] = [];
  const same = (left: number | null, right: number | null) =>
    left === right || left !== null && right !== null && Math.abs(left - right) <= 1e-9;
  for (const service of services) {
    const projection = projectElectricalServiceLabor(service.slug, decisions, {
      ...(standardFacts[service.slug] ?? {}),
      ...connectedDeviceFactsForService(service.slug, connectedFacts),
    });
    if (projection.kind === "NO_STANDARD_SCOPE" || projection.kind === "NOT_MODELED") {
      routeSpecific += 1;
      continue;
    }
    if (projection.kind === "BLOCKED") {
      blocked += 1;
      continue;
    }
    const primaryOnly = service.bookingType === "TROUBLESHOOT_ONLY";
    const input = primaryOnly
      ? { fieldLaborHours: projection.suggestedHours, wwtLaborHours: null }
      : service.isPrimaryEligible
        ? { fieldLaborHours: projection.suggestedHours, wwtLaborHours: projection.suggestedHours }
        : { fieldLaborHours: null, wwtLaborHours: projection.suggestedHours };
    if (!same(service.fieldLaborHours, input.fieldLaborHours)
        || !same(service.wwtLaborHours, input.wwtLaborHours)) {
      updates.push({ serviceId: service.id, input });
    }
  }
  await mapWithConcurrency(updates, 8, ({ serviceId, input }) => saveServicePricingInputs(db, serviceId, input));
  return { updated: updates.length, routeSpecific, blocked };
}
