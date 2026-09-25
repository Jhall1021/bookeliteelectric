import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS as operations } from "../lib/electrical/atomicLabor";
import { ELECTRICAL_CORE_CALIBRATION_SCENARIOS as core, ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS as targeted, analyzeContractorSpeed, proposalConfidence, proposalRequiresExplicitApproval, proposeFromBookDelta, publishedBookStartingPoint, selectElectricalTargetedCalibrationScenarios } from "../lib/electrical/laborCalibrationWizard";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const known = new Set(operations.map((operation) => operation.key));

ok(core.length === 4, "mandatory first pass contains exactly four familiar scenarios");
ok(new Set([...core, ...targeted].map((scenario) => scenario.key)).size === core.length + targeted.length, "scenario keys are unique");
ok([...core, ...targeted].every((scenario) => scenario.operationKeys.every((key) => known.has(key))), "every scenario refers only to known atomic operations");
ok(core.map((scenario) => scenario.key).join() === "replace-standard-receptacle,replace-interior-light,install-ceiling-fan-prepared-box,install-pendant-or-simple-chandelier", "mandatory first pass is limited to the four approved familiar jobs");
const outletStartingPoint = publishedBookStartingPoint(core.find((scenario) => scenario.key === "replace-standard-receptacle")!);
ok(outletStartingPoint?.suggestedMinutes === 39 && outletStartingPoint.rangeMinutes.low === 18 && outletStartingPoint.rangeMinutes.high === 60, "published outlet suggestion is the visible midpoint of the retained range");
const fanStartingPoint = publishedBookStartingPoint(core.find((scenario) => scenario.key === "install-ceiling-fan-prepared-box")!);
ok(fanStartingPoint?.suggestedMinutes === 86 && fanStartingPoint.method === "PUBLISHED_RANGE_MIDPOINT", "prepared-box fan question shows the midpoint of its retained published range");
ok(publishedBookStartingPoint(core.find((scenario) => scenario.key === "install-pendant-or-simple-chandelier")!) === null, "pendant question without published numeric evidence does not invent a suggestion");

