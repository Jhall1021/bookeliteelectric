import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS as operations } from "../lib/electrical/atomicLabor";
import { ELECTRICAL_CORE_CALIBRATION_SCENARIOS as core, ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS as targeted, analyzeContractorSpeed, proposalConfidence, proposalRequiresExplicitApproval, proposeFromBookDelta, publishedBookStartingPoint } from "../lib/electrical/laborCalibrationWizard";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const known = new Set(operations.map((operation) => operation.key));

ok(core.length === 8, "mandatory first pass contains exactly eight familiar scenarios");
ok(new Set([...core, ...targeted].map((scenario) => scenario.key)).size === core.length + targeted.length, "scenario keys are unique");
ok([...core, ...targeted].every((scenario) => scenario.operationKeys.every((key) => known.has(key))), "every scenario refers only to known atomic operations");
ok(core.some((scenario) => scenario.key === "new-outlet-finished-20ft" && scenario.scope.includes("Eight framing crossings")), "finished-route anchor fixes the geometry rather than asking a vague outlet question");
ok(core.some((scenario) => scenario.key === "twenty-four-circuit-panel" && scenario.scope.includes("utility") && scenario.scope.includes("excluded")), "panel anchor excludes coordination and service work");
const outletStartingPoint = publishedBookStartingPoint(core.find((scenario) => scenario.key === "replace-standard-receptacle")!);
ok(outletStartingPoint?.suggestedMinutes === 39 && outletStartingPoint.rangeMinutes.low === 18 && outletStartingPoint.rangeMinutes.high === 60, "published outlet suggestion is the visible midpoint of the retained range");
const waferStartingPoint = publishedBookStartingPoint(core.find((scenario) => scenario.key === "four-wafer-lights-open-attic")!);
ok(waferStartingPoint?.suggestedMinutes === 240 && waferStartingPoint.method === "PUBLISHED_RANGE_MIDPOINT", "single published time remains its own starting point");
ok(publishedBookStartingPoint(core.find((scenario) => scenario.key === "dishwasher-electrical-reconnect")!) === null, "scenario without published numeric evidence does not invent a suggestion");

const coreAnswered = new Set(core.map((scenario) => scenario.key));
ok(proposalConfidence("ELEC_REPLACE_STANDARD_RECEPTACLE", coreAnswered) === "DIRECT", "answered anchor operation is direct evidence");
ok(proposalConfidence("ELEC_REPLACE_STANDARD_SWITCH", coreAnswered) === "FAMILY_RELATIONSHIP", "same-family unasked operation is a relationship proposal");
ok(proposalConfidence("ELEC_INSTALL_GENERATOR_INLET", coreAnswered) === "CROSS_FAMILY_LOW", "unrepresented specialty work stays low-confidence");
ok(proposalRequiresExplicitApproval("FAMILY_RELATIONSHIP") && proposalRequiresExplicitApproval("CROSS_FAMILY_LOW"), "every inferred proposal requires explicit contractor approval");
ok(!proposalRequiresExplicitApproval("DIRECT"), "a direct answer does not masquerade as an inferred proposal");

const insufficient = analyzeContractorSpeed([{ scenarioKey: "replace-standard-receptacle", contractorHours: 0.5 }]);
ok(insufficient.kind === "INSUFFICIENT" && insufficient.factor === null && insufficient.mayAutoApprove === false, "one answer cannot establish an overall contractor speed pattern");
const duplicateAnswers = analyzeContractorSpeed(Array.from({ length: 8 }, () => ({ scenarioKey: "replace-standard-receptacle", contractorHours: 0.5 })));
ok(duplicateAnswers.kind === "INSUFFICIENT" && duplicateAnswers.comparableAnswerCount === 1, "duplicate submissions cannot manufacture the four-scenario minimum");
const consistent = analyzeContractorSpeed([
  { scenarioKey: "replace-standard-receptacle", contractorHours: 0.4875 },
  { scenarioKey: "new-outlet-accessible-20ft", contractorHours: 0.5625 },
  { scenarioKey: "four-wafer-lights-open-attic", contractorHours: 3 },
  { scenarioKey: "replace-interior-light", contractorHours: 0.5625 },
  { scenarioKey: "replace-ceiling-fan", contractorHours: 1.125 },
  { scenarioKey: "twenty-four-circuit-panel", contractorHours: 3.9375 },
]);
ok(consistent.kind === "CONSISTENT" && consistent.factor === 0.75 && consistent.supportingOnly && !consistent.mayAutoApprove, "six aligned answers establish a 0.75 supporting signal without approval authority");
const mixed = analyzeContractorSpeed([
  { scenarioKey: "replace-standard-receptacle", contractorHours: 0.2 },
  { scenarioKey: "new-outlet-accessible-20ft", contractorHours: 1.5 },
  { scenarioKey: "four-wafer-lights-open-attic", contractorHours: 2 },
  { scenarioKey: "replace-interior-light", contractorHours: 1.5 },
]);
ok(mixed.kind === "MIXED", "inconsistent answers do not produce a falsely consistent speed pattern");
const delta = proposeFromBookDelta(15, 20, 25);
ok(delta.proposedMinutes === 20 && delta.method === "PRESERVE_BOOK_DELTA" && delta.requiresExplicitApproval, "20-minute switch / 25-minute fish / 15-minute contractor anchor proposes 20 minutes, exactly preserving the five-minute book delta");

console.log(`\nELECTRICAL LABOR CALIBRATION WIZARD — ${checks}/${checks} checks passed`);
