import { strict as assert } from "node:assert";
import { projectAccessibleRouteAssistPathFact, type AccessibleRouteAssistPathEvidenceV1 } from "../lib/electrical/accessibleRouteAssistPathFacts";
import { validateElectricalLaborScopeFacts } from "../lib/electrical/validateLaborScopeFacts";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; console.log(`  ✓ ${message}`); };
const base: AccessibleRouteAssistPathEvidenceV1 = {
  kind: "ACCESSIBLE_PATH",
  spaceType: "ATTIC",
  customerConfirmedPath: true,
  needsContractorReview: false,
  segments: [
    { id: "vertical-to-attic", measuredLengthFeet: 8.25, observationBasis: "WORLD_GEOMETRY", confidence: 0.96 },
    { id: "attic-run", measuredLengthFeet: 21.5, observationBasis: "WORLD_GEOMETRY", confidence: 0.91 },
    { id: "drop-to-box", measuredLengthFeet: 7.75, observationBasis: "WORLD_GEOMETRY", confidence: 0.94 },
  ],
};

const ready = projectAccessibleRouteAssistPathFact(base);
ok(ready.kind === "READY" && ready.accessibleRouteFeet.value === 37.5, "explicit measured attic segments produce exact accessible-path footage");
ok(ready.kind === "READY" && ready.evidenceConfidenceFloor === 0.91, "projection preserves the weakest evidence confidence");
ok(ready.kind === "READY" && ready.accessibleRouteFeet.source === "ROUTE_ASSIST_ACCESSIBLE_PATH_CONFIRMED", "projection emits the narrow accessible-path authority, not generic Route Assist authority");
ok(ready.kind === "READY" && validateElectricalLaborScopeFacts(["accessibleRouteFeet"], { accessibleRouteFeet: ready.accessibleRouteFeet }).kind === "READY", "projected fact passes the shared labor authority validator");

ok(projectAccessibleRouteAssistPathFact({ ...base, customerConfirmedPath: false }).kind === "INCOMPLETE", "unconfirmed paths fail closed");
ok(projectAccessibleRouteAssistPathFact({ ...base, needsContractorReview: true }).kind === "INCOMPLETE", "review-required paths fail closed");
ok(projectAccessibleRouteAssistPathFact({ ...base, segments: [] }).kind === "INCOMPLETE", "empty paths fail closed");
ok(projectAccessibleRouteAssistPathFact({ ...base, segments: [{ ...base.segments[0], measuredLengthFeet: 0 }] }).kind === "INCOMPLETE", "zero-length segments fail closed");
ok(projectAccessibleRouteAssistPathFact({ ...base, segments: [base.segments[0], { ...base.segments[1], id: base.segments[0].id }] }).kind === "INCOMPLETE", "duplicate segment identities fail closed");
ok(projectAccessibleRouteAssistPathFact({ ...base, segments: [{ ...base.segments[0], confidence: 1.1 }] }).kind === "INCOMPLETE", "invalid confidence fails closed");

console.log(`\nACCESSIBLE ROUTE ASSIST PATH FACTS — ${checks}/${checks} checks passed`);
