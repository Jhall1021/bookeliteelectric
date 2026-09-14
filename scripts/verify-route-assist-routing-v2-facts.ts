import { projectRouteAssistSurfaceFactsV1 } from "../lib/electrical/routeAssistRoutingV2Facts";
import type {
  RouteAssistScanEvidenceV1,
  RouteScanObservation,
} from "../lib/visual-assist/route-assist/scanEvidence";
import type { RouteAssistSurfaceFactSource } from "../lib/electrical/routeAssistRoutingV2Facts";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) pass += 1;
  else fail += 1;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition ? "" : `\n       ${detail}`}`);
}

function world<T>(value: T | null, confidence = 0.95, visibility: "CLEAR" | "PARTIAL" | "NOT_VISIBLE" = "CLEAR"): RouteScanObservation<T> {
  return { value, confidence, visibility, basis: "WORLD_GEOMETRY" };
}

function visible<T>(value: T | null, confidence = 0.9): RouteScanObservation<T> {
  return { value, confidence, visibility: "CLEAR", basis: "VISIBLE_SCENE" };
}

function source(points: RoutePoint[], segments: RouteSegment[], overrides: Partial<RouteAssistSurfaceFactSource> = {}): RouteAssistSurfaceFactSource {
  return {
    mode: "SURFACE",
    customerConfirmedRoute: true,
    needsContractorReview: false,
    points,
    segments,
    ...overrides,
  };
}

function point(id: string, kind: RoutePoint["kind"], x: number, y: number): RoutePoint {
  return { id, kind, x, y, imageId: "img" };
}

function segment(id: string, fromPointId: string, toPointId: string): RouteSegment {
  return { id, fromPointId, toPointId, surface: "WALL" };
}

function straightFixture() {
  const points = [point("a", "SOURCE", 0.1, 0.5), point("b", "DESTINATION", 0.9, 0.5)];
  const segments = [segment("s1", "a", "b")];
  const evidence: RouteAssistScanEvidenceV1 = {
    version: 1,
    sourcePointId: "a",
    destinationPointId: "b",
    segments: [
      {
        segmentId: "s1",
        measuredLengthFt: world(11.6),
        surface: visible("WALL"),
        surfacePlaneId: world("wall-1"),
        orientation: world("HORIZONTAL"),
      },
    ],
    transitions: [],
  };
  return { points, segments, evidence };
}

function doorwayFixture() {
  const points = [
    point("a", "SOURCE", 0.05, 0.8),
    point("w1", "WAYPOINT", 0.2, 0.8),
    point("w2", "WAYPOINT", 0.2, 0.2),
    point("w3", "WAYPOINT", 0.65, 0.2),
    point("w4", "WAYPOINT", 0.65, 0.8),
    point("b", "DESTINATION", 0.95, 0.8),
  ];
  const segments = [
    segment("s1", "a", "w1"),
    segment("s2", "w1", "w2"),
    segment("s3", "w2", "w3"),
    segment("s4", "w3", "w4"),
    segment("s5", "w4", "b"),
  ];
  const lengths = [1.7, 6.8, 3.4, 6.8, 2.1];
  const evidence: RouteAssistScanEvidenceV1 = {
    version: 1,
    sourcePointId: "a",
    destinationPointId: "b",
    segments: segments.map((s, index) => ({
      segmentId: s.id,
      measuredLengthFt: world(lengths[index]),
      surface: world("WALL"),
      surfacePlaneId: world("wall-1"),
      orientation: world(index % 2 === 0 ? "HORIZONTAL" : "VERTICAL"),
    })),
    transitions: ["w1", "w2", "w3", "w4"].map((pointId, index) => ({
      pointId,
      physicalTurn: world("FLAT"),
      obstacleContext: index === 1 || index === 2 ? visible("DOORWAY") : undefined,
    })),
  };
  return { points, segments, evidence };
}

function multiCornerFixture() {
  const points = [
    point("a", "SOURCE", 0.1, 0.8),
    point("w1", "WAYPOINT", 0.1, 0.4),
    point("w2", "WAYPOINT", 0.55, 0.4),
    point("w3", "WAYPOINT", 0.55, 0.2),
    point("b", "DESTINATION", 0.85, 0.2),
  ];
  const segments = [
    segment("s1", "a", "w1"),
    segment("s2", "w1", "w2"),
    segment("s3", "w2", "w3"),
    segment("s4", "w3", "b"),
  ];
  const lengths = [4, 8.5, 5.2, 3.1];
  const planes = ["wall-1", "wall-2", "wall-3", "wall-3"];
  const turns = ["INSIDE", "OUTSIDE", "FLAT"] as const;
  const evidence: RouteAssistScanEvidenceV1 = {
    version: 1,
    sourcePointId: "a",
    destinationPointId: "b",
    segments: segments.map((s, index) => ({
      segmentId: s.id,
      measuredLengthFt: world(lengths[index]),
      surface: world("WALL"),
      surfacePlaneId: world(planes[index]),
    })),
    transitions: ["w1", "w2", "w3"].map((pointId, index) => ({
      pointId,
      physicalTurn: world(turns[index]),
    })),
  };
  return { points, segments, evidence };
}

function main() {
  console.log("\nROUTE ASSIST -> ROUTING V2 PHYSICAL FACTS V1\n");

  console.log("  A  STRAIGHT ROUTE\n");
  const straight = straightFixture();
  const straightProjection = projectRouteAssistSurfaceFactsV1(
    source(straight.points, straight.segments),
    straight.evidence
  );
  check("A  straight scan is complete", straightProjection.state === "COMPLETE", straightProjection.blockers.join("; "));
  check("A  exact decimal footage is preserved", straightProjection.facts?.surfaceRouteFt === 11.6);
  check(
    "A  zero-turn route yields exact zero corner counts",
    straightProjection.facts?.insideCornerCount === 0 &&
      straightProjection.facts?.outsideCornerCount === 0 &&
      straightProjection.facts?.flatCornerCount === 0
  );
  check("A  automatic binding remains explicitly unauthorized", straightProjection.automaticBindingAuthorized === false);

  console.log("\n  B  DOORWAY DETOUR\n");
  const doorway = doorwayFixture();
  const doorwayProjection = projectRouteAssistSurfaceFactsV1(
    source(doorway.points, doorway.segments),
    doorway.evidence
  );
  check("B  doorway detour is physically complete", doorwayProjection.state === "COMPLETE", doorwayProjection.blockers.join("; "));
  check("B  ordered segment lengths survive", doorwayProjection.orderedSegmentLengthsFt?.join(",") === "1.7,6.8,3.4,6.8,2.1");
  check("B  20.8 ft is not rounded to a whole-foot tree value", doorwayProjection.facts?.surfaceRouteFt === 20.8);
  check("B  four flat turns are counted from physical-turn evidence", doorwayProjection.facts?.flatCornerCount === 4);
  check("B  doorway context adds no extra canonical quantity", Object.keys(doorwayProjection.facts ?? {}).length === 4);

  console.log("\n  C  MULTIPLE PHYSICAL CORNERS\n");
  const multi = multiCornerFixture();
  const multiProjection = projectRouteAssistSurfaceFactsV1(source(multi.points, multi.segments), multi.evidence);
  check("C  multi-corner route is complete", multiProjection.state === "COMPLETE", multiProjection.blockers.join("; "));
  check(
    "C  inside/outside/flat counts remain distinct",
    multiProjection.facts?.insideCornerCount === 1 &&
      multiProjection.facts?.outsideCornerCount === 1 &&
      multiProjection.facts?.flatCornerCount === 1
  );
  check("C  total physical footage is 20.8", multiProjection.facts?.surfaceRouteFt === 20.8);

  console.log("\n  D  INCOMPLETE EVIDENCE NEVER BECOMES AN EXACT FACT\n");
  const missingLength = straightFixture();
  missingLength.evidence.segments[0].measuredLengthFt = world(11.6, 0.99, "PARTIAL");
  const missingLengthProjection = projectRouteAssistSurfaceFactsV1(
    source(missingLength.points, missingLength.segments),
    missingLength.evidence
  );
  check("D  partial measurement blocks exact physical facts", missingLengthProjection.state === "INCOMPLETE");
  check("D  incomplete projection exposes no canonical fact object", missingLengthProjection.facts === null);

  const missingTurn = multiCornerFixture();
  missingTurn.evidence.transitions[1].physicalTurn = world(null, 0.99);
  const missingTurnProjection = projectRouteAssistSurfaceFactsV1(
    source(missingTurn.points, missingTurn.segments),
    missingTurn.evidence
  );
  check("D  unknown physical turn blocks exact corner totals", missingTurnProjection.state === "INCOMPLETE");

  console.log("\n  E  PLANE/PHYSICAL-TURN CONTRADICTIONS ARE REFUSED\n");
  const flatAcrossPlanes = multiCornerFixture();
  flatAcrossPlanes.evidence.transitions[0].physicalTurn = world("FLAT");
  const flatAcrossPlanesProjection = projectRouteAssistSurfaceFactsV1(
    source(flatAcrossPlanes.points, flatAcrossPlanes.segments),
    flatAcrossPlanes.evidence
  );
  check("E  FLAT cannot cross two known physical planes", flatAcrossPlanesProjection.state === "INCOMPLETE");

  const insideSamePlane = doorwayFixture();
  insideSamePlane.evidence.transitions[0].physicalTurn = world("INSIDE");
  const insideSamePlaneProjection = projectRouteAssistSurfaceFactsV1(
    source(insideSamePlane.points, insideSamePlane.segments),
    insideSamePlane.evidence
  );
  check("E  INSIDE cannot stay on one known physical plane", insideSamePlaneProjection.state === "INCOMPLETE");

  console.log("\n  F  RESULT AUTHORITY BOUNDARIES\n");
  const unconfirmed = straightFixture();
  check(
    "F  unconfirmed customer route cannot project canonical facts",
    projectRouteAssistSurfaceFactsV1(
      source(unconfirmed.points, unconfirmed.segments, { customerConfirmedRoute: false }),
      unconfirmed.evidence
    ).state === "INCOMPLETE"
  );
  check(
    "F  contractor-review route cannot project canonical facts",
    projectRouteAssistSurfaceFactsV1(
      source(unconfirmed.points, unconfirmed.segments, { needsContractorReview: true }),
      unconfirmed.evidence
    ).state === "INCOMPLETE"
  );
  check(
    "F  concealed mode cannot use the SURFACE projection",
    projectRouteAssistSurfaceFactsV1(
      source(unconfirmed.points, unconfirmed.segments, { mode: "CONCEALED" }),
      unconfirmed.evidence
    ).state === "INCOMPLETE"
  );

  console.log("\n  G  CONFIDENCE IS EVIDENCE, NOT AUTOMATIC AUTHORITY\n");
  const lowConfidence = straightFixture();
  lowConfidence.evidence.segments[0].measuredLengthFt = world(11.6, 0.2);
  const lowConfidenceProjection = projectRouteAssistSurfaceFactsV1(
    source(lowConfidence.points, lowConfidence.segments),
    lowConfidence.evidence
  );
  check("G  structurally complete low-confidence evidence remains visible", lowConfidenceProjection.state === "COMPLETE");
  check("G  confidence floor is carried forward", lowConfidenceProjection.evidenceConfidenceFloor === 0.2);
  check("G  no confidence number authorizes auto-binding", lowConfidenceProjection.automaticBindingAuthorized === false);

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main();
