import assert from "node:assert/strict";
import { adaptRouteAssistResult } from "../lib/electrical/routeAssistAdapter";
import { finalizeAcceptedScanRouteV1 } from "../lib/visual-assist/route-assist/finalizeAcceptedScanRoute";
import { applyAcceptedRouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidateAcceptance";
import type { RouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidates";
import { isRouteAssistIncomplete, type RoutePoint, type RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed += 1; console.log(`✓ ${name}`); };

const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.6, imageId: "frame-0" },
  { id: "door", kind: "WAYPOINT", x: 0.5, y: 0.4, imageId: "frame-1" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.6, imageId: "frame-2" },
];
const segments: RouteSegment[] = [
  { id: "segment-a", fromPointId: "source", toPointId: "door" },
  { id: "segment-b", fromPointId: "door", toPointId: "destination" },
];

const candidates: RouteAssistScanCandidatesV1 = {
  version: 1,
  sourcePointId: "source",
  destinationPointId: "destination",
  segments: [
    {
      segmentId: "segment-a",
      measuredLengthFt: { value: 8.25, confidence: 0.97, basis: "WORLD_GEOMETRY" },
      surface: { value: "WALL", confidence: 0.96, basis: "WORLD_GEOMETRY" },
      surfacePlaneId: { value: "wall-a", confidence: 0.96, basis: "WORLD_GEOMETRY" },
      orientation: { value: "HORIZONTAL", confidence: 0.94, basis: "WORLD_GEOMETRY" },
    },
    {
      segmentId: "segment-b",
      measuredLengthFt: { value: 6.5, confidence: 0.95, basis: "WORLD_GEOMETRY" },
      surface: { value: "WALL", confidence: 0.95, basis: "WORLD_GEOMETRY" },
      surfacePlaneId: { value: "wall-b", confidence: 0.95, basis: "WORLD_GEOMETRY" },
      orientation: { value: "HORIZONTAL", confidence: 0.93, basis: "WORLD_GEOMETRY" },
    },
  ],
  transitions: [
    {
      pointId: "door",
      physicalTurn: { value: "INSIDE", confidence: 0.94, basis: "WORLD_GEOMETRY" },
      obstacleContext: { value: "DOORWAY", confidence: 0.92, basis: "VISIBLE_SCENE" },
    },
  ],
  completeMeasuredRouteLength: {
    valueFt: 14.75,
    segments: [
      { segmentId: "segment-a", valueFt: 8.25, confidence: 0.97 },
      { segmentId: "segment-b", valueFt: 6.5, confidence: 0.95 },
    ],
  },
};

const accepted = applyAcceptedRouteAssistScanCandidatesV1(points, segments, candidates, {
  measuredLengthSegmentIds: ["segment-a", "segment-b"],
  surfaceSegmentIds: ["segment-a", "segment-b"],
  physicalTurnPointIds: ["door"],
  routeObstaclePointIds: ["door"],
});
assert.equal(accepted.ok, true, accepted.ok ? undefined : accepted.problems.join("; "));
if (!accepted.ok) throw new Error("accepted graph fixture failed");

const finalized = finalizeAcceptedScanRouteV1({
  graph: accepted.graph,
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  drywallAccessAllowed: null,
  captureArtifacts: { imageIds: ["frame-0", "frame-1", "frame-2"], overlayImageIds: ["overlay-1"] },
  routeReviewDecision: "ACCEPTED",
});
assert.equal(isRouteAssistIncomplete(finalized), false);
if (isRouteAssistIncomplete(finalized)) throw new Error(finalized.reason);

check("accepted measured segments are rebuilt through the normal RouteAssistResult path", () => {
  assert.equal(finalized.estimatedTotalRouteLengthFt, 14.75);
  assert.deepEqual(finalized.segments.map((segment) => segment.estimatedLengthFt), [8.25, 6.5]);
});

check("accepted physical turn and obstacle remain independent facts on the Route Assist graph", () => {
  const waypoint = finalized.points.find((point) => point.id === "door");
  assert.equal(waypoint?.physicalTurn, "INSIDE");
  assert.equal(waypoint?.obstacle, "DOORWAY");
  assert.equal(finalized.doorwayBypassesCount, 1);
});

check("whole-route confirmation is still required after scan fact acceptance", () => {
  assert.equal(finalized.customerConfirmedRoute, true);
  assert.equal(finalized.needsContractorReview, false);
});

const adapted = adaptRouteAssistResult(finalized);
check("existing electrical adapter receives exact measured footage without a camera-specific quantity path", () => {
  assert.equal(adapted.mapped.installMethod, "surface");
  assert.equal(adapted.mapped.routeLengthFt, 14.75);
});

check("existing ordered-geometry adapter receives the accepted physical turn", () => {
  assert.equal(adapted.mapped.insideCorners, 1);
  assert.equal(adapted.mapped.outsideCorners, 0);
  assert.equal(adapted.mapped.flatCorners, 0);
});

check("doorway context remains explicitly unmapped rather than becoming a fitting or quantity", () => {
  assert.ok(adapted.unmapped.some((field) => field.field === "doorwayBypassesCount"));
  assert.equal(JSON.stringify(adapted.mapped).toLowerCase().includes("door"), false);
});

check("finalized path emits no material, labor, cost or price authority", () => {
  const serialized = JSON.stringify({ finalized, adapted: adapted.mapped }).toLowerCase();
  for (const forbidden of ["material", "labor", "price", "cost", "cents"]) assert.equal(serialized.includes(forbidden), false);
});

const adjusted = finalizeAcceptedScanRouteV1({
  graph: accepted.graph,
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  drywallAccessAllowed: null,
  captureArtifacts: { imageIds: ["frame-0", "frame-1", "frame-2"], overlayImageIds: [] },
  routeReviewDecision: "ADJUSTED",
});
assert.equal(isRouteAssistIncomplete(adjusted), false);
if (!isRouteAssistIncomplete(adjusted)) {
  check("an adjusted route cannot auto-answer through the existing adapter", () => {
    const adjustedFacts = adaptRouteAssistResult(adjusted).mapped;
    assert.equal(adjusted.customerConfirmedRoute, false);
    assert.equal(adjusted.needsContractorReview, true);
    assert.equal(adjustedFacts.customerConfirmedRoute, false);
    assert.equal(adjustedFacts.needsContractorReview, true);
  });
}

console.log(`Route Assist accepted graph -> Routing V2 verification: ${passed} passed, 0 failed.`);
