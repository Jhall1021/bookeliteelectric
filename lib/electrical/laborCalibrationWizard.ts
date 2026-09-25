import { ELECTRICAL_LABOR_CALIBRATION_GROUPS } from "./atomicLabor";

export type CalibrationScenario = {
  key: string;
  prompt: string;
  scope: string;
  operationKeys: string[];
  calibrationGroups: string[];
  /** Offered services that make this optional specialty check relevant. */
  relevantServiceSlugs?: string[];
  bookComparison?: {
    lowHours: number;
    highHours: number;
    observationIds: string[];
    caution: string;
  };
};

/**
 * The mandatory first pass is intentionally four familiar complete jobs.
 * Answers establish contractor speed evidence; they do not directly overwrite
 * every operation inside the scenario.
 */
export const ELECTRICAL_CORE_CALIBRATION_SCENARIOS: CalibrationScenario[] = [
  {
    key: "replace-standard-receptacle",
    prompt: "How long does it normally take you to replace one working standard outlet in an existing box?",
    scope: "Power is present, the box and wiring are usable, and diagnosis is not included.",
    operationKeys: ["ELEC_REPLACE_STANDARD_RECEPTACLE"],
    calibrationGroups: ["DEVICE_REPLACEMENT"],
    bookComparison: { lowHours: 0.3, highHours: 1, observationIds: ["O001", "O018", "O025", "O088"], caution: "Published sources vary in time basis; use as a range, not one adopted unit." },
  },
  {
    key: "replace-interior-light",
    prompt: "How long does it take to remove and replace one standard flush-mount ceiling fixture?",
    scope: "Same usable box and wiring, ceiling at 10 feet or lower, customer fixture ready, no diagnosis.",
    operationKeys: ["ELEC_REPLACE_INTERIOR_LIGHT_FIXTURE"],
    calibrationGroups: ["LIGHTING_AND_FANS"],
    bookComparison: { lowHours: 0.5, highHours: 1, observationIds: ["O005", "O045", "O046"], caution: "Sources use mixed elapsed/labor-hour bases; retain the observed range." },
  },
  {
    key: "install-ceiling-fan-prepared-box",
    prompt: "How long does it take to install a ceiling fan where a fan-rated box and compatible wiring are already in place?",
    scope: "Ceiling at 10 feet or lower; assemble, hang, balance and test the fan. No support correction, new wiring or app setup.",
    operationKeys: ["ELEC_INSTALL_NEW_CEILING_FAN"],
    calibrationGroups: ["LIGHTING_AND_FANS"],
    bookComparison: { lowHours: 1.25, highHours: 1.6, observationIds: ["O006", "O038"], caution: "Published fan units are under 10 feet and vary with fan size and controls; use this only as a starting range." },
  },
  {
    key: "install-pendant-or-simple-chandelier",
    prompt: "How long does it take to install one pendant light or simple chandelier on an existing usable ceiling box?",
    scope: "Ceiling at 10 feet or lower, ordinary assembly and weight, compatible wiring and support. Large, crystal, multi-tier and open-to-below fixtures are excluded.",
    operationKeys: ["ELEC_INSTALL_NEW_CEILING_LIGHT"],
    calibrationGroups: ["LIGHTING_AND_FANS"],
  },
];

