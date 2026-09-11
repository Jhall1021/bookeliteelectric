/**
 * Pure geometry over a customer-placed route. No AI, no database, no
 * network — every function here reads only `points`/`segments` the customer
 * drew and tagged, and every number it returns is either counted directly
 * off that structure or explicitly `null` when the structure doesn't
 * support a claim. "AI observes, deterministic logic decides" (§16 of the
 * brief) is true here in the strongest possible sense: there's no AI in
 * this file to second-guess.
 *
 * Coordinates are normalized 0..1 image-space, not real-world distance.
 * That's on purpose — see docs/design/route-assist-v1.md §3. Angle math
 * (corner detection) is valid on normalized coordinates; distance math
 * (feet) is not, which is why length comes from `estimatedLengthFt`
 * (customer/contractor-entered) rather than from these coordinates.
 */

import type { RoutePoint, RouteSegment } from "./types";
import type { RouteTurnDirection } from "./taxonomy";

/** Below this angle (degrees) a direction change is noise, not a turn. */
const MIN_TURN_ANGLE_DEG = 20;

export type OrderedRoute = {
  /** Source .. destination, in walk order. Length >= 2. */
  points: RoutePoint[];
  /** `segments[i]` connects `points[i]` and `points[i + 1]`. Length = points.length - 1. */
  segments: RouteSegment[];
};

/**
 * Walk `segments` from the SOURCE point to the DESTINATION point.
 *
 * Returns `null` rather than guessing when the graph isn't a single simple
 * path — a branch, a dead end, a disconnected segment, or a missing
 * source/destination. A route that isn't a clean line from A to B is not a
 * geometry problem to solve by picking one branch; it's exactly the
 * `MULTIPLE_POSSIBLE_ROUTES` / `ROUTE_NOT_FULLY_VISIBLE` case result.ts
 * routes to `RouteAssistIncomplete` instead.
 */
export function orderRoute(points: RoutePoint[], segments: RouteSegment[]): OrderedRoute | null {
  const byId = new Map(points.map((p) => [p.id, p]));
  const source = points.find((p) => p.kind === "SOURCE");
  const destination = points.find((p) => p.kind === "DESTINATION");
  if (!source || !destination || source.id === destination.id) return null;

  const adjacency = new Map<string, RouteSegment[]>();
  for (const seg of segments) {
    if (!byId.has(seg.fromPointId) || !byId.has(seg.toPointId)) return null;
    if (!adjacency.has(seg.fromPointId)) adjacency.set(seg.fromPointId, []);
    if (!adjacency.has(seg.toPointId)) adjacency.set(seg.toPointId, []);
    adjacency.get(seg.fromPointId)!.push(seg);
    adjacency.get(seg.toPointId)!.push(seg);
  }

  const orderedPoints: RoutePoint[] = [source];
  const orderedSegments: RouteSegment[] = [];
  const visitedSegmentIds = new Set<string>();
  let current = source;

  while (current.id !== destination.id) {
    const incident = (adjacency.get(current.id) ?? []).filter((s) => !visitedSegmentIds.has(s.id));
    // Exactly one unvisited segment at this point is the only case that
    // still reads as "a single line continuing." Zero means a dead end
    // before reaching B; more than one means a branch — either way, this
    // isn't a walkable A-to-B line.
    if (incident.length !== 1) return null;
    const seg = incident[0];
    visitedSegmentIds.add(seg.id);
    const nextId = seg.fromPointId === current.id ? seg.toPointId : seg.fromPointId;
    const next = byId.get(nextId);
    if (!next) return null;
    orderedPoints.push(next);
    orderedSegments.push(seg);
    current = next;
    if (orderedPoints.length > points.length) return null; // cycle guard
  }

  return { points: orderedPoints, segments: orderedSegments };
}