const selectedSurface = selectElectricalTargetedCalibrationScenarios(["surface-mounted-outlet"]);
ok(selectedSurface.map((scenario) => scenario.key).join() === "surface-raceway-10ft", "surface-raceway work selects only its specialty calibration");
ok(selectElectricalTargetedCalibrationScenarios(["new-ethernet-line"]).some((scenario) => scenario.key === "ethernet-50ft"), "offered Ethernet work selects its cable calibration");
ok(selectElectricalTargetedCalibrationScenarios(["tv-installation"]).some((scenario) => scenario.key === "tv-mount-prepared"), "offered TV work selects its mounting calibration");
ok(selectElectricalTargetedCalibrationScenarios(["smart-thermostat-install"]).some((scenario) => scenario.key === "smart-switch-hardware-and-app"), "connected controls share the hardware and commissioning calibration");
ok(selectElectricalTargetedCalibrationScenarios(["generator-inlet-interlock"]).some((scenario) => scenario.key === "generator-inlet-near-panel"), "offered generator work selects its bounded package calibration");
const exteriorGfciScenarios = selectElectricalTargetedCalibrationScenarios(["exterior-gfci-standard"]);
ok(exteriorGfciScenarios.map((scenario) => scenario.key).join() === "exterior-wall-penetration,weatherproof-receptacle-box", "offered exterior GFCI work selects both missing atomic calibrations");
ok(exteriorGfciScenarios.every((scenario) => scenario.operationKeys.length === 1), "exterior GFCI specialty questions preserve one answer per atomic labor unit");
ok(exteriorGfciScenarios.every((scenario) => publishedBookStartingPoint(scenario) === null), "exterior GFCI atomic questions do not invent published starting points");
ok(selectElectricalTargetedCalibrationScenarios(["exterior-gfci-other-routing"]).length === 2, "routed exterior GFCI work shares the endpoint calibrations without pretending to know its route");
ok(selectElectricalTargetedCalibrationScenarios(["exterior-gfci-standard"], ["ELEC_PENETRATE_EXTERIOR_WALL"]).map((scenario) => scenario.key).join() === "weatherproof-receptacle-box", "an established exterior-wall unit suppresses only its own targeted question");
ok(selectElectricalTargetedCalibrationScenarios(["replace-bathroom-exhaust-fan"]).some((scenario) => scenario.key === "bath-fan-clean-swap"), "offered bath-fan work selects its clean-swap calibration");
ok(selectElectricalTargetedCalibrationScenarios(["smoke-co-detector"]).some((scenario) => scenario.key === "hardwired-detector-swap"), "offered hardwired detectors select one compatible-replacement calibration");
ok(selectElectricalTargetedCalibrationScenarios(["double-pole-breaker-replacement"]).some((scenario) => scenario.key === "single-pole-breaker-swap"), "breaker replacement family selects one bounded breaker anchor");
ok(selectElectricalTargetedCalibrationScenarios(["dryer-receptacle-replacement"]).some((scenario) => scenario.key === "high-amp-receptacle-swap"), "high-amperage receptacle work selects its bounded replacement anchor");
ok(selectElectricalTargetedCalibrationScenarios(["otr-microwave-install"]).some((scenario) => scenario.key === "otr-microwave-clean-swap"), "OTR microwave work selects only the compatible clean-swap calibration");
ok(selectElectricalTargetedCalibrationScenarios(["replace-range-hood"]).some((scenario) => scenario.key === "range-hood-clean-swap"), "range-hood work selects only the same-location clean-swap calibration");
ok(selectElectricalTargetedCalibrationScenarios(["soundbar-installation"]).some((scenario) => scenario.key === "soundbar-prepared-mount"), "soundbar work isolates mounting from separately measured concealment");
ok(selectElectricalTargetedCalibrationScenarios(["doorbell-transformer-replacement"]).some((scenario) => scenario.key === "doorbell-transformer-known-location"), "doorbell transformer work excludes locating and circuit tracing");
ok(selectElectricalTargetedCalibrationScenarios(["whole-house-surge-protection"]).some((scenario) => scenario.key === "whole-house-surge-ready-panel"), "surge protection selects its suitable-panel calibration");
ok(selectElectricalTargetedCalibrationScenarios(["replace-standard-outlet"]).length === 0, "ordinary core-covered work does not add unrelated specialty questions");
ok(selectElectricalTargetedCalibrationScenarios(["generator-inlet-interlock"], [
  "ELEC_INSTALL_GENERATOR_INLET", "ELEC_INSTALL_PANEL_INTERLOCK", "ELEC_INSTALL_NEW_SINGLE_POLE_BREAKER",
]).length === 0, "a specialty question is suppressed after all operations it informs are established");
ok(selectElectricalTargetedCalibrationScenarios(["generator-inlet-interlock"], ["ELEC_INSTALL_GENERATOR_INLET"]).length === 1, "a partially calibrated specialty family still asks for its missing operations");
ok(publishedBookStartingPoint(targeted.find((scenario) => scenario.key === "tv-mount-prepared")!)?.suggestedMinutes === 60, "prepared TV specialty question shows its direct published starting point");
ok(publishedBookStartingPoint(targeted.find((scenario) => scenario.key === "bath-fan-clean-swap")!)?.suggestedMinutes === 150, "bath-fan specialty question shows the midpoint of its retained 120–180 minute range");
ok(publishedBookStartingPoint(targeted.find((scenario) => scenario.key === "hardwired-detector-swap")!)?.suggestedMinutes === 18, "detector question shows the rounded midpoint of the published 15–20 minute range");
ok(publishedBookStartingPoint(targeted.find((scenario) => scenario.key === "otr-microwave-clean-swap")!)?.suggestedMinutes === 90, "microwave clean-swap question shows the midpoint of its retained 75–105 minute range");
ok(publishedBookStartingPoint(targeted.find((scenario) => scenario.key === "soundbar-prepared-mount")!)?.suggestedMinutes === 38, "soundbar question shows the rounded midpoint of its retained 30–45 minute range");
ok(publishedBookStartingPoint(targeted.find((scenario) => scenario.key === "whole-house-surge-ready-panel")!)?.suggestedMinutes === 90, "surge question shows the midpoint of two corroborating published ranges");
ok(publishedBookStartingPoint(targeted.find((scenario) => scenario.key === "doorbell-transformer-known-location")!) === null, "upper-bound-only doorbell evidence does not manufacture a lower bound or midpoint");
ok(publishedBookStartingPoint(targeted.find((scenario) => scenario.key === "surface-raceway-10ft")!) === null, "composite specialty question without complete scenario evidence does not invent a starting point");

