import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES, ELECTRICAL_LABOR_CALIBRATION_GROUPS } from "./atomicLabor";
import { ELECTRICAL_LABOR_FAMILIES } from "./laborCoverageFamilies";
import { ELECTRICAL_CORE_CALIBRATION_SCENARIOS, ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS } from "./laborCalibrationWizard";
import { ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY } from "./laborScopeFactRegistry";
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
  scopeFactCollectionGroupKeys: string[];
  scopeFactsWithoutCollectionPath: string[];
  operationsNeedingCalibration: string[];
  directCalibrationScenarioKeys: string[];
  calibrationGroupKeys: string[];
  operationsWithoutWizardPath: string[];
  runtimeConnection: "CONNECTED" | "NOT_CONNECTED" | "NOT_APPLICABLE";
  runtimeConnectionReason: string;
};

/** Services whose nonstandard facts have an implemented atomic runtime binding. */
export const POLICY_CONNECTED_ATOMIC_SERVICE_SLUGS = new Set([
  "customer-supplied-smart-switch",
  "smart-outlet-upgrade",
  "smart-thermostat-install",
  "video-doorbell-existing-wiring",
  "new-video-doorbell-wiring",
  "floodlight-camera-existing",
  "new-exterior-flood-camera",
]);
export const SURFACE_ROUTE_CONNECTED_ATOMIC_SERVICE_SLUGS = new Set([
  "surface-mounted-outlet",
  "surface-mounted-switch",
  "surface-mounted-fixture-box",
]);
export const LOW_VOLTAGE_STANDARD_PACKAGE_CONNECTED_SLUGS = new Set([
  "new-ethernet-line",
  "new-coax-line",
]);
export const RUNTIME_CONNECTED_ATOMIC_SERVICE_SLUGS = new Set([
  "new-120v-outlet",
  ...POLICY_CONNECTED_ATOMIC_SERVICE_SLUGS,
  ...SURFACE_ROUTE_CONNECTED_ATOMIC_SERVICE_SLUGS,
  ...LOW_VOLTAGE_STANDARD_PACKAGE_CONNECTED_SLUGS,
]);