/** Bounded targeted checks for specialized work, shown only when needed. */
export const ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS: CalibrationScenario[] = [
  { key: "ethernet-50ft", prompt: "How long for one 50-foot Cat6 point through open accessible space, terminated and tested at both ends?", scope: "No finished-wall fishing, network equipment or troubleshooting.", operationKeys: ["ELEC_UTP_CABLE_ACCESSIBLE", "ELEC_TERMINATE_RJ45_END", "ELEC_TEST_DATA_CABLE"], calibrationGroups: ["LOW_VOLTAGE_CABLE"], relevantServiceSlugs: ["new-ethernet-line"] },
  { key: "tv-mount-prepared", prompt: "How long to mount and level one television at a prepared location?", scope: "Power and cable are ready; no concealment, backing or device setup.", operationKeys: ["ELEC_MOUNT_TV_EXISTING_LOCATION"], calibrationGroups: ["TV_AND_AUDIO_MOUNTING"], relevantServiceSlugs: ["tv-install-existing-location", "tv-installation", "tilt-tv-mount", "articulating-tv-mount"], bookComparison: { lowHours: 1, highHours: 1, observationIds: ["O060"], caution: "Published standard applies only to one TV at a prepared location; concealment and new power are excluded." } },
  { key: "smart-switch-hardware-and-app", prompt: "How long to install one compatible smart switch and then add it to the customer's app?", scope: "Usable wiring and Wi-Fi; hardware installation and app commissioning are kept as separate atomic operations.", operationKeys: ["ELEC_INSTALL_SMART_SWITCH_HARDWARE", "ELEC_COMMISSION_CONNECTED_DEVICE"], calibrationGroups: ["CONNECTED_CONTROLS"], relevantServiceSlugs: ["customer-supplied-smart-switch", "smart-outlet-upgrade", "smart-thermostat-install"] },
  { key: "generator-inlet-near-panel", prompt: "How long for your standard portable-generator inlet and interlock package beside a compatible panel?", scope: "30A inlet, listed interlock, available spaces and short accessible feeder route.", operationKeys: ["ELEC_INSTALL_GENERATOR_INLET", "ELEC_INSTALL_PANEL_INTERLOCK", "ELEC_INSTALL_NEW_SINGLE_POLE_BREAKER"], calibrationGroups: ["OUTDOOR_AND_BACKUP_POWER", "NEW_BRANCH_ENDPOINTS"], relevantServiceSlugs: ["generator-inlet-interlock"] },
  { key: "exterior-wall-penetration", prompt: "How long to make and weather-seal one ordinary exterior-wall cable penetration?", scope: "Ordinary siding and sheathing at a prepared location; brick, stone, stucco, structural drilling and interior restoration excluded.", operationKeys: ["ELEC_PENETRATE_EXTERIOR_WALL"], calibrationGroups: ["NEW_BRANCH_ENDPOINTS"], relevantServiceSlugs: ["exterior-gfci-standard", "exterior-gfci-other-routing"] },
  { key: "weatherproof-receptacle-box", prompt: "How long to mount and seal one exterior weatherproof receptacle box and in-use cover?", scope: "Prepared ordinary exterior endpoint; masonry specialty work, cable routing, receptacle installation and wall restoration excluded.", operationKeys: ["ELEC_INSTALL_WEATHERPROOF_RECEPTACLE_BOX"], calibrationGroups: ["NEW_BRANCH_ENDPOINTS"], relevantServiceSlugs: ["exterior-gfci-standard", "exterior-gfci-other-routing"] },
  { key: "bath-fan-clean-swap", prompt: "How long for a bathroom exhaust-fan swap when the new housing and duct connection fit?", scope: "Accessible compatible opening and duct; finish repair excluded.", operationKeys: ["ELEC_REPLACE_BATH_EXHAUST_FAN"], calibrationGroups: ["LIGHTING_AND_FANS"], relevantServiceSlugs: ["bathroom-fan-light-combo", "replace-bathroom-exhaust-fan", "replace-bathroom-exhaust-fan-with-light"], bookComparison: { lowHours: 2, highHours: 3, observationIds: ["O040", "O041"], caution: "Published replacement range is broader than one contractor's exact housing and duct method; use it only as a starting point." } },
  { key: "hardwired-detector-swap", prompt: "How long to replace one compatible hardwired smoke or smoke/CO detector?", scope: "Existing compatible box, wiring and interconnect; no new wiring, circuit tracing or programming.", operationKeys: ["ELEC_REPLACE_HARDWIRED_DETECTOR"], calibrationGroups: ["HARDWIRED_DETECTOR"], relevantServiceSlugs: ["hardwired-smoke-detector", "smoke-co-detector"], bookComparison: { lowHours: 0.25, highHours: 1 / 3, observationIds: ["O035"], caution: "Published 15–20 minute unit applies only to a compatible existing hardwired replacement." } },
  { key: "single-pole-breaker-swap", prompt: "How long to replace one identified compatible single-pole breaker?", scope: "Ordinary accessible panel, known compatible breaker, no diagnosis or corrective work.", operationKeys: ["ELEC_REPLACE_SINGLE_POLE_BREAKER"], calibrationGroups: ["BREAKER_AND_SURGE"], relevantServiceSlugs: ["single-pole-breaker-replacement", "double-pole-breaker-replacement"], bookComparison: { lowHours: 0.5, highHours: 0.5, observationIds: ["O012"], caution: "Published half-hour unit excludes diagnosing why a breaker trips and correcting panel defects." } },
  { key: "high-amp-receptacle-swap", prompt: "How long to replace one compatible existing dryer or range receptacle?", scope: "Existing serviceable box and correct conductors; no circuit conversion, new cable or diagnosis.", operationKeys: ["ELEC_REPLACE_HIGH_AMP_RECEPTACLE"], calibrationGroups: ["HIGH_AMP_RECEPTACLE"], relevantServiceSlugs: ["dryer-receptacle-replacement", "range-receptacle-replacement"], bookComparison: { lowHours: 0.5, highHours: 0.5, observationIds: ["O004"], caution: "Direct published evidence is for a range receptacle; confirm the suggestion before applying the shared physical replacement unit to dryer work." } },
  { key: "otr-microwave-clean-swap", prompt: "How long to replace one compatible over-the-range microwave in the same prepared location?", scope: "Aligned bracket, power and vent conditions; cabinet changes, new venting, new circuit and finish repair excluded.", operationKeys: ["ELEC_REPLACE_OTR_MICROWAVE"], calibrationGroups: ["APPLIANCE_ELECTRICAL_CONNECTION"], relevantServiceSlugs: ["otr-microwave-install"], bookComparison: { lowHours: 1.25, highHours: 1.75, observationIds: ["O054"], caution: "Published clean-swap range applies only when the existing bracket, opening, power and vent conditions are compatible." } },
  { key: "range-hood-clean-swap", prompt: "How long to replace one compatible under-cabinet range hood in the same location?", scope: "Existing power and duct reconnect; cabinet changes, new ductwork, backsplash cutting and island/chimney conversion excluded.", operationKeys: ["ELEC_REPLACE_RANGE_HOOD_CLEAN_SWAP"], calibrationGroups: ["APPLIANCE_ELECTRICAL_CONNECTION"], relevantServiceSlugs: ["replace-range-hood"], bookComparison: { lowHours: 1.25, highHours: 1.75, observationIds: ["O008", "O057"], caution: "Published clean-swap evidence excludes wall-chimney and island hoods, which carry materially longer ranges." } },
  { key: "soundbar-prepared-mount", prompt: "How long to mount and connect one compatible customer-supplied soundbar below an already-mounted TV?", scope: "Prepared location; specialty brackets, new power, app setup and concealed cable routing excluded.", operationKeys: ["ELEC_MOUNT_SOUNDBAR"], calibrationGroups: ["TV_AND_AUDIO_MOUNTING"], relevantServiceSlugs: ["soundbar-installation"], bookComparison: { lowHours: 0.5, highHours: 0.75, observationIds: ["O062"], caution: "Published range supports the prepared mounting operation only; concealed cable routing remains a separately measured operation." } },
  { key: "doorbell-transformer-known-location", prompt: "How long to replace one compatible doorbell transformer when its location and circuit are already known?", scope: "Accessible identified transformer and output verification; locating, tracing, new wiring and chime diagnosis excluded. Published evidence says one hour or less, but does not provide a lower bound, so no numeric suggestion is shown.", operationKeys: ["ELEC_REPLACE_DOORBELL_TRANSFORMER"], calibrationGroups: ["LOW_VOLTAGE_CABLE"], relevantServiceSlugs: ["doorbell-transformer-replacement"] },
  { key: "whole-house-surge-ready-panel", prompt: "How long to install one whole-house surge protector in a suitable panel?", scope: "Suitable location and connection method already established; panel-capacity changes, repairs and diagnosis excluded.", operationKeys: ["ELEC_INSTALL_WHOLE_HOUSE_SPD"], calibrationGroups: ["BREAKER_AND_SURGE"], relevantServiceSlugs: ["whole-house-surge-protection"], bookComparison: { lowHours: 1, highHours: 2, observationIds: ["O036", "O037"], caution: "Both published sources support the same 1–2 hour range only for a suitable panel; capacity or corrective work is separate." } },
  {
    key: "initial-electrical-diagnostic",
    prompt: "How long do you allow for an initial electrical troubleshooting visit, including intake, up to one hour of diagnosis or a bounded minor repair, findings and closeout?",
    scope: "One reported symptom and one initial visit. Materials, additional diagnostic time and repairs that require a separately priced physical recipe are excluded.",
    operationKeys: ["ELEC_DIAGNOSTIC_SCOPE_CONFIRMATION", "ELEC_INITIAL_DIAGNOSTIC_BLOCK", "ELEC_DOCUMENT_DIAGNOSTIC_FINDINGS", "ELEC_DIAGNOSTIC_CLOSEOUT"],
    calibrationGroups: ["DIAGNOSTIC_VISIT"],
    relevantServiceSlugs: ["electrical-troubleshooting"],
  },
  {
    key: "residential-electrical-safety-inspection",
    prompt: "How long for one residential electrical safety inspection and written findings summary?",
    scope: "Visual and functional review of the service, panels, grounding, representative devices, visible wiring and life-safety electrical items. Destructive investigation, certification and repairs are excluded.",
    operationKeys: ["ELEC_DIAGNOSTIC_SCOPE_CONFIRMATION", "ELEC_HOME_SAFETY_INSPECTION", "ELEC_DOCUMENT_SAFETY_INSPECTION"],
    calibrationGroups: ["SAFETY_INSPECTION"],
    relevantServiceSlugs: ["home-electrical-safety-inspection"],
    bookComparison: { lowHours: 2, highHours: 3, observationIds: ["O080", "O081"], caution: "The published range is for the complete residential inspection visit; keep repairs and certification outside the calibrated scope." },
  },
];

