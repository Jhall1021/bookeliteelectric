import assert from "node:assert/strict";
import { buildElectricalOperationProposals, ELECTRICAL_BOOK_DELTA_RELATIONSHIPS } from "../lib/electrical/laborOperationProposals";
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
ok(direct.some((proposal) => proposal.operationKey === "ELEC_INSTALL_NEW_CEILING_FAN"), "prepared-box ceiling-fan installation is direct");
ok(direct.some((proposal) => proposal.operationKey === "ELEC_INSTALL_NEW_CEILING_LIGHT"), "prepared-box pendant or simple chandelier installation is direct");
ok(result.unresolvedScenarioKeys.length === 0, "the four concrete onboarding jobs each map to one bounded operation");
ok(!direct.some((proposal) => proposal.operationKey === "ELEC_MOUNT_LOADCENTER"), "panel answer does not fabricate a loadcenter unit");
const answeredKeys = new Set(midpointAnswers.map((answer) => answer.scenarioKey));
const activeDeltaCount = ELECTRICAL_BOOK_DELTA_RELATIONSHIPS.filter((relationship) => answeredKeys.has(relationship.anchorScenarioKey)).length;
ok(inferred.length === activeDeltaCount, "the four concrete answers adjust only their reviewed same-family relationships; unrelated work keeps its platform baseline");
ok(inferred.every((proposal) => proposal.requiresExplicitApproval && !proposal.canPublish), "every relationship proposal requires approval and cannot publish");
ok(result.canPublish === false, "proposal set has no publish authority");

const deviceAnchor = buildElectricalOperationProposals([{ scenarioKey: "replace-standard-receptacle", contractorHours: 0.25 }]);
ok(deviceAnchor.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_STANDARD_SWITCH" && Math.abs(proposal.hoursPerUnit - 0.25) < 1e-9), "equal published device units preserve the contractor's 15-minute anchor");
ok(deviceAnchor.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_GFCI_RECEPTACLE" && Math.abs(proposal.hoursPerUnit - 0.35) < 1e-9), "GFCI proposal preserves the book's six-minute increment over the contractor anchor");
ok(deviceAnchor.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_LED_DIMMER" && Math.abs(proposal.hoursPerUnit - 0.29) < 1e-9), "dimmer proposal preserves only its reviewed same-family published delta");
ok(deviceAnchor.proposals.filter((proposal) => proposal.source === "APPROVED_PROPOSAL").every((proposal) => proposal.basis.scenarioKeys.length === 1 && proposal.basis.note.includes("Preserves the published same-family delta")), "book-delta proposals cite the direct contractor anchor and their published relationship");
const lightingAnchor = buildElectricalOperationProposals([{ scenarioKey: "replace-interior-light", contractorHours: 0.5 }]);
ok(lightingAnchor.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_EXTERIOR_LIGHT_FIXTURE" && Math.abs(proposal.hoursPerUnit - 0.5) < 1e-9), "simple exterior fixture suggestion preserves the equal published unit");
ok(lightingAnchor.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_MOTION_FLOOD_FIXTURE" && Math.abs(proposal.hoursPerUnit - 1) < 1e-9), "motion/flood suggestion preserves the published 30-minute family increment");
const breakerAnchor = buildElectricalOperationProposals([{ scenarioKey: "single-pole-breaker-swap", contractorHours: 0.4 }]);
ok(breakerAnchor.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_DOUBLE_POLE_BREAKER" && Math.abs(proposal.hoursPerUnit - 0.4) < 1e-9), "double-pole breaker suggestion preserves the equal same-source published unit");

const mixed = buildElectricalOperationProposals(midpointAnswers.map((answer, index) => ({ ...answer, contractorHours: answer.contractorHours * (index % 2 ? 3 : 0.3) })));
ok(mixed.proposals.filter((proposal) => proposal.basis.note.startsWith("Published atomic reference")).length === 0, "mixed contractor pattern suppresses global reference scaling while retaining bounded same-family deltas");

const existing = buildElectricalOperationProposals(midpointAnswers, new Set(["ELEC_REPLACE_STANDARD_RECEPTACLE"]));
ok(!existing.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_STANDARD_RECEPTACLE"), "existing approved operation is never overwritten by a proposal");

const targetedDirect = buildElectricalOperationProposals([
  { scenarioKey: "tv-mount-prepared", contractorHours: 1.25 },
  { scenarioKey: "bath-fan-clean-swap", contractorHours: 2 },
  { scenarioKey: "exterior-wall-penetration", contractorHours: 0.4 },
  { scenarioKey: "weatherproof-receptacle-box", contractorHours: 0.5 },
]);
ok(targetedDirect.proposals.some((proposal) => proposal.operationKey === "ELEC_MOUNT_TV_EXISTING_LOCATION" && proposal.hoursPerUnit === 1.25 && proposal.source === "DIRECT"), "a selected single-operation TV specialty answer becomes a direct review row");
ok(targetedDirect.proposals.some((proposal) => proposal.operationKey === "ELEC_REPLACE_BATH_EXHAUST_FAN" && proposal.hoursPerUnit === 2 && proposal.source === "DIRECT"), "a selected single-operation bath-fan specialty answer becomes a direct review row");
ok(targetedDirect.proposals.some((proposal) => proposal.operationKey === "ELEC_PENETRATE_EXTERIOR_WALL" && proposal.hoursPerUnit === 0.4 && proposal.source === "DIRECT"), "the exterior-wall answer becomes its own direct atomic review row");
ok(targetedDirect.proposals.some((proposal) => proposal.operationKey === "ELEC_INSTALL_WEATHERPROOF_RECEPTACLE_BOX" && proposal.hoursPerUnit === 0.5 && proposal.source === "DIRECT"), "the weatherproof-box answer becomes its own direct atomic review row");

const targetedComposite = buildElectricalOperationProposals([
  { scenarioKey: "surface-raceway-10ft", contractorHours: 1.5 },
]);
ok(targetedComposite.unresolvedScenarioKeys.includes("surface-raceway-10ft") && targetedComposite.proposals.length === 0, "a targeted multi-operation total stays intact instead of being divided into invented units");

console.log(`ELECTRICAL LABOR OPERATION PROPOSALS — ${checks}/${checks} checks passed`);
