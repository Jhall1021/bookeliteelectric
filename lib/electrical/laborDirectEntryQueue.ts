import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";

export type ElectricalLaborDirectEntry = {
  operationKey: string;
  operationName: string;
  unit: "each" | "ft";
  includes: string;
  excludes: string;
  affectedServiceSlugs: string[];
  publishedStartingMinutes: number | null;
};

/**
 * Missing atomic units used by the contractor's offered services, ordered by
 * the number of offered services the decision can help unlock. This is a
 * direct-entry queue only; it neither proposes nor approves a value.
 */
export function buildElectricalLaborDirectEntryQueue(
  offeredServiceSlugs: Iterable<string>,
  establishedOrProposedOperationKeys: Iterable<string> = [],
): ElectricalLaborDirectEntry[] {
  const offered = new Set(offeredServiceSlugs);
  const excluded = new Set(establishedOrProposedOperationKeys);
  const servicesByOperation = new Map<string, Set<string>>();

  for (const recipe of ELECTRICAL_ATOMIC_LABOR_RECIPES) {
    const matchingServices = recipe.appliesTo.filter((slug) => offered.has(slug));
    if (matchingServices.length === 0) continue;
    for (const line of recipe.lines) {
      if (excluded.has(line.operationKey)) continue;
      const services = servicesByOperation.get(line.operationKey) ?? new Set<string>();
      for (const slug of matchingServices) services.add(slug);
      servicesByOperation.set(line.operationKey, services);
    }
  }

  return ELECTRICAL_ATOMIC_LABOR_OPERATIONS.flatMap((operation): ElectricalLaborDirectEntry[] => {
    const affected = servicesByOperation.get(operation.key);
    if (!affected?.size) return [];
    return [{
      operationKey: operation.key,
      operationName: operation.name,
      unit: operation.unit,
      includes: operation.includes,
      excludes: operation.excludes,
      affectedServiceSlugs: [...affected].sort(),
      publishedStartingMinutes: operation.referenceLaborHours !== null && operation.referenceStatus !== "DISPUTED"
        ? operation.referenceLaborHours * 60
        : null,
    }];
  }).sort((a, b) =>
    b.affectedServiceSlugs.length - a.affectedServiceSlugs.length
    || Number(b.publishedStartingMinutes !== null) - Number(a.publishedStartingMinutes !== null)
    || a.operationName.localeCompare(b.operationName),
  );
}