/**
 * Adds only specialty checks relevant to work the contractor actually offers.
 * A check disappears once all of its atomic operations already have decisions.
 */
export function selectElectricalTargetedCalibrationScenarios(
  offeredServiceSlugs: Iterable<string>,
  establishedOperationKeys: Iterable<string> = [],
): CalibrationScenario[] {
  const offered = new Set(offeredServiceSlugs);
  const established = new Set(establishedOperationKeys);
  return ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS.filter((scenario) =>
    scenario.relevantServiceSlugs?.some((slug) => offered.has(slug))
    && scenario.operationKeys.some((key) => !established.has(key)),
  );
}

export type PublishedBookStartingPoint = {
  suggestedMinutes: number;
  rangeMinutes: { low: number; high: number };
  method: "PUBLISHED_RANGE_MIDPOINT";
  caution: string;
};

/** A visible starting point, never an approved labor value. */
export function publishedBookStartingPoint(scenario: CalibrationScenario): PublishedBookStartingPoint | null {
  const comparison = scenario.bookComparison;
  if (!comparison) return null;
  const low = Math.round(comparison.lowHours * 60);
  const high = Math.round(comparison.highHours * 60);
  return {
    suggestedMinutes: Math.round((low + high) / 2),
    rangeMinutes: { low, high },
    method: "PUBLISHED_RANGE_MIDPOINT",
    caution: comparison.caution,
  };
}

