import { orderRoute } from "./geometry";
import type { RouteAssistScanCandidatesV1 } from "./scanCandidates";
import type { RoutePoint, RouteSegment } from "./types";

/**
 * Explicit acceptance of room-scan candidates into Route Assist's EXISTING
 * physical graph.
 *
 * This is the authority boundary the evidence layer intentionally leaves open:
 *
 *   scan evidence -> reviewable candidates -> EXPLICIT acceptance
 *                 -> RoutePoint / RouteSegment facts
 *
 * No provider-confidence threshold lives here. The caller decides which
 * candidates were actually reviewed/confirmed and names them by route id.
 * Nothing is accepted merely because the model/provider sounded confident.
 *
 * This still stops before Routing V2, MaterialTakeoff, labor and price. The
 * normal Route Assist result builder consumes the updated graph afterwards,
 * and the normal Route Assist -> Routing V2 adapter remains the only next seam.
 */

export type RouteAssistScanCandidateAcceptanceV1 = {
  /** Copy accepted metric lengths into RouteSegment.estimatedLengthFt. */
  measuredLengthSegmentIds?: string[];
  /** Copy accepted observed surfaces into RouteSegment.surface. */
  surfaceSegmentIds?: string[];
  /** Copy accepted physical fitting geometry into RoutePoint.physicalTurn. */
  physicalTurnPointIds?: string[];
  /**
   * Only DOORWAY/WINDOW can enter RoutePoint.obstacle. LARGE_OPENING and
   * FIXED_OBSTRUCTION remain scan evidence until Route Assist has a canonical
   * graph vocabulary for them.
   */
  routeObstaclePointIds?: string[];
};

export type AcceptedRouteAssistScanGraphV1 = {
  points: RoutePoint[];
  segments: RouteSegment[];
  applied: {
    measuredLengthSegmentIds: string[];
    surfaceSegmentIds: string[];
    physicalTurnPointIds: string[];
    routeObstaclePointIds: string[];
  };
};

export type RouteAssistScanCandidateAcceptanceResult =
  | { ok: true; graph: AcceptedRouteAssistScanGraphV1 }
  | { ok: false; problems: string[] };

function unique(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])];
}

/**
 * Apply only candidates explicitly named by the caller.
 *
 * FAILS ATOMICALLY. If one requested candidate is missing, references a route
 * id that does not exist, or cannot map into Route Assist's current graph
 * vocabulary, none of the requested candidates is applied. This prevents a UI
 * from presenting "accepted scan" while only some of its requested facts made
 * it into the route.
 */
export function applyAcceptedRouteAssistScanCandidatesV1(
  points: RoutePoint[],
  segments: RouteSegment[],
  candidates: RouteAssistScanCandidatesV1,
  acceptance: RouteAssistScanCandidateAcceptanceV1,
): RouteAssistScanCandidateAcceptanceResult {
  const route = orderRoute(points, segments);
  if (!route) {
    return { ok: false, problems: ["base route is not a single SOURCE-to-DESTINATION path"] };
  }
  if (
    candidates.sourcePointId !== route.points[0].id ||
    candidates.destinationPointId !== route.points[route.points.length - 1].id
  ) {
    return { ok: false, problems: ["candidate source/destination does not match the base route"] };
  }

  const acceptedLengths = unique(acceptance.measuredLengthSegmentIds);
  const acceptedSurfaces = unique(acceptance.surfaceSegmentIds);
  const acceptedTurns = unique(acceptance.physicalTurnPointIds);
  const acceptedObstacles = unique(acceptance.routeObstaclePointIds);

  const segmentIds = new Set(route.segments.map((segment) => segment.id));
  const interiorPointIds = new Set(route.points.slice(1, -1).map((point) => point.id));
  const segmentCandidates = new Map(candidates.segments.map((candidate) => [candidate.segmentId, candidate]));
  const transitionCandidates = new Map(candidates.transitions.map((candidate) => [candidate.pointId, candidate]));
  const problems: string[] = [];

  for (const id of acceptedLengths) {
    if (!segmentIds.has(id)) problems.push(`measured length acceptance references non-route segment ${id}`);
    else if (!segmentCandidates.get(id)?.measuredLengthFt) problems.push(`segment ${id} has no measured-length candidate to accept`);
  }
  for (const id of acceptedSurfaces) {
    if (!segmentIds.has(id)) problems.push(`surface acceptance references non-route segment ${id}`);
    else if (!segmentCandidates.get(id)?.surface) problems.push(`segment ${id} has no surface candidate to accept`);
  }
  for (const id of acceptedTurns) {
    if (!interiorPointIds.has(id)) problems.push(`physical-turn acceptance references non-interior point ${id}`);
    else if (!transitionCandidates.get(id)?.physicalTurn) problems.push(`point ${id} has no physical-turn candidate to accept`);
  }
  for (const id of acceptedObstacles) {
    if (!interiorPointIds.has(id)) {
      problems.push(`obstacle acceptance references non-interior point ${id}`);
      continue;
    }
    const obstacle = transitionCandidates.get(id)?.obstacleContext?.value;
    if (!obstacle) problems.push(`point ${id} has no obstacle candidate to accept`);
    else if (obstacle !== "DOORWAY" && obstacle !== "WINDOW") {
      problems.push(`point ${id} obstacle ${obstacle} has no Route Assist graph mapping`);
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  // Copy, never mutate the caller's graph. The accepted graph can be shown for
  // confirmation before it replaces any UI state.
  const nextSegments: RouteSegment[] = segments.map((segment) => {
    const candidate = segmentCandidates.get(segment.id);
    return {
      ...segment,
      ...(acceptedLengths.includes(segment.id)
        ? { estimatedLengthFt: candidate!.measuredLengthFt!.value }
        : {}),
      ...(acceptedSurfaces.includes(segment.id)
        ? { surface: candidate!.surface!.value }
        : {}),
    };
  });

  const nextPoints: RoutePoint[] = points.map((point) => {
    const candidate = transitionCandidates.get(point.id);
    const obstacle = candidate?.obstacleContext?.value;
    return {
      ...point,
      ...(acceptedTurns.includes(point.id)
        ? { physicalTurn: candidate!.physicalTurn!.value }
        : {}),
      ...(acceptedObstacles.includes(point.id)
        ? { obstacle: obstacle as "DOORWAY" | "WINDOW" }
        : {}),
    };
  });

  return {
    ok: true,
    graph: {
      points: nextPoints,
      segments: nextSegments,
      applied: {
        measuredLengthSegmentIds: acceptedLengths,
        surfaceSegmentIds: acceptedSurfaces,
        physicalTurnPointIds: acceptedTurns,
        routeObstaclePointIds: acceptedObstacles,
      },
    },
  };
}