const coreAnswered = new Set(core.map((scenario) => scenario.key));
ok(proposalConfidence("ELEC_REPLACE_STANDARD_RECEPTACLE", coreAnswered) === "DIRECT", "answered anchor operation is direct evidence");
ok(proposalConfidence("ELEC_REPLACE_STANDARD_SWITCH", coreAnswered) === "FAMILY_RELATIONSHIP", "same-family unasked operation is a relationship proposal");
ok(proposalConfidence("ELEC_INSTALL_GENERATOR_INLET", coreAnswered) === "CROSS_FAMILY_LOW", "unrepresented specialty work stays low-confidence");
ok(proposalConfidence("ELEC_PENETRATE_EXTERIOR_WALL", new Set(["exterior-wall-penetration"])) === "DIRECT", "answered exterior-wall question is direct atomic evidence");
ok(proposalConfidence("ELEC_INSTALL_WEATHERPROOF_RECEPTACLE_BOX", new Set(["weatherproof-receptacle-box"])) === "DIRECT", "answered weatherproof-box question is direct atomic evidence");
ok(proposalRequiresExplicitApproval("FAMILY_RELATIONSHIP") && proposalRequiresExplicitApproval("CROSS_FAMILY_LOW"), "every inferred proposal requires explicit contractor approval");
ok(!proposalRequiresExplicitApproval("DIRECT"), "a direct answer does not masquerade as an inferred proposal");

const insufficient = analyzeContractorSpeed([{ scenarioKey: "replace-standard-receptacle", contractorHours: 0.5 }]);
ok(insufficient.kind === "INSUFFICIENT" && insufficient.factor === null && insufficient.mayAutoApprove === false, "one answer cannot establish an overall contractor speed pattern");
const duplicateAnswers = analyzeContractorSpeed(Array.from({ length: 8 }, () => ({ scenarioKey: "replace-standard-receptacle", contractorHours: 0.5 })));
ok(duplicateAnswers.kind === "INSUFFICIENT" && duplicateAnswers.comparableAnswerCount === 1, "duplicate submissions cannot manufacture the four-scenario minimum");
const approvedCoreAnswers = analyzeContractorSpeed([
  { scenarioKey: "replace-standard-receptacle", contractorHours: 0.4875 },
  { scenarioKey: "replace-interior-light", contractorHours: 0.5625 },
  { scenarioKey: "install-ceiling-fan-prepared-box", contractorHours: 1.06875 },
  { scenarioKey: "install-pendant-or-simple-chandelier", contractorHours: 0.75 },
]);
ok(approvedCoreAnswers.kind === "INSUFFICIENT" && approvedCoreAnswers.comparableAnswerCount === 3, "the simplified four-question wizard does not manufacture a global speed factor from only three published comparisons");
const delta = proposeFromBookDelta(15, 20, 25);
ok(delta.proposedMinutes === 20 && delta.method === "PRESERVE_BOOK_DELTA" && delta.requiresExplicitApproval, "20-minute switch / 25-minute fish / 15-minute contractor anchor proposes 20 minutes, exactly preserving the five-minute book delta");

console.log(`\nELECTRICAL LABOR CALIBRATION WIZARD — ${checks}/${checks} checks passed`);