export type ProposalConfidence = "DIRECT" | "FAMILY_RELATIONSHIP" | "CROSS_FAMILY_LOW";

export function proposalConfidence(operationKey: string, answeredScenarioKeys: Set<string>): ProposalConfidence {
  const answered = [...ELECTRICAL_CORE_CALIBRATION_SCENARIOS, ...ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS]
    .filter((scenario) => answeredScenarioKeys.has(scenario.key));
  if (answered.some((scenario) => scenario.operationKeys.includes(operationKey))) return "DIRECT";
  const answeredGroups = new Set(answered.flatMap((scenario) => scenario.calibrationGroups));
  const operationGroups = ELECTRICAL_LABOR_CALIBRATION_GROUPS
    .filter((group) => [...group.anchorOperationKeys, ...group.relatedOperationKeys].includes(operationKey))
    .map((group) => group.key);
  if (operationGroups.some((group) => answeredGroups.has(group))) return "FAMILY_RELATIONSHIP";
  return "CROSS_FAMILY_LOW";
}

export function proposalRequiresExplicitApproval(confidence: ProposalConfidence): boolean {
  return confidence !== "DIRECT";
}

export type CalibrationAnswer = { scenarioKey: string; contractorHours: number };
export type SpeedSignal = {
  kind: "INSUFFICIENT" | "CONSISTENT" | "MIXED";
  factor: number | null;
  comparableAnswerCount: number;
  factors: { scenarioKey: string; factor: number }[];
  supportingOnly: true;
  mayAutoApprove: false;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Overall speed is corroborating evidence only; it never writes labor. */
export function analyzeContractorSpeed(answers: CalibrationAnswer[]): SpeedSignal {
  const byKey = new Map(ELECTRICAL_CORE_CALIBRATION_SCENARIOS.map((scenario) => [scenario.key, scenario]));
  const uniqueAnswers = new Map(answers.map((answer) => [answer.scenarioKey, answer]));
  const factors = [...uniqueAnswers.values()].flatMap((answer) => {
    const scenario = byKey.get(answer.scenarioKey);
    const book = scenario?.bookComparison;
    if (!book || !Number.isFinite(answer.contractorHours) || answer.contractorHours <= 0) return [];
    const midpoint = (book.lowHours + book.highHours) / 2;
    return [{ scenarioKey: answer.scenarioKey, factor: answer.contractorHours / midpoint }];
  });
  if (factors.length < 4) return { kind: "INSUFFICIENT", factor: null, comparableAnswerCount: factors.length, factors, supportingOnly: true, mayAutoApprove: false };
  const factor = median(factors.map((entry) => entry.factor));
  const consistentCount = factors.filter((entry) => Math.abs(entry.factor - factor) / factor <= 0.25).length;
  return { kind: consistentCount / factors.length >= 0.75 ? "CONSISTENT" : "MIXED", factor, comparableAnswerCount: factors.length, factors, supportingOnly: true, mayAutoApprove: false };
}

/** Joshua's example: preserve the book's incremental difference from a known anchor. */
export function proposeFromBookDelta(contractorAnchorMinutes: number, bookAnchorMinutes: number, bookTargetMinutes: number) {
  if (![contractorAnchorMinutes, bookAnchorMinutes, bookTargetMinutes].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("labor minutes must be nonnegative finite numbers");
  return { proposedMinutes: Math.max(0, contractorAnchorMinutes + (bookTargetMinutes - bookAnchorMinutes)), method: "PRESERVE_BOOK_DELTA" as const, requiresExplicitApproval: true };
}