function angleBetweenDeg(
  prev: RoutePoint,
  vertex: RoutePoint,
  next: RoutePoint
): { degrees: number; cross: number } {
  const v1 = { x: vertex.x - prev.x, y: vertex.y - prev.y };
  const v2 = { x: next.x - vertex.x, y: next.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  if (mag1 === 0 || mag2 === 0) return { degrees: 0, cross: 0 };
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return { degrees: (Math.acos(cos) * 180) / Math.PI, cross };
}

export type RouteTurn = {
  atPointId: string;
  direction: RouteTurnDirection;
};

/**
 * Every interior point whose surface tag agrees on both adjacent segments —
 * i.e. a bend that stays on the same kind of surface, not a wall-to-ceiling
 * transition wearing a corner's clothes. Those are counted once, by
 * `surfaceTransitions`, never here as well.
 *
 * A corner requires BOTH adjacent segments explicitly tagged the same known
 * surface. An untagged bend counts as neither a corner nor a transition —
 * silence, not a guess.
 */
export function corners(route: OrderedRoute): RouteTurn[] {
  const turns: RouteTurn[] = [];
  for (let i = 1; i < route.points.length - 1; i++) {
    // A doorway/window bypass point is counted once, by obstacleBypasses —
    // never also as a corner, even if the drawn path bends there.
    if (route.points[i].obstacle) continue;
    const before = route.segments[i - 1];
    const after = route.segments[i];
    if (!before.surface || !after.surface) continue;
    if (before.surface === "UNKNOWN" || after.surface === "UNKNOWN") continue;
    if (before.surface !== after.surface) continue; // a transition, not a corner
    const { degrees, cross } = angleBetweenDeg(route.points[i - 1], route.points[i], route.points[i + 1]);
    if (degrees < MIN_TURN_ANGLE_DEG) continue;
    // Convention, applied consistently: a positive cross product (in
    // normalized image space, y increasing downward) reads as the path
    // turning into the room — INSIDE. The label is arbitrary; what matters
    // is that the same drawn path always classifies the same way.
    turns.push({ atPointId: route.points[i].id, direction: cross > 0 ? "INSIDE" : "OUTSIDE" });
  }
  return turns;
}

export type SurfaceTransitions = {
  wallToCeiling: number;
  wallToFloor: number;
};

/** Interior points where the surface tag genuinely changes between the two adjacent segments. */
export function surfaceTransitions(route: OrderedRoute): SurfaceTransitions {
  let wallToCeiling = 0;
  let wallToFloor = 0;
  for (let i = 1; i < route.points.length - 1; i++) {
    const before = route.segments[i - 1].surface;
    const after = route.segments[i].surface;
    if (!before || !after || before === "UNKNOWN" || after === "UNKNOWN") continue;
    if (before === after) continue;
    const pair = new Set([before, after]);
    if (pair.has("WALL") && pair.has("CEILING")) wallToCeiling++;
    if (pair.has("WALL") && pair.has("FLOOR")) wallToFloor++;
  }
  return { wallToCeiling, wallToFloor };
}

/**
 * Interior points the customer explicitly tagged as a different-wall
 * transition (`transitionAtEnd: true`) where both adjacent segments are
 * WALL. This is a customer-declared fact, not something geometry alone can
 * tell — a bend and a different-wall transition can look identical in a
 * single photo.
 */
export function wallTransitions(route: OrderedRoute): number {
  // Deliberately NOT excluded by an obstacle tag — a doorway and a
  // different-wall transition are independent facts that can sit at the
  // same point (a route that goes through a doorway onto a different wall
  // is exactly Proof D). Only corners() excludes obstacle points, because a
  // corner and a bypass really would be double-counting the same bend.
  let count = 0;
  for (let i = 0; i < route.segments.length - 1; i++) {
    const seg = route.segments[i];
    const next = route.segments[i + 1];
    if (seg.transitionAtEnd && seg.surface === "WALL" && next.surface === "WALL") count++;
  }
  return count;
}

/** Interior points explicitly tagged with an obstacle. */
export function obstacleBypasses(route: OrderedRoute): { doorways: number; windows: number } {
  let doorways = 0;
  let windows = 0;
  for (let i = 1; i < route.points.length - 1; i++) {
    const obstacle = route.points[i].obstacle;
    if (obstacle === "DOORWAY") doorways++;
    if (obstacle === "WINDOW") windows++;
  }
  return { doorways, windows };
}

/**
 * A WALL segment whose drawn direction is dominantly vertical in image
 * space — a rise or drop, the way the brief's own ASCII diagrams draw one
 * (§6). This assumes a roughly level, front-on capture, same as every
 * mockup and worked example in the brief; a route photographed from an odd
 * angle will under- or over-count, which is exactly the kind of visible
 * uncertainty §22 exists to catch downstream, not something this function
 * can correct for on its own.
 */
export function verticalWallSegments(route: OrderedRoute): number {
  let count = 0;
  for (const segment of route.segments) {
    if (segment.surface !== "WALL") continue;
    const from = route.points.find((p) => p.id === segment.fromPointId);
    const to = route.points.find((p) => p.id === segment.toPointId);
    if (!from || !to) continue;
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    if (dy > dx * 1.5) count++;
  }
  return count;
}

/** Sum of every segment's `estimatedLengthFt`, or `null` if any leg is unset. */
export function totalEstimatedLengthFt(route: OrderedRoute): number | null {
  let total = 0;
  for (const segment of route.segments) {
    if (segment.estimatedLengthFt == null) return null;
    total += segment.estimatedLengthFt;
  }
  return Math.round(total * 10) / 10;
}

/**
 * Concealed-mode only: does the route stay on one wall?
 *
 * `null` when there isn't enough surface tagging to say either way — an
 * untagged route is not the same fact as a confirmed same-wall route, and
 * collapsing the two would silently understate complexity.
 */
export function sameWallHeuristic(
  route: OrderedRoute,
  wallTransitionCount: number,
  transitions: SurfaceTransitions,
  cornerList: RouteTurn[]
): boolean | null {
  const taggedSurfaces = route.segments.map((s) => s.surface).filter((s) => s && s !== "UNKNOWN");
  if (taggedSurfaces.length < route.segments.length) return null; // not fully tagged — uncertain, not "same wall"
  if (wallTransitionCount > 0 || transitions.wallToCeiling > 0 || transitions.wallToFloor > 0) return false;
  if (cornerList.length > 0) return false;
  return taggedSurfaces.every((s) => s === "WALL");
}
