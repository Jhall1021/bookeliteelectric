import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { buildElectricalOperationProposals } from "../lib/electrical/laborOperationProposals";
import { ELECTRICAL_CORE_CALIBRATION_SCENARIOS } from "../lib/electrical/laborCalibrationWizard";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };

const midpointAnswers = ELECTRICAL_CORE_CALIBRATION_SCENARIOS.map((scenario) => ({
  scenarioKey: scenario.key,
  contractorHours: scenario.bookComparison
    ? (scenario.bookComparison.lowHours + scenario.bookComparison.highHours) / 2
    : 1,
}));
const result = buildElectricalOperationProposals(midpointAnswers);
const direct = result.proposals.filter((proposal) => proposal.source === "DIRECT");
const inferred = result.proposals.filter((proposal) => proposal.source === "APPROVED_PROPOSAL");

ok(direct.length === 4, "only the four single-operation core scenarios produce direct rows");
ok(direct.some((proposal) => proposal.operationKey === "ELEC_REPLACE_STANDARD_RECEPTACLE"), "outlet replacement is direct");
ok(direct.some((proposal) => proposal.operationKey === "ELEC_REPLACE_INTERIOR_LIGHT_FIXTURE"), "fixture replacement is direct");
ok(direct.some((proposal) => proposal.operationKey === "ELEC_REPLACE_CEILING_FAN"), "fan replacement is direct");
ok(direct.some((proposal) => proposal.operationKey === "ELEC_DISHWASHER_DISCONNECT_RECONNECT"), "dishwasher electrical work is direct");
ok(result.unresolvedScenarioKeys.includes("new-outlet-finished-20ft"), "finished-route total remains unresolved rather than divided");
ok(result.unresolvedScenarioKeys.includes("twenty-four-circuit-panel"), "panel total remains unresolved rather than divided");
ok(!direct.some((proposal) => proposal.operationKey === "ELEC_MOUNT_LOADCENTER"), "panel answer does not fabricate a loadcenter unit");
ok(inferred.length === ELECTRICAL_ATOMIC_LABOR_OPERATIONS.filter((operation) => operation.referenceLaborHours !== null && operation.referenceStatus !== "DISPUTED").length, "consistent answers produce proposals only where atomic numeric references exist");
ok(inferred.every((proposal) => proposal.requiresExplicitApproval && !proposal.canPublish), "every relationship proposal requires approval and cannot publish");
ok(result.canPublish === false, "proposal set has no publish authority");

const mixed = buildElectricalOperationProposals(midpointAnswers.map((answer, index) => ({ ...answer, contractorHours: answer.contractorHours * (index % 2 ? 3 : 0.3) })));
ok(mixed.proposals.every((proposal) => proposal.source === "DIRECT"), "mixed contractor pattern suppresses global reference scaling");

const existing = buildElectricalOperationProposals(midpointAnswers, new Set(["ELEC_REPLACE_STANDARD_RECEPTACLE"]));
ok(!existing.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_STANDARD_RECEPTACLE"), "existing approved operation is never overwritten by a proposal");

const targetedDirect = buildElectricalOperationProposals([
  { scenarioKey: "tv-mount-prepared", contractorHours: 1.25 },
  { scenarioKey: "bath-fan-clean-swap", contractorHours: 2 },
]);
ok(targetedDirect.proposals.some((proposal) => proposal.operationKey === "ELEC_MOUNT_TV_EXISTING_LOCATION" && proposal.hoursPerUnit === 1.25 && proposal.source === "DIRECT"), "a selected single-operation TV specialty answer becomes a direct review row");
ok(targetedDirect.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_BATH_EXHAUST_FAN" && proposal.hoursPerUnit === 2 && proposal.source === "DIRECT"), "a selected single-operation bath-fan specialty answer becomes a direct review row");

const targetedComposite = buildElectricalOperationProposals([
  { scenarioKey: "surface-raceway-10ft", contractorHours: 1.5 },
]);
ok(targetedComposite.unresolvedScenarioKeys.includes("surface-raceway-10ft") && targetedComposite.proposals.length === 0, "a targeted multi-operation total stays intact instead of being divided into invented units");

console.log(`ELECTRICAL LABOR OPERATION PROPOSALS — ${checks}/${checks} checks passed`);
