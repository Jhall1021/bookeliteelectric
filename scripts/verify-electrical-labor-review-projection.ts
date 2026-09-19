import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS as operations, ELECTRICAL_ATOMIC_LABOR_RECIPES as recipes } from "../lib/electrical/atomicLabor";
import { buildServiceLaborReviewQueue, projectLaborRecipe, type LaborDecision } from "../lib/electrical/laborReviewProjection";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const direct = (keys: string[], hours = 0.25): LaborDecision[] => keys.map((operationKey) => ({ operationKey, hoursPerUnit: hours, source: "DIRECT" }));

const replacement = recipes.find((recipe) => recipe.key === "ELECTRICAL_REPLACE_STANDARD_RECEPTACLE")!;
const replacementReady = projectLaborRecipe(replacement, {}, direct(["ELEC_REPLACE_STANDARD_RECEPTACLE"]));
ok(replacementReady.kind === "READY_FOR_SERVICE_REVIEW" && replacementReady.suggestedHours === 0.25, "direct atomic labor produces a service-duration suggestion");
ok(replacementReady.kind === "READY_FOR_SERVICE_REVIEW" && replacementReady.requiresServiceApproval && !replacementReady.canPublish, "even direct operation labor cannot publish a derived service duration");

const proposedOnly = projectLaborRecipe(replacement, {}, [{ operationKey: "ELEC_REPLACE_STANDARD_RECEPTACLE", hoursPerUnit: 0.2, source: "UNAPPROVED_PROPOSAL" }]);
ok(proposedOnly.kind === "BLOCKED" && proposedOnly.pendingProposalOperations.includes("ELEC_REPLACE_STANDARD_RECEPTACLE") && proposedOnly.missingOperations.length === 0, "unapproved labor is identified as a pending proposal, not ordinary missing data");

const newOutlet = recipes.find((recipe) => recipe.key === "ELECTRICAL_NEW_120V_RECEPTACLE")!;
const allDirect = direct(operations.map((operation) => operation.key), 0.1);
const missingFacts = projectLaborRecipe(newOutlet, { accessibleRoute: true, finishedRoute: false }, allDirect);
ok(missingFacts.kind === "BLOCKED" && missingFacts.missingQuantities.includes("ELEC_NM_CABLE_ACCESSIBLE") && missingFacts.missingQuantities.includes("ELEC_DRILL_FRAMING_CROSSING"), "review projection distinguishes missing physical quantities from missing labor");
const outletFacts = { accessibleRoute: true, finishedRoute: false, accessibleRouteFeet: 20, concealedRouteFeet: 0, perpendicularFramingFeet: 0, framingSpacingInches: 16 };
const approvedProposal = allDirect.map((decision) => decision.operationKey === "ELEC_INSTALL_NEW_RECEPTACLE" ? { ...decision, source: "APPROVED_PROPOSAL" as const } : decision);
const outletReady = projectLaborRecipe(newOutlet, outletFacts, approvedProposal);
ok(outletReady.kind === "READY_FOR_SERVICE_REVIEW" && outletReady.lines.some((line) => line.operationKey === "ELEC_INSTALL_NEW_RECEPTACLE" && line.source === "APPROVED_PROPOSAL"), "contractor-approved proposals may contribute while retaining provenance");

const queue = buildServiceLaborReviewQueue(
  [replacement, newOutlet],
  new Set(["replace-standard-outlet", "new-120v-outlet", "not-present"]),
  { ELECTRICAL_NEW_120V_RECEPTACLE: outletFacts },
  approvedProposal,
);
ok(queue.length === 2 && queue.map((item) => item.serviceSlug).join(",") === "new-120v-outlet,replace-standard-outlet", "queue contains only real service targets and is deterministic");
ok(queue.every((item) => item.projection.canPublish === false), "nothing in the review queue carries publication authority");
assert.throws(() => projectLaborRecipe(replacement, {}, [...direct(["ELEC_REPLACE_STANDARD_RECEPTACLE"]), ...direct(["ELEC_REPLACE_STANDARD_RECEPTACLE"], 0.5)]), /duplicate labor decision/);
checks += 1;
assert.throws(() => projectLaborRecipe(replacement, {}, direct(["ELEC_REPLACE_STANDARD_RECEPTACLE"], -0.25)), /invalid labor hours/);
checks += 1;

console.log(`\nELECTRICAL LABOR REVIEW PROJECTION — ${checks}/${checks} checks passed`);
