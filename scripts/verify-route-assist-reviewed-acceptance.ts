import assert from "node:assert/strict";
import { buildRouteAssistReviewedAcceptancePlanV1 } from "../lib/visual-assist/route-assist/reviewAcceptancePlan";
import { applyAcceptedRouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidateAcceptance";
import type { RouteAssistMetricReviewV1 } from "../lib/visual-assist/route-assist/metricReview";
import type { RouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidates";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";
import type { RouteAssistVisibleTrimRouteProposalV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteProposal";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "graph" },
  { id: "waypoint", kind: "WAYPOINT", x: 0.5, y: 0.5, imageId: "graph" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "graph" },
];
const segments: RouteSegment[] = [
  { id: "seg-a", fromPointId: "source", toPointId: "waypoint" },
  { id: "seg-b", fromPointId: "waypoint", toPointId: "destination" },
];

const proposal: RouteAssistVisibleTrimRouteProposalV1 = {
  version: 1,
  status: "REVIEW_REQUIRED",
  steps: [
    { kind: "SOURCE", objectId: "source-object", imageId: "frame-0" },
    { kind: "BASEBOARD", objectId: "trim-object", imageId: "frame-1" },
    { kind: "DESTINATION", objectId: "destination-object", imageId: "frame-2" },
  ],
  trimBoundaries: ["BASEBOARD"],
  requiresHomeownerReview: true,
  problems: [],
};

const completeMetricReview: RouteAssistMetricReviewV1 = {
  version: 1,
  status: "COMPLETE_WORLD_GEOMETRY",
  segments: [
    { segmentId: "seg-a", measuredLengthFt: 10, measurementStatus: "CLEAR_WORLD_GEOMETRY" },
    { segmentId: "seg-b", measuredLengthFt: 12.5, measurementStatus: "CLEAR_WORLD_GEOMETRY" },
  ],
  measuredRouteLengthFt: 22.5,
  requiresHomeownerRouteReview: true,
  readyForCanonicalBinding: false,
};

const candidates: RouteAssistScanCandidatesV1 = {
  version: 1,
  sourcePointId: "source",
  destinationPointId: "destination",
  segments: [
    { segmentId: "seg-a", measuredLengthFt: { value: 10, confidence: 0.9, basis: "WORLD_GEOMETRY" }, surface: null, surfacePlaneId: null, orientation: null },
    { segmentId: "seg-b", measuredLengthFt: { value: 12.5, confidence: 0.8, basis: "WORLD_GEOMETRY" }, surface: null, surfacePlaneId: null, orientation: null },
  ],
  transitions: [{ pointId: "waypoint", physicalTurn: null, obstacleContext: null }],
  completeMeasuredRouteLength: {
    valueFt: 22.5,
    segments: [
      { segmentId: "seg-a", valueFt: 10, confidence: 0.9 },
      { segmentId: "seg-b", valueFt: 12.5, confidence: 0.8 },
    ],
  },
};

check("explicitly accepted reviewed route produces measured-length acceptance request", () => {
  const plan = buildRouteAssistReviewedAcceptancePlanV1({ proposal, routeReviewDecision: "ACCEPTED", metricReview: completeMetricReview, candidates });
  assert.equal(plan.status, "READY_FOR_EXPLICIT_SCAN_CANDIDATE_ACCEPTANCE");
  assert.deepEqual(plan.acceptance?.measuredLengthSegmentIds, ["seg-a", "seg-b"]);
  assert.deepEqual(plan.acceptance?.surfaceSegmentIds, []);
  assert.deepEqual(plan.acceptance?.physicalTurnPointIds, []);
  assert.deepEqual(plan.acceptance?.routeObstaclePointIds, []);
  assert.equal(plan.appliesGraphMutation, false);
});

check("adjustment request cannot produce acceptance", () => {
  const plan = buildRouteAssistReviewedAcceptancePlanV1({ proposal, routeReviewDecision: "ADJUSTMENT_REQUESTED", metricReview: completeMetricReview, candidates });
  assert.equal(plan.status, "NOT_READY");
  assert.equal(plan.acceptance, null);
});

check("recapture request cannot produce acceptance", () => {
  const plan = buildRouteAssistReviewedAcceptancePlanV1({ proposal, routeReviewDecision: "RECAPTURE_REQUESTED", metricReview: completeMetricReview, candidates });
  assert.equal(plan.status, "NOT_READY");
});

check("partial world geometry cannot produce acceptance", () => {
  const partial: RouteAssistMetricReviewV1 = {
    ...completeMetricReview,
    status: "INCOMPLETE_WORLD_GEOMETRY",
    measuredRouteLengthFt: null,
    segments: [
      completeMetricReview.segments[0],
      { segmentId: "seg-b", measuredLengthFt: null, measurementStatus: "UNRESOLVED" },
    ],
  };
  const plan = buildRouteAssistReviewedAcceptancePlanV1({ proposal, routeReviewDecision: "ACCEPTED", metricReview: partial, candidates });
  assert.equal(plan.status, "NOT_READY");
});

check("metric and candidate total mismatch fails closed", () => {
  const mismatched: RouteAssistScanCandidatesV1 = {
    ...candidates,
    completeMeasuredRouteLength: { ...candidates.completeMeasuredRouteLength!, valueFt: 22.6 },
  };
  const plan = buildRouteAssistReviewedAcceptancePlanV1({ proposal, routeReviewDecision: "ACCEPTED", metricReview: completeMetricReview, candidates: mismatched });
  assert.equal(plan.status, "NOT_READY");
  assert.ok(plan.reasons.some((reason) => reason.includes("total")));
});

check("ready plan applies atomically through existing candidate acceptance seam", () => {
  const plan = buildRouteAssistReviewedAcceptancePlanV1({ proposal, routeReviewDecision: "ACCEPTED", metricReview: completeMetricReview, candidates });
  assert.ok(plan.acceptance);
  const result = applyAcceptedRouteAssistScanCandidatesV1(points, segments, candidates, plan.acceptance);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.graph.applied.measuredLengthSegmentIds, ["seg-a", "seg-b"]);
  assert.deepEqual(result.graph.segments.map((segment) => segment.estimatedLengthFt), [10, 12.5]);
  assert.deepEqual(result.graph.applied.surfaceSegmentIds, []);
  assert.deepEqual(result.graph.applied.physicalTurnPointIds, []);
  assert.deepEqual(result.graph.applied.routeObstaclePointIds, []);
});

check("plan contains no Routing V2, pricing, labor or material output", () => {
  const plan = buildRouteAssistReviewedAcceptancePlanV1({ proposal, routeReviewDecision: "ACCEPTED", metricReview: completeMetricReview, candidates });
  const serialized = JSON.stringify(plan).toLowerCase();
  for (const forbidden of ["surface_route_ft", "concealed_route_ft", "price", "cost", "labor", "materialtakeoff", "componentquantity"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

console.log(`Route Assist reviewed acceptance verification: ${passed} passed, 0 failed.`);
