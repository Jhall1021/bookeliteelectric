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
export const DEDICATED_CIRCUIT_REVIEW_CONNECTED_SLUGS = new Set([
  "dedicated-120v-circuit-outlet",
  "sump-pump-dedicated-circuit",
]);
/** Entry services whose preset fact reroutes into a supported canonical package. */
export const CONNECTED_ENTRY_ALIAS_SLUGS = new Set([
  "bidet-smart-toilet-outlet",
  "freezer-fridge-dedicated-circuit",
  "garage-door-opener-outlet-ev",
]);
export const REVIEWED_ACCESSIBLE_LIGHTING_SLUGS = new Set([
  "new-ceiling-fan",
  "new-ceiling-light",
  "new-wall-sconce",
]);
export const REVIEWED_ACCESSIBLE_RECESSED_LIGHTING_SLUGS = new Set([
  "recessed-lighting",
]);
export const REVIEWED_ACCESSIBLE_EXTERIOR_LIGHT_SLUGS = new Set([
  "new-exterior-lighting-locations",
]);
export const REVIEWED_ELECTRIC_FIREPLACE_SLUGS = new Set([
  "electric-fireplace-circuit",
]);
export const REVIEWED_ACCESSIBLE_EXTERIOR_GFCI_SLUGS = new Set([
  "exterior-gfci-other-routing",
]);
export const REVIEWED_ACCESSIBLE_GARAGE_OPENER_SLUGS = new Set([
  "garage-door-opener-outlet",
]);
export const REVIEWED_OPEN_GARAGE_240V_SLUGS = new Set([
  "240v-garage-outlet",
  "240v-garage-outlet-14-30",
  "240v-garage-outlet-14-50",
  "240v-garage-outlet-6-50",
]);
export const REVIEWED_APPLIANCE_240V_SLUGS = new Set([
  "new-240v-appliance-circuit",
]);
export const REVIEWED_EV_CHARGER_SLUGS = new Set([
  "level-2-ev-charger",
]);
export const REVIEWED_LANDSCAPE_LIGHTING_SLUGS = new Set([
  "outdoor-landscape-lighting",
]);
export const REVIEWED_SPA_SLUGS = new Set([
  "hot-tub-spa-electrical",
]);
export const RUNTIME_CONNECTED_ATOMIC_SERVICE_SLUGS = new Set([
  "new-120v-outlet",
  ...POLICY_CONNECTED_ATOMIC_SERVICE_SLUGS,
  ...SURFACE_ROUTE_CONNECTED_ATOMIC_SERVICE_SLUGS,
  ...LOW_VOLTAGE_STANDARD_PACKAGE_CONNECTED_SLUGS,
  ...DEDICATED_CIRCUIT_REVIEW_CONNECTED_SLUGS,
  ...CONNECTED_ENTRY_ALIAS_SLUGS,
  ...REVIEWED_ACCESSIBLE_LIGHTING_SLUGS,
  ...REVIEWED_ACCESSIBLE_RECESSED_LIGHTING_SLUGS,
  ...REVIEWED_ACCESSIBLE_EXTERIOR_LIGHT_SLUGS,
  ...REVIEWED_ELECTRIC_FIREPLACE_SLUGS,
  ...REVIEWED_ACCESSIBLE_EXTERIOR_GFCI_SLUGS,
  ...REVIEWED_ACCESSIBLE_GARAGE_OPENER_SLUGS,
  ...REVIEWED_OPEN_GARAGE_240V_SLUGS,
  ...REVIEWED_APPLIANCE_240V_SLUGS,
  ...REVIEWED_EV_CHARGER_SLUGS,
  ...REVIEWED_LANDSCAPE_LIGHTING_SLUGS,
  ...REVIEWED_SPA_SLUGS,
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
            : DEDICATED_CIRCUIT_REVIEW_CONNECTED_SLUGS.has(serviceSlug)
              ? "Only an exact reviewed accessible package connects: a supported 15A package or the sump-specific 20A/GFCI package. Contractor-confirmed footage, panel suitability, required protection, cable policies, atomic labor and exact material takeoff produce an editable unsent suggestion."
            : CONNECTED_ENTRY_ALIAS_SLUGS.has(serviceSlug)
              ? "This entry service carries a bounded preset fact into the canonical reviewed package; the quote is calculated there from contractor-confirmed scope, approved atomic labor and exact materials."
            : REVIEWED_ACCESSIBLE_LIGHTING_SLUGS.has(serviceSlug)
              ? "Only the reviewed bounded accessible package with a contractor-confirmed existing lighting source connects; contractor-confirmed footage, cable policies, approved atomic labor and exact materials produce an editable unsent suggestion."
            : REVIEWED_ACCESSIBLE_RECESSED_LIGHTING_SLUGS.has(serviceSlug)
              ? "Only the reviewed accessible-attic package connects: customer-selected whole light count, contractor-confirmed source and cable path, contractor cable policies, approved atomic labor and the shared material takeoff produce an editable unsent suggestion. Finished-space, high-access, new-control and uncertain branches remain review-only."
            : REVIEWED_ACCESSIBLE_EXTERIOR_LIGHT_SLUGS.has(serviceSlug)
              ? "Only the reviewed one-location package connects: a customer-supplied hardwired fixture on ordinary first-story siding, contractor-confirmed existing switched source, wall conditions and accessible cable path, contractor cable policies, approved atomic labor and exact materials produce an editable unsent suggestion. Specialty walls, new controls, lifts, remediation and additional locations remain review-only."
            : REVIEWED_ELECTRIC_FIREPLACE_SLUGS.has(serviceSlug)
              ? "Only the reviewed plug-in 120V package connects after the contractor confirms a standard 15A or 20A circuit from the equipment label/manual, panel capacity and the actual accessible route. Exact breaker and 14/2-or-12/2 cable costs, approved atomic labor and contractor pricing rules produce an editable unsent suggestion. Hardwired, 240V, nonstandard-plug, specialty-wall, inaccessible and remediation scopes remain review-only."
            : REVIEWED_ACCESSIBLE_EXTERIOR_GFCI_SLUGS.has(serviceSlug)
              ? "Only the reviewed 1–20-foot accessible package connects after the contractor confirms the source and exterior-wall conditions; confirmed footage, cable policies, approved atomic labor and exact materials produce an editable unsent suggestion."
            : REVIEWED_ACCESSIBLE_GARAGE_OPENER_SLUGS.has(serviceSlug)
              ? "Only the reviewed accessible package connects after the contractor confirms the selected source already has compliant upstream garage protection; confirmed footage, cable policies, approved atomic labor and exact materials produce an editable unsent suggestion."
            : REVIEWED_OPEN_GARAGE_240V_SLUGS.has(serviceSlug)
              ? "Only the reviewed open-garage package connects after the contractor confirms the selected NEMA configuration, panel capacity and actual cable route; exact configuration materials, approved atomic labor and pricing rules produce an editable unsent suggestion."
            : REVIEWED_APPLIANCE_240V_SLUGS.has(serviceSlug)
              ? "Only the reviewed modern four-wire plug-in appliance package connects after the contractor confirms the equipment instructions, 30A dryer or 50A range configuration, surface-box endpoint, panel capacity and actual accessible route. Exact breaker, cable and receptacle materials, approved atomic labor and pricing rules produce an editable unsent suggestion; legacy three-wire, hardwired, flush-wall, finished-route and remediation scopes remain review-only."
            : REVIEWED_EV_CHARGER_SLUGS.has(serviceSlug)
              ? "Only the reviewed customer-supplied hardwired 40A-output charger on a 50A circuit connects after the contractor confirms the equipment instructions, ordinary attached-garage mounting, panel capacity and actual accessible route. Exact breaker, 6/2 cable, supports, approved atomic labor and pricing rules produce an editable unsent suggestion; plug-in, outdoor, detached, load-managed, specialty-wall, commissioning, finished-route and remediation scopes remain review-only."
            : REVIEWED_LANDSCAPE_LIGHTING_SLUGS.has(serviceSlug)
              ? "Only the reviewed customer-supplied 4, 6 or 8-fixture package connects after the contractor confirms compatible low-voltage equipment, a suitable existing outdoor GFCI source, ordinary softscape and the actual cable route. Exact cable and waterproof-connection materials, approved atomic labor and pricing rules produce an editable unsent suggestion; hardscape, excavation, new power, equipment supply, advanced controls and longer routes remain review-only."
            : REVIEWED_SPA_SLUGS.has(serviceSlug)
              ? "Only the contractor-reviewed exterior-panel 50A four-wire spa package connects. Measured exterior PVC and liquidtight raceways, separate wet-location conductors, panel and disconnect suitability, optional measured bonding, approved atomic labor and exact materials produce an editable unsent suggestion. NM-B in exterior conduit, 60A equipment, interior or underground routing, trenching, hardscape, remediation and uncertain bonding remain review-only."
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
