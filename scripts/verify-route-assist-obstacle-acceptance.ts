import assert from "node:assert/strict";
import { buildRouteAssistReviewedObstacleAcceptancePlanV1 } from "../lib/visual-assist/route-assist/reviewAcceptancePlan";
import { applyAcceptedRouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidateAcceptance";
import type { RouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidates";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "graph" },
  { id: "door", kind: "WAYPOINT", x: 0.5, y: 0.5, imageId: "graph" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "graph" },
];
const segments: RouteSegment[] = [
  { id: "seg-a", fromPointId: "source", toPointId: "door" },
  { id: "seg-b", fromPointId: "door", toPointId: "destination" },
];

function candidates(obstacle: "DOORWAY" | "WINDOW" | "LARGE_OPENING"): RouteAssistScanCandidatesV1 {
  return {
    version: 1,
    sourcePointId: "source",
    destinationPointId: "destination",
    segments: [
      { segmentId: "seg-a", measuredLengthFt: null, surface: null, surfacePlaneId: null, orientation: null },
      { segmentId: "seg-b", measuredLengthFt: null, surface: null, surfacePlaneId: null, orientation: null },
    ],
    transitions: [{
      pointId: "door",
      physicalTurn: { value: "INSIDE", confidence: 0.85, basis: "WORLD_GEOMETRY" },
      obstacleContext: { value: obstacle, confidence: 0.95, basis: "VISIBLE_SCENE" },
    }],
    completeMeasuredRouteLength: null,
  };
}

check("explicit obstacle review is required", () => {
  const plan = buildRouteAssistReviewedObstacleAcceptancePlanV1({ candidates: candidates("DOORWAY"), reviewDecision: "NOT_ACCEPTED", reviewedObstaclePointIds: ["door"] });
  assert.equal(plan.status, "NOT_READY");
  assert.equal(plan.acceptance, null);
});

check("reviewed doorway produces obstacle-only acceptance request", () => {
  const plan = buildRouteAssistReviewedObstacleAcceptancePlanV1({ candidates: candidates("DOORWAY"), reviewDecision: "ACCEPTED", reviewedObstaclePointIds: ["door"] });
  assert.equal(plan.status, "READY_FOR_EXPLICIT_SCAN_CANDIDATE_ACCEPTANCE");
  assert.deepEqual(plan.acceptance?.routeObstaclePointIds, ["door"]);
  assert.deepEqual(plan.acceptance?.physicalTurnPointIds, []);
  assert.deepEqual(plan.acceptance?.surfaceSegmentIds, []);
  assert.deepEqual(plan.acceptance?.measuredLengthSegmentIds, []);
});

check("unmapped visible obstacle remains evidence-only", () => {
  const plan = buildRouteAssistReviewedObstacleAcceptancePlanV1({ candidates: candidates("LARGE_OPENING"), reviewDecision: "ACCEPTED", reviewedObstaclePointIds: ["door"] });
  assert.equal(plan.status, "NOT_READY");
  assert.ok(plan.reasons.some((reason) => reason.includes("no current Route Assist graph mapping")));
});

check("accepted doorway applies without accepting the physical turn", () => {
  const candidateSet = candidates("DOORWAY");
  const plan = buildRouteAssistReviewedObstacleAcceptancePlanV1({ candidates: candidateSet, reviewDecision: "ACCEPTED", reviewedObstaclePointIds: ["door"] });
  assert.ok(plan.acceptance);
  const applied = applyAcceptedRouteAssistScanCandidatesV1(points, segments, candidateSet, plan.acceptance);
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  const door = applied.graph.points.find((point) => point.id === "door");
  assert.equal(door?.obstacle, "DOORWAY");
  assert.equal(door?.physicalTurn, undefined);
  assert.deepEqual(applied.graph.applied.physicalTurnPointIds, []);
});

check("obstacle plan contains no metric, pricing, material or labor output", () => {
  const plan = buildRouteAssistReviewedObstacleAcceptancePlanV1({ candidates: candidates("WINDOW"), reviewDecision: "ACCEPTED", reviewedObstaclePointIds: ["door"] });
  const serialized = JSON.stringify(plan).toLowerCase();
  for (const forbidden of ["lengthft", "surface_route_ft", "price", "cost", "labor", "materialtakeoff"]) assert.equal(serialized.includes(forbidden), false);
});

console.log(`Route Assist obstacle acceptance verification: ${passed} passed, 0 failed.`);
