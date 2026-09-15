import { applyAcceptedRouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidateAcceptance";
import { extractRouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidates";
import type { RouteAssistScanEvidenceV1 } from "../lib/visual-assist/route-assist/scanEvidence";
import { buildRouteAssistResult } from "../lib/visual-assist/route-assist/result";
import { isRouteAssistIncomplete, type RoutePoint, type RouteSegment } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

const points: RoutePoint[] = [
  { id: "A", x: 0.1, y: 0.5, imageId: "room", kind: "SOURCE" },
  { id: "W1", x: 0.5, y: 0.5, imageId: "room", kind: "WAYPOINT" },
  { id: "B", x: 0.9, y: 0.5, imageId: "room", kind: "DESTINATION" },
];
const segments: RouteSegment[] = [
  { id: "S1", fromPointId: "A", toPointId: "W1" },
  { id: "S2", fromPointId: "W1", toPointId: "B" },
];

const evidence: RouteAssistScanEvidenceV1 = {
  version: 1,
  sourcePointId: "A",
  destinationPointId: "B",
  segments: [
    {
      segmentId: "S1",
      measuredLengthFt: { value: 5.125, confidence: 0.01, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
      surface: { value: "WALL", confidence: 0.85, visibility: "CLEAR", basis: "VISIBLE_SCENE" },
    },
    {
      segmentId: "S2",
      measuredLengthFt: { value: 9.5, confidence: 0.99, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
      surface: { value: "WALL", confidence: 0.9, visibility: "CLEAR", basis: "VISIBLE_SCENE" },
    },
  ],
  transitions: [
    {
      pointId: "W1",
      physicalTurn: { value: "FLAT", confidence: 0.7, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
      obstacleContext: { value: "DOORWAY", confidence: 0.8, visibility: "CLEAR", basis: "VISIBLE_SCENE" },
    },
  ],
};

console.log("\nROUTE ASSIST SCAN ACCEPTANCE\n");

const extracted = extractRouteAssistScanCandidatesV1(points, segments, evidence);
if (!extracted.candidates) {
  console.error(extracted.problems.join("\n"));
  process.exit(1);
}

const none = applyAcceptedRouteAssistScanCandidatesV1(points, segments, extracted.candidates, {});
check("empty acceptance succeeds without inventing facts", none.ok);
if (none.ok) {
  check("empty acceptance leaves lengths unset", none.graph.segments.every((segment) => segment.estimatedLengthFt == null));
  check("empty acceptance leaves physical turns unset", none.graph.points.every((point) => point.physicalTurn == null));
}

const accepted = applyAcceptedRouteAssistScanCandidatesV1(points, segments, extracted.candidates, {
  measuredLengthSegmentIds: ["S1", "S2"],
  surfaceSegmentIds: ["S1", "S2"],
  physicalTurnPointIds: ["W1"],
  routeObstaclePointIds: ["W1"],
});
check("explicit acceptance succeeds", accepted.ok, accepted.ok ? "" : accepted.problems.join("; "));
if (accepted.ok) {
  check(
    "accepted graph receives exact per-leg lengths including low-confidence evidence the human explicitly accepted",
    accepted.graph.segments[0].estimatedLengthFt === 5.125 && accepted.graph.segments[1].estimatedLengthFt === 9.5
  );
  check("accepted graph receives reviewed surfaces", accepted.graph.segments.every((segment) => segment.surface === "WALL"));
  check("accepted graph receives reviewed physical turn", accepted.graph.points[1].physicalTurn === "FLAT");
  check("accepted doorway maps into Route Assist's existing obstacle vocabulary", accepted.graph.points[1].obstacle === "DOORWAY");

  const outcome = buildRouteAssistResult({
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points: accepted.graph.points,
    segments: accepted.graph.segments,
    drywallAccessAllowed: null,
    captureArtifacts: { imageIds: ["room"], overlayImageIds: [] },
  });
  check("accepted graph still flows through the existing Route Assist result builder", !isRouteAssistIncomplete(outcome));
  if (!isRouteAssistIncomplete(outcome)) {
    // Evidence preserves the exact 5.125 / 9.5 legs. The current Phase-1
    // Route Assist aggregate intentionally remains one decimal (geometry.ts),
    // so do not silently change canonical precision from this proof. The
    // separate fractional-transport verifier proves downstream plumbing can
    // carry 14.625 once the explicit precision/schema gate is opened.
    check(
      "current result aggregation remains at its established tenth-foot precision",
      outcome.estimatedTotalRouteLengthFt === 14.6,
      String(outcome.estimatedTotalRouteLengthFt)
    );
  }
}

const beforeSegments = JSON.stringify(segments);
const unavailable = applyAcceptedRouteAssistScanCandidatesV1(points, segments, extracted.candidates, {
  measuredLengthSegmentIds: ["S1", "NOT_A_SEGMENT"],
});
check("requesting an unavailable candidate fails atomically", !unavailable.ok);
check("failed acceptance did not mutate the original route", JSON.stringify(segments) === beforeSegments);

const largeOpeningEvidence: RouteAssistScanEvidenceV1 = {
  ...evidence,
  transitions: [
    {
      pointId: "W1",
      obstacleContext: { value: "LARGE_OPENING", confidence: 0.9, visibility: "CLEAR", basis: "VISIBLE_SCENE" },
    },
  ],
};
const largeOpeningCandidates = extractRouteAssistScanCandidatesV1(points, segments, largeOpeningEvidence).candidates;
if (!largeOpeningCandidates) throw new Error("large-opening fixture should be coherent evidence");
const largeOpeningAcceptance = applyAcceptedRouteAssistScanCandidatesV1(points, segments, largeOpeningCandidates, {
  routeObstaclePointIds: ["W1"],
});
check(
  "scan-only LARGE_OPENING cannot be smuggled into the narrower Route Assist graph taxonomy",
  !largeOpeningAcceptance.ok && largeOpeningAcceptance.problems.some((problem) => problem.includes("no Route Assist graph mapping")),
  largeOpeningAcceptance.ok ? "unexpected success" : largeOpeningAcceptance.problems.join("; ")
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
