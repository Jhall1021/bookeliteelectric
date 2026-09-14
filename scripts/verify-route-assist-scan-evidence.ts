import {
  alignRouteAssistScanEvidenceV1,
  isClearWorldGeometryObservation,
  validateRouteAssistScanEvidenceV1,
  type RouteAssistScanEvidenceV1,
  type RouteScanObservation,
} from "../lib/visual-assist/route-assist/scanEvidence";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) pass += 1;
  else fail += 1;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition ? "" : `\n       ${detail}`}`);
}

function world<T>(value: T | null, visibility: "CLEAR" | "PARTIAL" | "NOT_VISIBLE" = "CLEAR", confidence = 0.9): RouteScanObservation<T> {
  return { value, visibility, confidence, basis: "WORLD_GEOMETRY" };
}

function visible<T>(value: T | null, visibility: "CLEAR" | "PARTIAL" | "NOT_VISIBLE" = "CLEAR", confidence = 0.9): RouteScanObservation<T> {
  return { value, visibility, confidence, basis: "VISIBLE_SCENE" };
}

const points: RoutePoint[] = [
  { id: "a", kind: "SOURCE", x: 0.05, y: 0.8, imageId: "img" },
  { id: "w1", kind: "WAYPOINT", x: 0.2, y: 0.8, imageId: "img" },
  { id: "w2", kind: "WAYPOINT", x: 0.2, y: 0.2, imageId: "img" },
  { id: "b", kind: "DESTINATION", x: 0.9, y: 0.2, imageId: "img" },
];

// Deliberately store one segment backwards. Scan evidence references the
// existing graph; alignment must follow SOURCE -> DESTINATION, not storage direction.
const segments: RouteSegment[] = [
  { id: "s1", fromPointId: "w1", toPointId: "a", surface: "WALL" },
  { id: "s2", fromPointId: "w1", toPointId: "w2", surface: "WALL" },
  { id: "s3", fromPointId: "w2", toPointId: "b", surface: "WALL" },
];

function goodEvidence(): RouteAssistScanEvidenceV1 {
  return {
    version: 1,
    sourcePointId: "a",
    destinationPointId: "b",
    segments: [
      {
        segmentId: "s1",
        measuredLengthFt: world(1.7),
        surface: visible("WALL"),
        surfacePlaneId: world("wall-1"),
        orientation: world("HORIZONTAL"),
      },
      {
        segmentId: "s2",
        measuredLengthFt: world(6.8),
        surface: world("WALL"),
        surfacePlaneId: world("wall-1"),
        orientation: world("VERTICAL"),
      },
      {
        segmentId: "s3",
        measuredLengthFt: world(7.2),
        surface: world("WALL"),
        surfacePlaneId: world("wall-1"),
        orientation: world("HORIZONTAL"),
      },
    ],
    transitions: [
      {
        pointId: "w1",
        physicalTurn: world("FLAT"),
        obstacleContext: visible("DOORWAY"),
      },
      {
        pointId: "w2",
        physicalTurn: world("FLAT"),
        obstacleContext: visible("LARGE_OPENING"),
      },
    ],
  };
}

function main() {
  console.log("\nROUTE ASSIST SCAN EVIDENCE V1\n");

  const beforePoints = JSON.stringify(points);
  const beforeSegments = JSON.stringify(segments);

  console.log("  A  VALID WORLD/SCENE EVIDENCE\n");
  const good = goodEvidence();
  const validation = validateRouteAssistScanEvidenceV1(points, segments, good);
  check("A  coherent evidence validates", validation.valid, validation.problems.join("; "));
  const aligned = alignRouteAssistScanEvidenceV1(points, segments, good);
  check("A  aligned view exists", aligned.ordered !== null);
  check(
    "A  segment evidence follows SOURCE -> DESTINATION order",
    aligned.ordered?.segments.map((row) => row.segmentId).join(",") === "s1,s2,s3"
  );
  check(
    "A  measured lengths remain per existing segment",
    aligned.ordered?.segments.map((row) => row.evidence?.measuredLengthFt?.value).join(",") === "1.7,6.8,7.2"
  );
  check(
    "A  physical turns and obstacle context remain independent",
    aligned.ordered?.transitions[0].evidence?.physicalTurn?.value === "FLAT" &&
      aligned.ordered?.transitions[0].evidence?.obstacleContext?.value === "DOORWAY"
  );
  check("A  validation/alignment does not mutate route points", JSON.stringify(points) === beforePoints);
  check("A  validation/alignment does not mutate route segments", JSON.stringify(segments) === beforeSegments);

  console.log("\n  B  METRIC FACTS REQUIRE WORLD GEOMETRY\n");
  const pixelLength = goodEvidence();
  pixelLength.segments[0].measuredLengthFt = visible(1.7);
  const pixelLengthValidation = validateRouteAssistScanEvidenceV1(points, segments, pixelLength);
  check("B  visible-scene/pixel length is rejected as metric evidence", !pixelLengthValidation.valid);
  check(
    "B  failure names WORLD_GEOMETRY requirement",
    pixelLengthValidation.problems.some((problem) => problem.includes("requires WORLD_GEOMETRY"))
  );

  console.log("\n  C  PHYSICAL FITTINGS REQUIRE WORLD GEOMETRY\n");
  const screenTurn = goodEvidence();
  screenTurn.transitions[0].physicalTurn = visible("INSIDE");
  const screenTurnValidation = validateRouteAssistScanEvidenceV1(points, segments, screenTurn);
  check("C  visible-scene left/right turn cannot become a physical fitting", !screenTurnValidation.valid);

  console.log("\n  D  OBSTACLE RECOGNITION IS EVIDENCE, NOT COST\n");
  const fixedObstacle = goodEvidence();
  fixedObstacle.transitions[0].obstacleContext = visible("FIXED_OBSTRUCTION", "PARTIAL", 0.62);
  const fixedObstacleValidation = validateRouteAssistScanEvidenceV1(points, segments, fixedObstacle);
  check("D  partial visible fixed-obstruction evidence may be preserved", fixedObstacleValidation.valid);
  check(
    "D  partial evidence is not structurally clear world geometry",
    !isClearWorldGeometryObservation(fixedObstacle.transitions[0].obstacleContext)
  );

  console.log("\n  E  CLEAR WORLD GEOMETRY IS NECESSARY, NOT AUTOMATIC AUTHORITY\n");
  const clearLength = good.segments[0].measuredLengthFt;
  check("E  clear world measurement is recognized structurally", isClearWorldGeometryObservation(clearLength));
  const partialLength = world(1.7, "PARTIAL", 0.99);
  check("E  partial world measurement does not satisfy the clear-geometry helper", !isClearWorldGeometryObservation(partialLength));
  const lowConfidenceClear = world(1.7, "CLEAR", 0.2);
  check(
    "E  helper intentionally does not turn provider confidence into authority",
    isClearWorldGeometryObservation(lowConfidenceClear)
  );

  console.log("\n  F  CONTRADICTIONS AND BAD REFERENCES ARE REFUSED\n");
  const invisibleValue = goodEvidence();
  invisibleValue.segments[0].surfacePlaneId = world("wall-1", "NOT_VISIBLE", 0.99);
  check(
    "F  NOT_VISIBLE observation cannot carry a value",
    !validateRouteAssistScanEvidenceV1(points, segments, invisibleValue).valid
  );

  const unknownSegment = goodEvidence();
  unknownSegment.segments.push({ segmentId: "not-on-route", measuredLengthFt: world(2) });
  check(
    "F  evidence cannot invent a second segment graph",
    !validateRouteAssistScanEvidenceV1(points, segments, unknownSegment).valid
  );

  const endpointTurn = goodEvidence();
  endpointTurn.transitions.push({ pointId: "a", physicalTurn: world("INSIDE") });
  check(
    "F  physical transition evidence must reference an interior waypoint",
    !validateRouteAssistScanEvidenceV1(points, segments, endpointTurn).valid
  );

  const duplicate = goodEvidence();
  duplicate.segments.push({ segmentId: "s1", measuredLengthFt: world(1.8) });
  check("F  duplicate segment evidence is rejected", !validateRouteAssistScanEvidenceV1(points, segments, duplicate).valid);

  const badPlane = goodEvidence();
  badPlane.segments[0].surfacePlaneId = world("wall 1; buy material");
  check("F  plane IDs are opaque identifiers, not free text", !validateRouteAssistScanEvidenceV1(points, segments, badPlane).valid);

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main();
