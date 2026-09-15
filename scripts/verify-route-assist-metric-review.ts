import assert from "node:assert/strict";
import { buildRouteAssistMetricReviewV1 } from "../lib/visual-assist/route-assist/metricReview";
import type { RouteAssistScanEvidenceV1 } from "../lib/visual-assist/route-assist/scanEvidence";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";
import type { RouteAssistVisibleTrimRouteProposalV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteProposal";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "frame-0" },
  { id: "waypoint", kind: "WAYPOINT", x: 0.5, y: 0.5, imageId: "frame-1" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "frame-2" },
];
const segments: RouteSegment[] = [
  { id: "segment-a", fromPointId: "source", toPointId: "waypoint" },
  { id: "segment-b", fromPointId: "waypoint", toPointId: "destination" },
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

function evidence(lengthA: number | null, lengthB: number | null, basisB: "WORLD_GEOMETRY" | "VISIBLE_SCENE" = "WORLD_GEOMETRY"): RouteAssistScanEvidenceV1 {
  return {
    version: 1,
    sourcePointId: "source",
    destinationPointId: "destination",
    segments: [
      {
        segmentId: "segment-a",
        measuredLengthFt: { value: lengthA, confidence: 0.92, visibility: lengthA === null ? "UNCLEAR" : "CLEAR", basis: "WORLD_GEOMETRY" },
      },
      {
        segmentId: "segment-b",
        measuredLengthFt: { value: lengthB, confidence: 0.99, visibility: lengthB === null ? "UNCLEAR" : "CLEAR", basis: basisB },
      },
    ],
    transitions: [],
  };
}

check("complete clear world geometry produces one shared measured route total", () => {
  const result = buildRouteAssistMetricReviewV1({ proposal, points, segments, scanEvidence: evidence(10, 12.5) });
  assert.ok(result);
  assert.equal(result.status, "COMPLETE_WORLD_GEOMETRY");
  assert.equal(result.measuredRouteLengthFt, 22.5);
  assert.deepEqual(result.segments.map((segment) => segment.measuredLengthFt), [10, 12.5]);
});

check("partial world geometry never estimates the missing route leg or total", () => {
  const result = buildRouteAssistMetricReviewV1({ proposal, points, segments, scanEvidence: evidence(10, null) });
  assert.ok(result);
  assert.equal(result.status, "INCOMPLETE_WORLD_GEOMETRY");
  assert.equal(result.measuredRouteLengthFt, null);
  assert.equal(result.segments[1].measurementStatus, "UNRESOLVED");
  assert.equal(result.segments[1].measuredLengthFt, null);
});

check("visible-scene length cannot masquerade as metric measurement", () => {
  const result = buildRouteAssistMetricReviewV1({ proposal, points, segments, scanEvidence: evidence(10, 12.5, "VISIBLE_SCENE") });
  assert.equal(result, null);
});

check("metric review cannot be produced before a reviewable visible proposal exists", () => {
  const unresolved: RouteAssistVisibleTrimRouteProposalV1 = { ...proposal, status: "INSUFFICIENT_VISIBLE_EVIDENCE", problems: ["not enough visible evidence"] };
  assert.equal(buildRouteAssistMetricReviewV1({ proposal: unresolved, points, segments, scanEvidence: evidence(10, 12.5) }), null);
});

check("metric review never marks itself ready for canonical binding", () => {
  const result = buildRouteAssistMetricReviewV1({ proposal, points, segments, scanEvidence: evidence(10, 12.5) });
  assert.ok(result);
  assert.equal(result.requiresHomeownerRouteReview, true);
  assert.equal(result.readyForCanonicalBinding, false);
});

check("metric review contract contains no pricing, material, labor or pixel inference authority", () => {
  const result = buildRouteAssistMetricReviewV1({ proposal, points, segments, scanEvidence: evidence(10, 12.5) });
  assert.ok(result);
  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["price", "cost", "material", "labor", "pixel", "fitting"]) assert.equal(serialized.includes(forbidden), false);
});

console.log(`Route Assist metric review verification: ${passed} passed, 0 failed.`);
