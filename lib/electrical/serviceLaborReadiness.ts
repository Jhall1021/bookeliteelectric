import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { ELECTRICAL_LABOR_FAMILIES } from "./laborCoverageFamilies";
import { buildElectricalStandardScenarios } from "./standardLaborScenarios";

export type ServiceLaborReadinessState =
  | "NON_PRICEABLE_REVIEW"
  | "INTERNAL_FIXTURE"
  | "NEEDS_SCOPE_AND_CALIBRATION"
  | "NEEDS_CALIBRATION"
  | "READY_FOR_RUNTIME_CONNECTION";

export type ServiceLaborReadiness = {
  serviceSlug: string;
  familyKey: string;
  state: ServiceLaborReadinessState;
  recipeKeys: string[];
  operationKeys: string[];
  missingScopeFacts: string[];
  operationsNeedingCalibration: string[];
  runtimeConnection: "CONNECTED" | "NOT_CONNECTED" | "NOT_APPLICABLE";
  runtimeConnectionReason: string;
};

/** Template services currently declared DERIVED_RESOLVED_SCOPE. */
export const RUNTIME_CONNECTED_ATOMIC_SERVICE_SLUGS = new Set(["new-120v-outlet"]);

/** Build one honest completion row for every catalog service. */
export function buildElectricalServiceLaborReadiness(): ServiceLaborReadiness[] {
  const operationByKey = new Map(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, operation]));
  const scenarios = buildElectricalStandardScenarios();
  const scenariosByService = new Map<string, typeof scenarios>();
  for (const scenario of scenarios) scenariosByService.set(scenario.serviceSlug, [...(scenariosByService.get(scenario.serviceSlug) ?? []), scenario]);

  const result: ServiceLaborReadiness[] = [];
  for (const family of ELECTRICAL_LABOR_FAMILIES) {
    for (const serviceSlug of family.serviceSlugs) {
      const recipes = ELECTRICAL_ATOMIC_LABOR_RECIPES.filter((recipe) => recipe.appliesTo.includes(serviceSlug));
      const operationKeys = [...new Set(recipes.flatMap((recipe) => recipe.lines.map((line) => line.operationKey)))].sort();
      const missingScopeFacts = [...new Set((scenariosByService.get(serviceSlug) ?? []).flatMap((scenario) => scenario.kind === "NO_STANDARD" ? scenario.missingFacts : []))].sort();
      const operationsNeedingCalibration = operationKeys.filter((key) => {
        const operation = operationByKey.get(key);
        return !operation || operation.referenceStatus !== "VERIFIED" || operation.referenceLaborHours === null;
      });
      const notApplicable = family.status === "NON_PRICEABLE_REVIEW" || family.status === "INTERNAL_FIXTURE";
      const runtimeConnection = notApplicable
        ? "NOT_APPLICABLE" as const
        : RUNTIME_CONNECTED_ATOMIC_SERVICE_SLUGS.has(serviceSlug)
          ? "CONNECTED" as const
          : "NOT_CONNECTED" as const;
      const runtimeConnectionReason = runtimeConnection === "CONNECTED"
        ? "Template service is DERIVED_RESOLVED_SCOPE; resolved Routing V2 components invoke the atomic labor bridges."
        : runtimeConnection === "NOT_APPLICABLE"
          ? "Review-only work or an internal fixture is outside the customer-price runtime rollout."
          : "Canonical atomic recipe exists, but this service is not yet declared DERIVED_RESOLVED_SCOPE.";

      let state: ServiceLaborReadinessState;
      if (family.status === "NON_PRICEABLE_REVIEW") state = "NON_PRICEABLE_REVIEW";
      else if (family.status === "INTERNAL_FIXTURE") state = "INTERNAL_FIXTURE";
      else if (missingScopeFacts.length > 0 && operationsNeedingCalibration.length > 0) state = "NEEDS_SCOPE_AND_CALIBRATION";
      else if (operationsNeedingCalibration.length > 0) state = "NEEDS_CALIBRATION";
      else state = "READY_FOR_RUNTIME_CONNECTION";

      result.push({
        serviceSlug, familyKey: family.key, state,
        recipeKeys: recipes.map((recipe) => recipe.key).sort(), operationKeys,
        missingScopeFacts, operationsNeedingCalibration,
        runtimeConnection, runtimeConnectionReason,
      });
    }
  }
  return result.sort((a, b) => a.serviceSlug.localeCompare(b.serviceSlug));
}
