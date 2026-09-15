import { orderRoute } from "./geometry";
import type { RouteObstacle, RoutePhysicalTurn, RouteSurface } from "./taxonomy";
import type { RouteAssistResult, RoutePoint, RouteSegment } from "./types";

/**
 * Route Assist Ordered Geometry V1.
 *
 * This is a VIEW over the already-persisted point/segment graph, not a second
 * route model and not a shopping list. It gives downstream physical consumers
 * stable SOURCE -> DESTINATION order while preserving turn and obstacle facts
 * separately.
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
  pointIndex: number;
  atPointId: string;
  incomingSegmentId: string;
  outgoingSegmentId: string;
  /** Explicitly observed physical fitting geometry only. */
  physicalTurn: RoutePhysicalTurn | null;
  /** Independent visible obstacle context. */
  obstacleContext: RouteObstacle | null;
  /** Surface transition, deliberately separate from fitting identity. */
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

/** Refuses branch/dead-end/disconnected/cyclic graphs instead of guessing. */
export function buildOrderedRouteGeometryV1(
  points: RoutePoint[],
  segments: RouteSegment[]
): RouteAssistOrderedGeometryV1 | null {
  const route = orderRoute(points, segments);
  if (!route) return null;

  const orderedSegments: OrderedRouteSegmentV1[] = route.segments.map((segment, index) => ({
    index,
    segmentId: segment.id,
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

export function orderedGeometryFromResult(
  result: Pick<RouteAssistResult, "points" | "segments">
): RouteAssistOrderedGeometryV1 | null {
  return buildOrderedRouteGeometryV1(result.points, result.segments);
}
