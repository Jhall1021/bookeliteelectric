import { buildOrderedRouteGeometryV1 } from "../lib/visual-assist/route-assist/orderedGeometry";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let pass = 0;
let fail = 0;

function ok(condition: boolean, label: string, detail = "") {
  if (condition) pass += 1;
  else fail += 1;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition ? "" : `\n       ${detail}`}`);
}

function point(
  id: string,
  kind: RoutePoint["kind"],
  x: number,
  y: number,
  extra: Partial<RoutePoint> = {}
): RoutePoint {
  return { id, kind, x, y, imageId: "img-1", ...extra };
}

function segment(
  id: string,
  fromPointId: string,
  toPointId: string,
  estimatedLengthFt: number,
  surface: RouteSegment["surface"] = "WALL"
): RouteSegment {
  return { id, fromPointId, toPointId, estimatedLengthFt, surface };
}

function main() {
  console.log("\nROUTE ASSIST ORDERED GEOMETRY V1\n");

  console.log("  A  STRAIGHT ROUTE\n");
  const straight = buildOrderedRouteGeometryV1(
    [point("a", "SOURCE", 0.1, 0.5), point("b", "DESTINATION", 0.9, 0.5)],
    [segment("s1", "a", "b", 11.6)]
  );
  ok(straight !== null, "A  straight A -> B route is orderable");
  ok(straight?.pointIds.join(",") === "a,b", "A  point order is source -> destination");
  ok(straight?.segments.length === 1 && straight.segments[0].estimatedLengthFt === 11.6,
    "A  per-segment footage is preserved");
  ok(straight?.transitions.length === 0, "A  straight route invents no transition");

  console.log("\n  B  STORAGE DIRECTION DOES NOT CONTROL WALK ORDER\n");
  const reversed = buildOrderedRouteGeometryV1(
    [point("a", "SOURCE", 0.1, 0.5), point("w", "WAYPOINT", 0.5, 0.5), point("b", "DESTINATION", 0.9, 0.5)],
    [segment("s1", "w", "a", 4), segment("s2", "b", "w", 5)]
  );
  ok(reversed?.segments[0].fromPointId === "a" && reversed.segments[0].toPointId === "w",
    "B  ordered segment endpoints follow A -> B even when stored backwards");
  ok(reversed?.segments[1].fromPointId === "w" && reversed.segments[1].toPointId === "b",
    "B  second leg follows the same walk order");

  console.log("\n  C  DOORWAY DETOUR PRESERVES BOTH TURN AND OBSTACLE\n");
  const doorwayPoints: RoutePoint[] = [
    point("a", "SOURCE", 0.05, 0.8),
    point("w1", "WAYPOINT", 0.2, 0.8, { physicalTurn: "FLAT" }),
    point("w2", "WAYPOINT", 0.2, 0.2, { physicalTurn: "FLAT", obstacle: "DOORWAY" }),
    point("w3", "WAYPOINT", 0.65, 0.2, { physicalTurn: "FLAT", obstacle: "DOORWAY" }),
    point("w4", "WAYPOINT", 0.65, 0.8, { physicalTurn: "FLAT" }),
    point("b", "DESTINATION", 0.95, 0.8),
  ];
  const doorwaySegments = [
    segment("s1", "a", "w1", 1.7),
    segment("s2", "w1", "w2", 6.8),
    segment("s3", "w2", "w3", 3.4),
    segment("s4", "w3", "w4", 6.8),
    segment("s5", "w4", "b", 2.1),
  ];
  const doorway = buildOrderedRouteGeometryV1(doorwayPoints, doorwaySegments);
  ok(doorway?.segments.map((s) => s.estimatedLengthFt).join(",") === "1.7,6.8,3.4,6.8,2.1",
    "C  doorway detour keeps the exact ordered leg sequence");
  ok(doorway?.transitions.filter((t) => t.physicalTurn === "FLAT").length === 4,
    "C  all four explicitly observed flat turns survive");
  ok(doorway?.transitions.filter((t) => t.obstacleContext === "DOORWAY").length === 2,
    "C  doorway context survives independently of the turns");
  ok(doorway?.transitions.some((t) => t.physicalTurn === "FLAT" && t.obstacleContext === "DOORWAY") === true,
    "C  an obstacle never suppresses a physical turn at the same waypoint");

  console.log("\n  D  MULTIPLE CORNERS STAY IN SEQUENCE\n");
  const multi = buildOrderedRouteGeometryV1(
    [
      point("a", "SOURCE", 0.1, 0.8),
      point("w1", "WAYPOINT", 0.1, 0.4, { physicalTurn: "INSIDE" }),
      point("w2", "WAYPOINT", 0.55, 0.4, { physicalTurn: "OUTSIDE" }),
      point("w3", "WAYPOINT", 0.55, 0.2, { physicalTurn: "FLAT" }),
      point("b", "DESTINATION", 0.85, 0.2),
    ],
    [
      segment("s1", "a", "w1", 4),
      segment("s2", "w1", "w2", 8.5),
      segment("s3", "w2", "w3", 5.2),
      segment("s4", "w3", "b", 3.1),
    ]
  );
  ok(multi?.transitions.map((t) => t.physicalTurn).join(",") === "INSIDE,OUTSIDE,FLAT",
    "D  repeated physical turns retain their exact A -> B order");

  console.log("\n  E  SURFACE CHANGE IS NOT A FITTING GUESS\n");
  const surfaceChange = buildOrderedRouteGeometryV1(
    [point("a", "SOURCE", 0.1, 0.8), point("w", "WAYPOINT", 0.5, 0.5), point("b", "DESTINATION", 0.8, 0.2)],
    [segment("s1", "a", "w", 4, "WALL"), segment("s2", "w", "b", 6, "CEILING")]
  );
  ok(surfaceChange?.transitions[0].surfaceChange?.from === "WALL" && surfaceChange.transitions[0].surfaceChange?.to === "CEILING",
    "E  known WALL -> CEILING change is preserved");
  ok(surfaceChange?.transitions[0].physicalTurn === null,
    "E  surface change does not invent inside/outside/flat fitting geometry");

  console.log("\n  F  2-D BENDS NEVER BECOME PHYSICAL FITTINGS BY THEMSELVES\n");
  const imageOnlyBend = buildOrderedRouteGeometryV1(
    [point("a", "SOURCE", 0.1, 0.8), point("w", "WAYPOINT", 0.1, 0.2), point("b", "DESTINATION", 0.8, 0.2)],
    [segment("s1", "a", "w", 6), segment("s2", "w", "b", 7)]
  );
  ok(imageOnlyBend?.transitions[0].physicalTurn === null,
    "F  obvious screen-space 90-degree bend remains physically unknown without evidence");

  console.log("\n  G  INVALID GRAPHS ARE REFUSED, NOT GUESSED\n");
  const branched = buildOrderedRouteGeometryV1(
    [point("a", "SOURCE", 0, 0), point("w", "WAYPOINT", 0.5, 0.5), point("x", "WAYPOINT", 0.5, 0), point("b", "DESTINATION", 1, 1)],
    [segment("s1", "a", "w", 1), segment("s2", "w", "b", 1), segment("s3", "w", "x", 1)]
  );
  ok(branched === null, "G  branch returns null rather than choosing a route");

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main();