/** Build one honest completion row for every catalog service. */
export function buildElectricalServiceLaborReadiness(): ServiceLaborReadiness[] {
  const operationByKey = new Map(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, operation]));
  const scenarios = buildElectricalStandardScenarios();
  const calibrationScenarios = [...ELECTRICAL_CORE_CALIBRATION_SCENARIOS, ...ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS];
  const calibrationGroupsByOperation = new Map<string, Set<string>>();
  for (const group of ELECTRICAL_LABOR_CALIBRATION_GROUPS) {
    for (const operationKey of [...group.anchorOperationKeys, ...group.relatedOperationKeys]) {
      const keys = calibrationGroupsByOperation.get(operationKey) ?? new Set<string>();
      keys.add(group.key);
      calibrationGroupsByOperation.set(operationKey, keys);
    }
  }
  const scenariosByService = new Map<string, typeof scenarios>();
  for (const scenario of scenarios) scenariosByService.set(scenario.serviceSlug, [...(scenariosByService.get(scenario.serviceSlug) ?? []), scenario]);

  const result: ServiceLaborReadiness[] = [];
  for (const family of ELECTRICAL_LABOR_FAMILIES) {
    for (const serviceSlug of family.serviceSlugs) {
      const recipes = ELECTRICAL_ATOMIC_LABOR_RECIPES.filter((recipe) => recipe.appliesTo.includes(serviceSlug));
      const operationKeys = [...new Set(recipes.flatMap((recipe) => recipe.lines.map((line) => line.operationKey)))].sort();
      const missingScopeFacts = [...new Set((scenariosByService.get(serviceSlug) ?? []).flatMap((scenario) => scenario.kind === "NO_STANDARD" ? scenario.missingFacts : []))].sort();
      const scopeFactCollectionGroupKeys = [...new Set(missingScopeFacts.flatMap((key) => {
        const definition = ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.get(key);
        return definition ? [definition.collectionGroupKey] : [];
      }))].sort();
      const scopeFactsWithoutCollectionPath = missingScopeFacts.filter((key) => !ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.has(key));
      const operationsNeedingCalibration = operationKeys.filter((key) => {
        const operation = operationByKey.get(key);
        return !operation || operation.referenceStatus !== "VERIFIED" || operation.referenceLaborHours === null;
      });
      const directCalibrationScenarioKeys = calibrationScenarios
        .filter((scenario) => scenario.operationKeys.some((key) => operationKeys.includes(key)))
        .map((scenario) => scenario.key)
        .sort();
      const calibrationGroupKeys = [...new Set(operationKeys.flatMap((key) => [...(calibrationGroupsByOperation.get(key) ?? [])]))].sort();
      const operationsWithoutWizardPath = operationKeys.filter((key) =>
        !calibrationScenarios.some((scenario) => scenario.operationKeys.includes(key))
        && !calibrationGroupsByOperation.has(key),
      );
      const notApplicable = family.status === "NON_PRICEABLE_REVIEW" || family.status === "INTERNAL_FIXTURE";
      const hasBoundedStandard = (scenariosByService.get(serviceSlug) ?? []).some((scenario) => scenario.kind === "STANDARD");
      const runtimeConnection = notApplicable
        ? "NOT_APPLICABLE" as const
        : hasBoundedStandard || RUNTIME_CONNECTED_ATOMIC_SERVICE_SLUGS.has(serviceSlug)
          ? "CONNECTED" as const
          : "NOT_CONNECTED" as const;
      const runtimeConnectionReason = runtimeConnection === "CONNECTED"
        ? hasBoundedStandard
          ? "Bounded physical quantities project approved atomic operations into an approval-required service duration; runtime price calculation consumes only that approved duration."
          : POLICY_CONNECTED_ATOMIC_SERVICE_SLUGS.has(serviceSlug)
            ? "An explicitly resolved contractor scope policy or contractor-reviewed bounded package binds the qualified atomic recipe into approval-required service duration and pricing review."
            : SURFACE_ROUTE_CONNECTED_ATOMIC_SERVICE_SLUGS.has(serviceSlug)
              ? "The customer-visible surface geometry feeds the shared surface takeoff and atomic labor bridge; contractor system policy and explicit derived-price approval remain required. Route Assist is not pricing authority without contractor confirmation."
            : LOW_VOLTAGE_STANDARD_PACKAGE_CONNECTED_SLUGS.has(serviceSlug)
              ? "The homeowner's approximate standard accessible range enters contractor review; the contractor's approved maximum footage, atomic labor, material package and pricing rules produce an editable unsent suggestion. Longer, finished-space and uncertain routes remain review-only."
            : "Template service is DERIVED_RESOLVED_SCOPE; resolved Routing V2 components invoke the atomic labor bridges."
        : runtimeConnection === "NOT_APPLICABLE"
          ? "Review-only work or an internal fixture is outside the customer-price runtime rollout."
          : "Canonical atomic recipe exists, but required physical scope facts are not yet bound to a supported runtime path.";

      let state: ServiceLaborReadinessState;
      if (family.status === "NON_PRICEABLE_REVIEW") state = "NON_PRICEABLE_REVIEW";
      else if (family.status === "INTERNAL_FIXTURE") state = "INTERNAL_FIXTURE";
      else if (missingScopeFacts.length > 0 && operationsNeedingCalibration.length > 0) state = "NEEDS_SCOPE_AND_CALIBRATION";
      else if (operationsNeedingCalibration.length > 0) state = "NEEDS_CALIBRATION";
      else state = "READY_FOR_RUNTIME_CONNECTION";

      result.push({
        serviceSlug, familyKey: family.key, state,
        recipeKeys: recipes.map((recipe) => recipe.key).sort(), operationKeys,
        missingScopeFacts, scopeFactCollectionGroupKeys, scopeFactsWithoutCollectionPath, operationsNeedingCalibration,
        directCalibrationScenarioKeys, calibrationGroupKeys, operationsWithoutWizardPath,
        runtimeConnection, runtimeConnectionReason,
      });
    }
  }
  return result.sort((a, b) => a.serviceSlug.localeCompare(b.serviceSlug));
}
