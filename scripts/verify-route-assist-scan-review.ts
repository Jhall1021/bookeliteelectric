import {
  buildRouteAssistScanAcceptanceFromReviewV1,
  buildRouteAssistScanReviewV1,
} from "../lib/visual-assist/route-assist/scanReview";
import type { RouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidates";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST SCAN REVIEW AUTHORITY BOUNDARY\n");

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

const unsupported = buildRouteAssistScanAcceptanceFromReviewV1(review, ["OBSTACLE:w-opening"]);
check("unsupported evidence cannot be promoted by review selection", !unsupported.ok, JSON.stringify(unsupported));

const unknown = buildRouteAssistScanAcceptanceFromReviewV1(review, ["MEASURED_LENGTH:not-real"]);
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
