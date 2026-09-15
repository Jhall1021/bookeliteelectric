import type {
  RouteFact,
  RouteFactEnvironment,
  RouteFactLengthSource,
  RouteFactRouteClass,
  RouteFactReviewState,
} from "../../routing/routeFact";
import { orderRoute } from "./geometry";
import type { RouteAssistResult } from "./types";

export type RouteAssistRouteFactContextV1 = {
  routeId: string;
  /** Facts outside Route Assist authority must be supplied explicitly. */
  routeClass?: RouteFactRouteClass;
  environment?: RouteFactEnvironment;
  /**
   * Optional explicit provenance override. Current V1 segment footage is
   * customer/contractor-entered, not image-derived measurement, so omission
   * resolves to OTHER_EXPLICIT rather than claiming ROUTE_ASSIST_MEASURED.
   */
  lengthSource?: Exclude<RouteFactLengthSource, "UNRESOLVED">;
};

function reviewState(result: RouteAssistResult): RouteFactReviewState {
  if (result.customerConfirmedRoute && !result.needsContractorReview) return "CONFIRMED";
  if (!result.customerConfirmedRoute && !result.needsContractorReview) return "UNRESOLVED";
  return "REVIEW_REQUIRED";
}

function observableEventRefs(result: RouteAssistResult, orderedPointIds: string[]): string[] {
  const pointById = new Map(result.points.map((point) => [point.id, point]));
  const orderedSegments = orderRoute(result.points, result.segments)?.segments ?? [];
  const refs: string[] = [];

  for (let index = 1; index < orderedPointIds.length - 1; index++) {
    const pointId = orderedPointIds[index];
    const point = pointById.get(pointId);
    if (!point) continue;

    const before = orderedSegments[index - 1];
    const after = orderedSegments[index];
    const surfaceTransition =
      before?.surface &&
      after?.surface &&
      before.surface !== "UNKNOWN" &&
      after.surface !== "UNKNOWN" &&
      before.surface !== after.surface;

    // Reuse the existing Route Assist waypoint identity. No new obstacle or
    // transition detection capability is invented by this projection.
    if (point.obstacle || point.physicalTurn || surfaceTransition) refs.push(pointId);
  }

  return refs;
}

/**
 * Pure Route Assist -> shared physical route projection.
 *
 * It never reads storage, resolves materials, selects conductors, or prices
 * work. Geometry stays in Route Assist; RouteFact receives only one legitimate
 * route quantity plus ordered references back to the authoritative graph.
 */
export function routeAssistResultToRouteFactV1(
  result: RouteAssistResult,
  context: RouteAssistRouteFactContextV1
): RouteFact | null {
  if (!context.routeId) return null;

  const ordered = orderRoute(result.points, result.segments);
  if (
    !ordered ||
    ordered.points.length !== result.points.length ||
    ordered.segments.length !== result.segments.length
  ) {
    return null;
  }

  const legitimateLength =
    result.estimatedTotalRouteLengthFt !== null &&
    Number.isFinite(result.estimatedTotalRouteLengthFt) &&
    result.estimatedTotalRouteLengthFt > 0
      ? result.estimatedTotalRouteLengthFt
      : null;

  return {
    routeId: context.routeId,
    lengthFt: legitimateLength,
    lengthSource:
      legitimateLength === null
        ? "UNRESOLVED"
        : context.lengthSource ?? "OTHER_EXPLICIT",
    routeClass: context.routeClass ?? "UNRESOLVED",
    environment: context.environment ?? "UNRESOLVED",
    orderedSegmentRefs: ordered.segments.map((segment) => segment.id),
    observableEventRefs: observableEventRefs(result, ordered.points.map((point) => point.id)),
    reviewState: reviewState(result),
  };
}
