import { orderRoute } from "./geometry";
import type { RouteObstacle, RoutePhysicalTurn, RouteSurface } from "./taxonomy";
import type { RouteAssistResult, RoutePoint, RouteSegment } from "./types";

/**
 * Route Assist Ordered Geometry V1
 *
 * This is a VIEW over Route Assist's already-persisted graph, not a second
 * route model and not a shopping list. `RoutePoint[]` + `RouteSegment[]`
 * already persist the durable A -> B graph; `orderRoute()` deterministically
 * reconstructs its walk order. The one fact the old graph could not preserve
 * safely was the PHYSICAL kind of a turn, so that evidence now lives on the
 * waypoint itself (`RoutePoint.physicalTurn`).
 *
 * This view gives downstream physical consumers a stable sequence without
 * duplicating persisted lengths, inventing product/package logic, or allowing
 * image-space turn direction to masquerade as electrical fitting geometry.
 */

export type OrderedRouteSegmentV1 = {
  index: number;
  segmentId: string;
  fromPointId: string;
  toPointId: string;
  surface: RouteSurface | null;
  estimatedLengthFt: number | null;
};

export type OrderedRouteSurfaceChangeV1 = {
  from: RouteSurface;
  to: RouteSurface;
};

export type OrderedRouteTransitionV1 = {
  /** Index of the waypoint in SOURCE -> DESTINATION point order. */
  pointIndex: number;
  atPointId: string;
  incomingSegmentId: string;
  outgoingSegmentId: string;

  /**
   * Explicitly observed physical fitting geometry only.
   * null means "not established". It is never filled from a 2-D cross-product.
   */
  physicalTurn: RoutePhysicalTurn | null;

  /**
   * Independent obstacle context. A doorway/window can coexist with a turn;
   * the obstacle must never suppress the physical transition needed to route
   * around it.
   */
  obstacleContext: RouteObstacle | null;

  /**
   * Derived only when both adjacent segment surfaces are known and different.
   * This is deliberately separate from `physicalTurn`: WALL -> CEILING says
   * which surfaces are joined, not which raceway fitting a catalog requires.
   */
  surfaceChange: OrderedRouteSurfaceChangeV1 | null;
};

export type RouteAssistOrderedGeometryV1 = {
  version: 1;
  sourcePointId: string;
  destinationPointId: string;
  pointIds: string[];
  segments: OrderedRouteSegmentV1[];
  transitions: OrderedRouteTransitionV1[];
};

function knownSurface(surface: RouteSurface | null | undefined): RouteSurface | null {
  if (!surface || surface === "UNKNOWN") return null;
  return surface;
}

/**
 * Build the canonical ordered physical view of a Route Assist graph.
 *
 * Returns null for the same cases `orderRoute()` refuses: branch, dead-end,
 * disconnected graph, cycle, or missing/ambiguous endpoints. No route is
 * guessed just to produce an ordered list.
 */
export function buildOrderedRouteGeometryV1(
  points: RoutePoint[],
  segments: RouteSegment[]
): RouteAssistOrderedGeometryV1 | null {
  const route = orderRoute(points, segments);
  if (!route) return null;

  const orderedSegments: OrderedRouteSegmentV1[] = route.segments.map((segment, index) => ({
    index,
    segmentId: segment.id,
    // Use WALK order, not the segment object's storage direction. `orderRoute`
    // intentionally accepts either orientation in the underlying graph.
    fromPointId: route.points[index].id,
    toPointId: route.points[index + 1].id,
    surface: knownSurface(segment.surface),
    estimatedLengthFt: segment.estimatedLengthFt ?? null,
  }));

  const transitions: OrderedRouteTransitionV1[] = [];
  for (let pointIndex = 1; pointIndex < route.points.length - 1; pointIndex++) {
    const point = route.points[pointIndex];
    const incoming = route.segments[pointIndex - 1];
    const outgoing = route.segments[pointIndex];
    const incomingSurface = knownSurface(incoming.surface);
    const outgoingSurface = knownSurface(outgoing.surface);

    transitions.push({
      pointIndex,
      atPointId: point.id,
      incomingSegmentId: incoming.id,
      outgoingSegmentId: outgoing.id,
      physicalTurn: point.physicalTurn ?? null,
      obstacleContext: point.obstacle ?? null,
      surfaceChange:
        incomingSurface && outgoingSurface && incomingSurface !== outgoingSurface
          ? { from: incomingSurface, to: outgoingSurface }
          : null,
    });
  }

  return {
    version: 1,
    sourcePointId: route.points[0].id,
    destinationPointId: route.points[route.points.length - 1].id,
    pointIds: route.points.map((point) => point.id),
    segments: orderedSegments,
    transitions,
  };
}

/** Convenience adapter for callers that already hold a completed result. */
export function orderedGeometryFromResult(
  result: Pick<RouteAssistResult, "points" | "segments">
): RouteAssistOrderedGeometryV1 | null {
  return buildOrderedRouteGeometryV1(result.points, result.segments);
}
