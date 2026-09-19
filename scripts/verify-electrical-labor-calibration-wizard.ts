import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS as operations } from "../lib/electrical/atomicLabor";
import { ELECTRICAL_CORE_CALIBRATION_SCENARIOS as core, ELECTRICAL_TARGETED_CALIBRATION_SCENARIOS as targeted, proposalConfidence, proposalRequiresExplicitApproval } from "../lib/electrical/laborCalibrationWizard";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const known = new Set(operations.map((operation) => operation.key));

ok(core.length === 8, "mandatory first pass contains exactly eight familiar scenarios");
ok(new Set([...core, ...targeted].map((scenario) => scenario.key)).size === core.length + targeted.length, "scenario keys are unique");
ok([...core, ...targeted].every((scenario) => scenario.operationKeys.every((key) => known.has(key))), "every scenario refers only to known atomic operations");
ok(core.some((scenario) => scenario.key === "new-outlet-finished-20ft" && scenario.scope.includes("Eight framing crossings")), "finished-route anchor fixes the geometry rather than asking a vague outlet question");
ok(core.some((scenario) => scenario.key === "twenty-four-circuit-panel" && scenario.scope.includes("utility") && scenario.scope.includes("excluded")), "panel anchor excludes coordination and service work");

const coreAnswered = new Set(core.map((scenario) => scenario.key));
ok(proposalConfidence("ELEC_REPLACE_STANDARD_RECEPTACLE", coreAnswered) === "DIRECT", "answered anchor operation is direct evidence");
ok(proposalConfidence("ELEC_REPLACE_STANDARD_SWITCH", coreAnswered) === "FAMILY_RELATIONSHIP", "same-family unasked operation is a relationship proposal");
ok(proposalConfidence("ELEC_INSTALL_GENERATOR_INLET", coreAnswered) === "CROSS_FAMILY_LOW", "unrepresented specialty work stays low-confidence");
ok(proposalRequiresExplicitApproval("FAMILY_RELATIONSHIP") && proposalRequiresExplicitApproval("CROSS_FAMILY_LOW"), "every inferred proposal requires explicit contractor approval");
ok(!proposalRequiresExplicitApproval("DIRECT"), "a direct answer does not masquerade as an inferred proposal");

console.log(`\nELECTRICAL LABOR CALIBRATION WIZARD — ${checks}/${checks} checks passed`);
