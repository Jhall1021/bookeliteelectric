import assert from "node:assert/strict";
import { buildRouteAssistReviewedPhysicalFactAcceptancePlanV1 } from "../lib/visual-assist/route-assist/reviewAcceptancePlan";
import { applyAcceptedRouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidateAcceptance";
import type { RouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidates";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "graph" },
  { id: "corner", kind: "WAYPOINT", x: 0.5, y: 0.5, imageId: "graph" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "graph" },
];
const segments: RouteSegment[] = [
  { id: "seg-a", fromPointId: "source", toPointId: "corner" },
  { id: "seg-b", fromPointId: "corner", toPointId: "destination" },
];

function candidates(surfaceBasis: "WORLD_GEOMETRY" | "VISIBLE_SCENE"): RouteAssistScanCandidatesV1 {
  return {
    version: 1,
    sourcePointId: "source",
    destinationPointId: "destination",
    segments: [
      {
        segmentId: "seg-a",
        measuredLengthFt: null,
        surface: { value: "WALL", confidence: 0.91, basis: surfaceBasis },
        surfacePlaneId: surfaceBasis === "WORLD_GEOMETRY" ? { value: "wall-1", confidence: 0.91, basis: "WORLD_GEOMETRY" } : null,
        orientation: null,
      },
      {
        segmentId: "seg-b",
        measuredLengthFt: null,
        surface: { value: "WALL", confidence: 0.89, basis: "WORLD_GEOMETRY" },
        surfacePlaneId: { value: "wall-2", confidence: 0.89, basis: "WORLD_GEOMETRY" },
        orientation: null,
      },
    ],
    transitions: [
      {
        pointId: "corner",
        physicalTurn: { value: "INSIDE", confidence: 0.88, basis: "WORLD_GEOMETRY" },
        obstacleContext: { value: "DOORWAY", confidence: 0.96, basis: "VISIBLE_SCENE" },
      },
    ],
    completeMeasuredRouteLength: null,
  };
}

check("explicit review is required before physical facts can be requested", () => {
  const plan = buildRouteAssistReviewedPhysicalFactAcceptancePlanV1({
    candidates: candidates("WORLD_GEOMETRY"),
    reviewDecision: "NOT_ACCEPTED",
    reviewedSurfaceSegmentIds: ["seg-a"],
    reviewedPhysicalTurnPointIds: ["corner"],
  });
  assert.equal(plan.status, "NOT_READY");
  assert.equal(plan.acceptance, null);
});

check("world-geometry surface and turn produce a narrow acceptance request", () => {
  const plan = buildRouteAssistReviewedPhysicalFactAcceptancePlanV1({
    candidates: candidates("WORLD_GEOMETRY"),
    reviewDecision: "ACCEPTED",
    reviewedSurfaceSegmentIds: ["seg-a", "seg-b"],
    reviewedPhysicalTurnPointIds: ["corner"],
  });
  assert.equal(plan.status, "READY_FOR_EXPLICIT_SCAN_CANDIDATE_ACCEPTANCE");
  assert.deepEqual(plan.acceptance?.surfaceSegmentIds, ["seg-a", "seg-b"]);
  assert.deepEqual(plan.acceptance?.physicalTurnPointIds, ["corner"]);
  assert.deepEqual(plan.acceptance?.routeObstaclePointIds, []);
  assert.deepEqual(plan.acceptance?.measuredLengthSegmentIds, []);
});

check("visible-scene surface cannot be promoted as a physical surface", () => {
  const plan = buildRouteAssistReviewedPhysicalFactAcceptancePlanV1({
    candidates: candidates("VISIBLE_SCENE"),
    reviewDecision: "ACCEPTED",
    reviewedSurfaceSegmentIds: ["seg-a"],
  });
  assert.equal(plan.status, "NOT_READY");
  assert.ok(plan.reasons.some((reason) => reason.includes("not backed by world geometry")));
});

check("doorway obstacle context does not enter physical-turn acceptance", () => {
  const plan = buildRouteAssistReviewedPhysicalFactAcceptancePlanV1({
    candidates: candidates("WORLD_GEOMETRY"),
    reviewDecision: "ACCEPTED",
    reviewedPhysicalTurnPointIds: ["corner"],
  });
  assert.deepEqual(plan.acceptance?.routeObstaclePointIds, []);
  assert.deepEqual(plan.acceptance?.physicalTurnPointIds, ["corner"]);
});

check("approved physical facts apply through the existing atomic seam", () => {
  const candidateSet = candidates("WORLD_GEOMETRY");
  const plan = buildRouteAssistReviewedPhysicalFactAcceptancePlanV1({
    candidates: candidateSet,
    reviewDecision: "ACCEPTED",
    reviewedSurfaceSegmentIds: ["seg-a", "seg-b"],
    reviewedPhysicalTurnPointIds: ["corner"],
  });
  assert.ok(plan.acceptance);
  const applied = applyAcceptedRouteAssistScanCandidatesV1(points, segments, candidateSet, plan.acceptance);
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  assert.deepEqual(applied.graph.segments.map((segment) => segment.surface), ["WALL", "WALL"]);
  assert.equal(applied.graph.points.find((point) => point.id === "corner")?.physicalTurn, "INSIDE");
  assert.equal(applied.graph.points.find((point) => point.id === "corner")?.obstacle, undefined);
});

check("physical-fact plan carries no material, labor, pricing or Routing V2 quantities", () => {
  const plan = buildRouteAssistReviewedPhysicalFactAcceptancePlanV1({
    candidates: candidates("WORLD_GEOMETRY"),
    reviewDecision: "ACCEPTED",
    reviewedSurfaceSegmentIds: ["seg-a"],
    reviewedPhysicalTurnPointIds: ["corner"],
  });
  const serialized = JSON.stringify(plan).toLowerCase();
  for (const forbidden of ["surface_route_ft", "price", "cost", "labor", "materialtakeoff", "componentquantity"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

console.log(`Route Assist physical fact acceptance verification: ${passed} passed, 0 failed.`);
