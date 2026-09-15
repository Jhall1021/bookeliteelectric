import {
  buildRouteAssistScanAcceptanceFromReviewV1,
  buildRouteAssistScanReviewV1,
} from "../lib/visual-assist/route-assist/scanReview";
import { applyRouteAssistScanReviewSelectionV1 } from "../lib/visual-assist/route-assist/scanReviewAcceptance";
import type { RouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidates";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST SCAN REVIEW AUTHORITY BOUNDARY\n");

const points: RoutePoint[] = [
  { id: "a", x: 0.1, y: 0.5, imageId: "img-1", kind: "SOURCE" },
  { id: "w-turn", x: 0.35, y: 0.5, imageId: "img-1", kind: "WAYPOINT" },
  { id: "w-door", x: 0.6, y: 0.5, imageId: "img-1", kind: "WAYPOINT" },
  { id: "w-opening", x: 0.75, y: 0.5, imageId: "img-1", kind: "WAYPOINT" },
  { id: "b", x: 0.9, y: 0.5, imageId: "img-1", kind: "DESTINATION" },
];
const segments: RouteSegment[] = [
  { id: "s1", fromPointId: "a", toPointId: "w-turn" },
  { id: "s2", fromPointId: "w-turn", toPointId: "w-door" },
  { id: "s3", fromPointId: "w-door", toPointId: "w-opening" },
  { id: "s4", fromPointId: "w-opening", toPointId: "b" },
];

const candidates: RouteAssistScanCandidatesV1 = {
  version: 1,
  sourcePointId: "a",
  destinationPointId: "b",
  segments: [
    {
      segmentId: "s1",
      measuredLengthFt: { value: 5.125, confidence: 0.01, basis: "WORLD_GEOMETRY" },
      surface: { value: "WALL", confidence: 0.2, basis: "VISIBLE_SCENE" },
      surfacePlaneId: null,
      orientation: null,
    },
    {
      segmentId: "s2",
      measuredLengthFt: { value: 9.5, confidence: 0.02, basis: "WORLD_GEOMETRY" },
      surface: { value: "WALL", confidence: 0.3, basis: "VISIBLE_SCENE" },
      surfacePlaneId: null,
      orientation: null,
    },
    {
      segmentId: "s3",
      measuredLengthFt: null,
      surface: null,
      surfacePlaneId: null,
      orientation: null,
    },
    {
      segmentId: "s4",
      measuredLengthFt: null,
      surface: null,
      surfacePlaneId: null,
      orientation: null,
    },
  ],
  transitions: [
    {
      pointId: "w-turn",
      physicalTurn: { value: "FLAT", confidence: 0.03, basis: "WORLD_GEOMETRY" },
      obstacleContext: null,
    },
    {
      pointId: "w-door",
      physicalTurn: null,
      obstacleContext: { value: "DOORWAY", confidence: 0.6, basis: "VISIBLE_SCENE" },
    },
    {
      pointId: "w-opening",
      physicalTurn: null,
      obstacleContext: { value: "LARGE_OPENING", confidence: 0.9, basis: "VISIBLE_SCENE" },
    },
  ],
  completeMeasuredRouteLength: {
    valueFt: 14.625,
    segments: [
      { segmentId: "s1", valueFt: 5.125, confidence: 0.01 },
      { segmentId: "s2", valueFt: 9.5, confidence: 0.02 },
    ],
  },
};

const review = buildRouteAssistScanReviewV1(candidates);
check("review preserves exact complete measured length", review.completeMeasuredRouteLengthFt === 14.625, JSON.stringify(review));
check("review contains every reviewable candidate without confidence filtering", review.items.length === 7, JSON.stringify(review.items));
check("review carries an exact deterministic value fingerprint", review.fingerprint.length > 0 && review.fingerprint.includes("5.125"), review.fingerprint);
check(
  "low-confidence metric evidence remains reviewable",
  review.items.some((item) => item.id === "MEASURED_LENGTH:s1" && item.confidence === 0.01),
  JSON.stringify(review.items),
);
check(
  "mapped doorway evidence may be explicitly accepted",
  review.items.some((item) => item.id === "OBSTACLE:w-door" && item.canApplyToRouteGraph),
  JSON.stringify(review.items),
);
check(
  "large opening remains visible evidence but has no V1 graph mapping",
  review.items.some((item) => item.id === "OBSTACLE:w-opening" && !item.canApplyToRouteGraph),
  JSON.stringify(review.items),
);

