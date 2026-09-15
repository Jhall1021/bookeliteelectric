import { extractRouteAssistScanCandidatesV1 } from "../lib/visual-assist/route-assist/scanCandidates";
import type { RouteAssistScanEvidenceV1 } from "../lib/visual-assist/route-assist/scanEvidence";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

const points: RoutePoint[] = [
  { id: "A", x: 0.1, y: 0.5, imageId: "room", kind: "SOURCE", surface: "WALL" },
  { id: "W1", x: 0.5, y: 0.5, imageId: "room", kind: "WAYPOINT", surface: "WALL" },
  { id: "B", x: 0.9, y: 0.5, imageId: "room", kind: "DESTINATION", surface: "WALL" },
];
const segments: RouteSegment[] = [
  { id: "S1", fromPointId: "A", toPointId: "W1", surface: "WALL" },
  { id: "S2", fromPointId: "W1", toPointId: "B", surface: "WALL" },
];

function evidence(over: Partial<RouteAssistScanEvidenceV1> = {}): RouteAssistScanEvidenceV1 {
  return {
    version: 1,
    sourcePointId: "A",
    destinationPointId: "B",
    segments: [
      {
        segmentId: "S1",
        measuredLengthFt: { value: 5.125, confidence: 0.01, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
        surface: { value: "WALL", confidence: 0.8, visibility: "CLEAR", basis: "VISIBLE_SCENE" },
        surfacePlaneId: { value: "wall-1", confidence: 0.6, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
        orientation: { value: "HORIZONTAL", confidence: 0.7, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
      },
      {
        segmentId: "S2",
        measuredLengthFt: { value: 9.5, confidence: 0.99, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
        surface: { value: "WALL", confidence: 0.9, visibility: "CLEAR", basis: "VISIBLE_SCENE" },
        surfacePlaneId: { value: "wall-1", confidence: 0.9, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
        orientation: { value: "HORIZONTAL", confidence: 0.9, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
      },
    ],
    transitions: [
      {
        pointId: "W1",
        physicalTurn: { value: "FLAT", confidence: 0.55, visibility: "CLEAR", basis: "WORLD_GEOMETRY" },
        obstacleContext: { value: "DOORWAY", confidence: 0.8, visibility: "CLEAR", basis: "VISIBLE_SCENE" },
      },
    ],
    ...over,
  };
}

console.log("\nROUTE ASSIST SCAN CANDIDATES\n");

const full = extractRouteAssistScanCandidatesV1(points, segments, evidence());
check("coherent evidence produces candidates", !!full.candidates, full.problems.join("; "));
check(
  "complete world-geometry legs preserve the exact 14.625 ft aggregate",
  full.candidates?.completeMeasuredRouteLength?.valueFt === 14.625,
  String(full.candidates?.completeMeasuredRouteLength?.valueFt)
);
check(
  "provider confidence is preserved but NOT used as an acceptance threshold",
  full.candidates?.segments[0].measuredLengthFt?.confidence === 0.01 &&
    full.candidates?.segments[0].measuredLengthFt?.value === 5.125
);
check(
  "clear visible-scene surface remains a reviewable candidate",
  full.candidates?.segments[0].surface?.value === "WALL" &&
    full.candidates?.segments[0].surface?.basis === "VISIBLE_SCENE"
);
check(
  "physical turn is preserved only as an individual observation candidate",
  full.candidates?.transitions[0].physicalTurn?.value === "FLAT"
);
check(
  "visible obstacle context stays independent of the physical turn",
  full.candidates?.transitions[0].obstacleContext?.value === "DOORWAY"
);

const partialEvidence = evidence();
partialEvidence.segments = partialEvidence.segments.map((row) =>
  row.segmentId === "S2"
    ? {
        ...row,
        measuredLengthFt: { value: 9.5, confidence: 0.99, visibility: "PARTIAL", basis: "WORLD_GEOMETRY" },
      }
    : row
);
const partial = extractRouteAssistScanCandidatesV1(points, segments, partialEvidence);
check("partial length evidence is not itself promoted to a candidate", partial.candidates?.segments[1].measuredLengthFt === null);
check(
  "one partial leg refuses the total instead of estimating the missing authority",
  partial.candidates?.completeMeasuredRouteLength === null
);

const missingEvidence = evidence();
missingEvidence.segments = missingEvidence.segments.filter((row) => row.segmentId !== "S2");
const missing = extractRouteAssistScanCandidatesV1(points, segments, missingEvidence);
check("missing segment evidence is represented as a null candidate", missing.candidates?.segments[1].measuredLengthFt === null);
check("missing segment evidence also refuses the total", missing.candidates?.completeMeasuredRouteLength === null);

const badTurnBasis = evidence();
badTurnBasis.transitions = [
  {
    pointId: "W1",
    physicalTurn: { value: "INSIDE", confidence: 0.99, visibility: "CLEAR", basis: "VISIBLE_SCENE" },
  },
];
const invalidTurn = extractRouteAssistScanCandidatesV1(points, segments, badTurnBasis);
check(
  "scene-only physical-turn assertion invalidates the evidence instead of becoming a fitting fact",
  invalidTurn.candidates === null && invalidTurn.problems.some((p) => p.includes("physicalTurn") && p.includes("WORLD_GEOMETRY")),
  invalidTurn.problems.join("; ")
);

const wrongSegment = evidence();
wrongSegment.segments = [...wrongSegment.segments, { segmentId: "NOT_ON_ROUTE" }];
const invalidGraphReference = extractRouteAssistScanCandidatesV1(points, segments, wrongSegment);
check(
  "evidence pointing outside the base route produces no candidate set",
  invalidGraphReference.candidates === null && invalidGraphReference.problems.some((p) => p.includes("not present in the base route")),
  invalidGraphReference.problems.join("; ")
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
