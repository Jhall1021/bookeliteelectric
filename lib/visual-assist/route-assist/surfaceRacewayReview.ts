import type { RouteAssistRouteMeasurementReviewV1 } from "./routeMeasurementReview";
import type {
  RouteAssistSurfaceRacewayDestinationKindV1,
  RouteAssistSurfaceRacewayPlanV1,
} from "./surfaceRacewayPlan";

export type RouteAssistSurfaceRacewayReviewTransitionV1 = {
  pointId: string;
  physicalTurn: "FLAT" | "INSIDE" | "OUTSIDE" | null;
  obstacle: string | null;
};

export type RouteAssistSurfaceRacewayReviewLegV1 = {
  index: number;
  fromPointId: string;
  toPointId: string;
  destinationKind: RouteAssistSurfaceRacewayDestinationKindV1;
  segmentIds: string[];
  transitions: RouteAssistSurfaceRacewayReviewTransitionV1[];
};

/**
 * UI-safe payload for the homeowner's final proposed Wiremold route review.
 *
 * It describes what Route Assist proposes physically. It does not contain
 * material SKUs, package counts, labor, pricing, or automatic acceptance.
 */
export type RouteAssistSurfaceRacewayReviewV1 = {
  version: 1;
  source: {
    pointId: string;
    label: "Starting from this existing outlet";
    action: "CONVERT_TO_SURFACE_RACEWAY_STARTER_BOX";
  };
  legs: RouteAssistSurfaceRacewayReviewLegV1[];
  measurement: RouteAssistRouteMeasurementReviewV1;
  homeownerActions: readonly ["LOOKS_GOOD", "ADJUST_ROUTE"];
  fingerprint: string;
};

function fingerprintReview(
  sourcePointId: string,
  legs: RouteAssistSurfaceRacewayReviewLegV1[],
  measurement: RouteAssistRouteMeasurementReviewV1,
): string {
  return JSON.stringify({
    version: 1,
    sourcePointId,
    legs,
    measurement: {
      method: measurement.method,
      lengthFt: measurement.lengthFt,
      confidence: measurement.confidence,
      approximate: measurement.approximate,
      provenance: measurement.provenance,
    },
  });
}

export function buildSurfaceRacewayReviewV1(args: {
  plan: RouteAssistSurfaceRacewayPlanV1;
  measurement: RouteAssistRouteMeasurementReviewV1;
}): RouteAssistSurfaceRacewayReviewV1 {
  const legs = args.plan.legs.map((leg) => ({
    index: leg.index,
    fromPointId: leg.fromPointId,
    toPointId: leg.toPointId,
    destinationKind: leg.destinationKind,
    segmentIds: leg.orderedGeometry.segments.map((segment) => segment.segmentId),
    transitions: leg.orderedGeometry.transitions.map((transition) => ({
      pointId: transition.atPointId,
      physicalTurn: transition.physicalTurn,
      obstacle: transition.obstacleContext,
    })),
  }));

  return {
    version: 1,
    source: {
      pointId: args.plan.sourceReceptaclePointId,
      label: "Starting from this existing outlet",
      action: "CONVERT_TO_SURFACE_RACEWAY_STARTER_BOX",
    },
    legs,
    measurement: args.measurement,
    homeownerActions: ["LOOKS_GOOD", "ADJUST_ROUTE"],
    fingerprint: fingerprintReview(args.plan.sourceReceptaclePointId, legs, args.measurement),
  };
}