const accepted = buildRouteAssistScanAcceptanceFromReviewV1(review, [
  "MEASURED_LENGTH:s1",
  "MEASURED_LENGTH:s2",
  "PHYSICAL_TURN:w-turn",
  "OBSTACLE:w-door",
]);
check("explicit review selections build an acceptance contract", accepted.ok, JSON.stringify(accepted));
if (accepted.ok) {
  check(
    "only explicitly selected measured legs are accepted",
    JSON.stringify(accepted.acceptance.measuredLengthSegmentIds) === JSON.stringify(["s1", "s2"]),
    JSON.stringify(accepted.acceptance),
  );
  check(
    "explicit physical turn and mapped obstacle retain route identities",
    accepted.acceptance.physicalTurnPointIds?.[0] === "w-turn" &&
      accepted.acceptance.routeObstaclePointIds?.[0] === "w-door",
    JSON.stringify(accepted.acceptance),
  );
}

const applied = applyRouteAssistScanReviewSelectionV1(points, segments, candidates, [
  "MEASURED_LENGTH:s1",
  "PHYSICAL_TURN:w-turn",
  "OBSTACLE:w-door",
], review.fingerprint);
check("review IDs can be applied atomically against canonical candidates", applied.ok, JSON.stringify(applied));
if (applied.ok) {
  check(
    "selected measured length uses canonical candidate value, not client-supplied value",
    applied.graph.segments.find((segment) => segment.id === "s1")?.estimatedLengthFt === 5.125,
    JSON.stringify(applied.graph.segments),
  );
  check(
    "unselected measured segment remains untouched",
    applied.graph.segments.find((segment) => segment.id === "s2")?.estimatedLengthFt == null,
    JSON.stringify(applied.graph.segments),
  );
  check(
    "selected turn and doorway map into the existing graph",
    applied.graph.points.find((point) => point.id === "w-turn")?.physicalTurn === "FLAT" &&
      applied.graph.points.find((point) => point.id === "w-door")?.obstacle === "DOORWAY",
    JSON.stringify(applied.graph.points),
  );
}
check(
  "review selection never mutates caller graph",
  segments.every((segment) => segment.estimatedLengthFt == null) &&
    points.every((point) => point.physicalTurn == null && point.obstacle == null),
  JSON.stringify({ points, segments }),
);

const changedCandidates: RouteAssistScanCandidatesV1 = {
  ...candidates,
  segments: candidates.segments.map((segment) =>
    segment.segmentId === "s1"
      ? { ...segment, measuredLengthFt: { value: 6, confidence: 0.01, basis: "WORLD_GEOMETRY" } }
      : segment,
  ),
  completeMeasuredRouteLength: {
    valueFt: 15.5,
    segments: [
      { segmentId: "s1", valueFt: 6, confidence: 0.01 },
      { segmentId: "s2", valueFt: 9.5, confidence: 0.02 },
    ],
  },
};
const stale = applyRouteAssistScanReviewSelectionV1(
  points,
  segments,
  changedCandidates,
  ["MEASURED_LENGTH:s1"],
  review.fingerprint,
);
check(
  "same route ID with a changed value invalidates the old review selection",
  !stale.ok && stale.problems.some((problem) => problem.includes("review changed")),
  JSON.stringify(stale),
);

const unsupported = applyRouteAssistScanReviewSelectionV1(
  points, segments, candidates, ["OBSTACLE:w-opening"], review.fingerprint,
);
check("unsupported evidence cannot be promoted by review selection", !unsupported.ok, JSON.stringify(unsupported));

const unknown = applyRouteAssistScanReviewSelectionV1(
  points, segments, candidates, ["MEASURED_LENGTH:not-real"], review.fingerprint,
);
check("unknown review item fails closed", !unknown.ok, JSON.stringify(unknown));

const none = buildRouteAssistScanAcceptanceFromReviewV1(review, []);
check(
  "review does not imply any automatic acceptance",
  none.ok &&
    (none.acceptance.measuredLengthSegmentIds?.length ?? 0) === 0 &&
    (none.acceptance.surfaceSegmentIds?.length ?? 0) === 0 &&
    (none.acceptance.physicalTurnPointIds?.length ?? 0) === 0 &&
    (none.acceptance.routeObstaclePointIds?.length ?? 0) === 0,
  JSON.stringify(none),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
