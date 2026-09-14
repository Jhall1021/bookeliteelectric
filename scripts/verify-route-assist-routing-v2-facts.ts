import {
  projectRouteAssistSurfaceFactsV1,
  type RouteAssistSurfaceFactSource,
} from "../lib/electrical/routeAssistRoutingV2Facts";
import type {
  RouteAssistScanEvidenceV1,
  RouteScanObservation,
} from "../lib/visual-assist/route-assist/scanEvidence";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

type Turn = "FLAT" | "INSIDE" | "OUTSIDE";

let pass = 0;
let fail = 0;

const check = (label: string, condition: boolean) => {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}`);
};

function world<T>(
  value: T | null,
  confidence = 0.95,
  visibility: "CLEAR" | "PARTIAL" | "NOT_VISIBLE" = "CLEAR"
): RouteScanObservation<T> {
  return { value, confidence, visibility, basis: "WORLD_GEOMETRY" };
}

function visible<T>(value: T | null): RouteScanObservation<T> {
  return { value, confidence: 0.9, visibility: "CLEAR", basis: "VISIBLE_SCENE" };
}

function point(
  id: string,
  kind: RoutePoint["kind"],
  x: number,
  y: number
): RoutePoint {
  return { id, kind, x, y, imageId: "img" };
}

function segment(
  id: string,
  fromPointId: string,
  toPointId: string
): RouteSegment {
  return { id, fromPointId, toPointId, surface: "WALL" };
}

function source(
  points: RoutePoint[],
  segments: RouteSegment[],
  overrides: Partial<RouteAssistSurfaceFactSource> = {}
): RouteAssistSurfaceFactSource {
  return {
    mode: "SURFACE",
    customerConfirmedRoute: true,
    needsContractorReview: false,
    points,
    segments,
    ...overrides,
  };
}

function straight() {
  const points = [
    point("a", "SOURCE", 0.1, 0.5),
    point("b", "DESTINATION", 0.9, 0.5),
  ];
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

function doorway() {
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
    segments: segments.map((s, i) => ({
      segmentId: s.id,
      measuredLengthFt: world(lengths[i]),
      surface: world("WALL"),
      surfacePlaneId: world("wall-1"),
    })),
    transitions: ["w1", "w2", "w3", "w4"].map((pointId, i) => ({
      pointId,
      physicalTurn: world<Turn>("FLAT"),
      obstacleContext:
        i === 1 || i === 2 ? visible("DOORWAY") : undefined,
    })),
  };
  return { points, segments, evidence };
}

function multi() {
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
  const turns: Turn[] = ["INSIDE", "OUTSIDE", "FLAT"];
  const evidence: RouteAssistScanEvidenceV1 = {
    version: 1,
    sourcePointId: "a",
    destinationPointId: "b",
    segments: segments.map((s, i) => ({
      segmentId: s.id,
      measuredLengthFt: world(lengths[i]),
      surface: world("WALL"),
      surfacePlaneId: world(planes[i]),
    })),
    transitions: ["w1", "w2", "w3"].map((pointId, i) => ({
      pointId,
      physicalTurn: world<Turn>(turns[i]),
    })),
  };
  return { points, segments, evidence };
}

console.log("\nROUTE ASSIST -> ROUTING V2 PHYSICAL FACTS V1\n");

const a = straight();
const ap = projectRouteAssistSurfaceFactsV1(
  source(a.points, a.segments),
  a.evidence
);
check("straight route complete", ap.state === "COMPLETE");
check("11.6 ft preserved exactly", ap.facts?.surfaceRouteFt === 11.6);
check(
  "straight route has zero corners",
  ap.facts?.insideCornerCount === 0 &&
    ap.facts?.outsideCornerCount === 0 &&
    ap.facts?.flatCornerCount === 0
);
check(
  "automatic binding unauthorized",
  ap.automaticBindingAuthorized === false
);

const b = doorway();
const bp = projectRouteAssistSurfaceFactsV1(
  source(b.points, b.segments),
  b.evidence
);
check("doorway route complete", bp.state === "COMPLETE");
check(
  "ordered lengths preserved",
  bp.orderedSegmentLengthsFt?.join(",") === "1.7,6.8,3.4,6.8,2.1"
);
check("20.8 ft not rounded", bp.facts?.surfaceRouteFt === 20.8);
check(
  "doorway detour has four physical flat turns",
  bp.facts?.flatCornerCount === 4
);
check(
  "obstacle adds no fifth canonical fact",
  Object.keys(bp.facts ?? {}).length === 4
);

const c = multi();
const cp = projectRouteAssistSurfaceFactsV1(
  source(c.points, c.segments),
  c.evidence
);
check("multi-corner route complete", cp.state === "COMPLETE");
check(
  "inside/outside/flat remain distinct",
  cp.facts?.insideCornerCount === 1 &&
    cp.facts?.outsideCornerCount === 1 &&
    cp.facts?.flatCornerCount === 1
);

const partial = straight();
partial.evidence.segments[0].measuredLengthFt = world(
  11.6,
  0.99,
  "PARTIAL"
);
check(
  "partial length cannot become exact facts",
  projectRouteAssistSurfaceFactsV1(
    source(partial.points, partial.segments),
    partial.evidence
  ).state === "INCOMPLETE"
);

const unknownTurn = multi();
unknownTurn.evidence.transitions[1].physicalTurn =
  world<Turn>(null, 0.99);
check(
  "unknown turn blocks exact corner totals",
  projectRouteAssistSurfaceFactsV1(
    source(unknownTurn.points, unknownTurn.segments),
    unknownTurn.evidence
  ).state === "INCOMPLETE"
);

const flatAcrossPlanes = multi();
flatAcrossPlanes.evidence.transitions[0].physicalTurn =
  world<Turn>("FLAT");
check(
  "FLAT cannot cross known different planes",
  projectRouteAssistSurfaceFactsV1(
    source(flatAcrossPlanes.points, flatAcrossPlanes.segments),
    flatAcrossPlanes.evidence
  ).state === "INCOMPLETE"
);

const insideSamePlane = doorway();
insideSamePlane.evidence.transitions[0].physicalTurn =
  world<Turn>("INSIDE");
check(
  "INSIDE cannot stay on one known plane",
  projectRouteAssistSurfaceFactsV1(
    source(insideSamePlane.points, insideSamePlane.segments),
    insideSamePlane.evidence
  ).state === "INCOMPLETE"
);

check(
  "unconfirmed route blocked",
  projectRouteAssistSurfaceFactsV1(
    source(a.points, a.segments, { customerConfirmedRoute: false }),
    a.evidence
  ).state === "INCOMPLETE"
);
check(
  "contractor-review route blocked",
  projectRouteAssistSurfaceFactsV1(
    source(a.points, a.segments, { needsContractorReview: true }),
    a.evidence
  ).state === "INCOMPLETE"
);
check(
  "concealed mode blocked by surface projection",
  projectRouteAssistSurfaceFactsV1(
    source(a.points, a.segments, { mode: "CONCEALED" }),
    a.evidence
  ).state === "INCOMPLETE"
);

const low = straight();
low.evidence.segments[0].measuredLengthFt = world(11.6, 0.2);
const lowp = projectRouteAssistSurfaceFactsV1(
  source(low.points, low.segments),
  low.evidence
);
check(
  "low confidence remains visible evidence",
  lowp.state === "COMPLETE" &&
    lowp.evidenceConfidenceFloor === 0.2
);
check(
  "low confidence still cannot authorize binding",
  lowp.automaticBindingAuthorized === false
);

console.log(
  `\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed\n`
);
if (fail > 0) process.exit(1);
