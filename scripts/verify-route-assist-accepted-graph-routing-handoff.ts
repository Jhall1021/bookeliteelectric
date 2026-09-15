import assert from "node:assert/strict";
import { adaptRouteAssistResult } from "../lib/electrical/routeAssistAdapter";
import { applyConfirmation } from "../lib/visual-assist/route-assist/confirmation";
import { buildRouteAssistResult } from "../lib/visual-assist/route-assist/result";
import {
  applyAcceptedRouteAssistScanCandidatesV1,
  type RouteAssistScanCandidateAcceptanceV1,
} from "../lib/visual-assist/route-assist/scanCandidateAcceptance";
import { extractRouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidates";
import type { RouteAssistScanEvidenceV1 } from "../lib/visual-assist/route-assist/scanEvidence";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

const basePoints: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.6, imageId: "frame-0" },
  { id: "door-turn", kind: "WAYPOINT", x: 0.5, y: 0.3, imageId: "frame-1" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.6, imageId: "frame-2" },
];
const baseSegments: RouteSegment[] = [
  { id: "segment-a", fromPointId: "source", toPointId: "door-turn" },
  { id: "segment-b", fromPointId: "door-turn", toPointId: "destination" },
];
const evidence: RouteAssistScanEvidenceV1 = {
  version: 1,
  sourcePointId: "source",
  destinationPointId: "destination",
  segments: [
    { segmentId: "segment-a", measuredLengthFt: { value: 8.25, confidence: 0.96, visibility: "CLEAR", basis: "WORLD_GEOMETRY" }, surface: { value: "WALL", confidence: 0.98, visibility: "CLEAR", basis: "WORLD_GEOMETRY" } },
    { segmentId: "segment-b", measuredLengthFt: { value: 6.75, confidence: 0.97, visibility: "CLEAR", basis: "WORLD_GEOMETRY" }, surface: { value: "WALL", confidence: 0.98, visibility: "CLEAR", basis: "WORLD_GEOMETRY" } },
  ],
  transitions: [
    { pointId: "door-turn", physicalTurn: { value: "INSIDE", confidence: 0.95, visibility: "CLEAR", basis: "WORLD_GEOMETRY" }, obstacleContext: { value: "DOORWAY", confidence: 0.93, visibility: "CLEAR", basis: "VISIBLE_SCENE" } },
  ],
};

const extracted = extractRouteAssistScanCandidatesV1(basePoints, baseSegments, evidence);
assert.ok(extracted.candidates, extracted.problems.join("; "));
const candidates = extracted.candidates;

function accept(points: RoutePoint[], segments: RouteSegment[], acceptance: RouteAssistScanCandidateAcceptanceV1) {
  const result = applyAcceptedRouteAssistScanCandidatesV1(points, segments, candidates, acceptance);
  if (!result.ok) throw new Error(result.problems.join("; "));
  return result.graph;
}

const measured = accept(basePoints, baseSegments, { measuredLengthSegmentIds: ["segment-a", "segment-b"] });
const physical = accept(measured.points, measured.segments, { surfaceSegmentIds: ["segment-a", "segment-b"], physicalTurnPointIds: ["door-turn"] });
const obstacle = accept(physical.points, physical.segments, { routeObstaclePointIds: ["door-turn"] });

const outcome = buildRouteAssistResult({
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  points: obstacle.points,
  segments: obstacle.segments,
  drywallAccessAllowed: null,
  captureArtifacts: { imageIds: ["frame-0", "frame-1", "frame-2"], overlayImageIds: [] },
  customerNotes: null,
});
assert.equal("reason" in outcome, false);
if ("reason" in outcome) throw new Error(outcome.reason);
const confirmed = applyConfirmation(outcome, "ACCEPTED");
const adapted = adaptRouteAssistResult(confirmed);

check("accepted world-geometry lengths survive the normal RouteAssistResult builder", () => {
  assert.equal(confirmed.estimatedTotalRouteLengthFt, 15);
  assert.deepEqual(confirmed.segments.map((segment) => segment.estimatedLengthFt), [8.25, 6.75]);
});
check("reviewed physical turn reaches Routing V2 only through ordered geometry", () => {
  assert.equal(adapted.mapped.insideCorners, 1);
  assert.equal(adapted.mapped.outsideCorners, 0);
  assert.equal(adapted.mapped.flatCorners, 0);
});
check("reviewed doorway remains obstacle context and cannot manufacture a turn", () => {
  assert.equal(confirmed.doorwayBypassesCount, 1);
  assert.equal(confirmed.points.find((point) => point.id === "door-turn")?.obstacle, "DOORWAY");
  assert.equal(confirmed.points.find((point) => point.id === "door-turn")?.physicalTurn, "INSIDE");
});
check("confirmed accepted graph reaches existing Routing V2 adapter as physical facts", () => {
  assert.equal(adapted.invalid.length, 0);
  assert.equal(adapted.mapped.installMethod, "surface");
  assert.equal(adapted.mapped.routeLengthFt, 15);
  assert.equal(adapted.mapped.customerConfirmedRoute, true);
  assert.equal(adapted.mapped.needsContractorReview, false);
});
check("handoff creates no material, labor or pricing output", () => {
  const serialized = JSON.stringify({ confirmed, adapted }).toLowerCase();
  for (const forbidden of ["pricecents", "laborhours", "materialtakeoff", "unitcost", "markup"]) assert.equal(serialized.includes(forbidden), false);
});

console.log(`Route Assist accepted graph -> Routing V2 verification: ${passed} passed, 0 failed.`);
