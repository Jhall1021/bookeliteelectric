import type { RouteAssistOrderedGeometryV1 } from "./orderedGeometry";

/**
 * Route Assist surface-raceway physical plan.
 *
 * This is physical scope only. It deliberately does not choose a Wiremold SKU,
 * box/fitting product, package quantity, labor allowance or price. Those remain
 * downstream MaterialTakeoff / contractor-economics responsibilities.
 */
export type RouteAssistObservedReceptacleV1 = {
  pointId: string;
  confirmedExistingReceptacle: boolean;
  /** Provider/geometry distance to the first requested destination, when known. */
  routeDistanceFt: number | null;
};

export type RouteAssistSurfaceRacewayDestinationKindV1 =
  | "OUTLET"
  | "SWITCH"
  | "LIGHT_FIXTURE";

export type RouteAssistSurfaceRacewayLegV1 = {
  index: number;
  fromPointId: string;
  toPointId: string;
  destinationKind: RouteAssistSurfaceRacewayDestinationKindV1;
  orderedGeometry: RouteAssistOrderedGeometryV1;
};

export type RouteAssistSurfaceRacewayPlanV1 = {
  version: 1;
  sourceReceptaclePointId: string;
  /** Observable physical scope fact: existing receptacle becomes raceway starter box. */
  convertSourceReceptacleToSurfaceRacewayBox: true;
  legs: RouteAssistSurfaceRacewayLegV1[];
};

/**
 * Pick the closest CONFIRMED existing receptacle for which a route distance is
 * actually known. Unknown/unconfirmed candidates are never promoted merely
 * because they look outlet-like in an image.
 */
export function chooseClosestSurfaceRacewaySourceV1(
  receptacles: RouteAssistObservedReceptacleV1[],
): RouteAssistObservedReceptacleV1 | null {
  const viable = receptacles
    .filter(
      (candidate) =>
        candidate.confirmedExistingReceptacle &&
        candidate.routeDistanceFt !== null &&
        Number.isFinite(candidate.routeDistanceFt) &&
        candidate.routeDistanceFt >= 0,
    )
    .sort((a, b) => (a.routeDistanceFt! - b.routeDistanceFt!) || a.pointId.localeCompare(b.pointId));

  return viable[0] ?? null;
}

/**
 * Build the ordered surface-raceway scope after the source has been confirmed.
 *
 * Outlet: source receptacle -> outlet.
 * Switch/light: source receptacle -> switch -> light fixture.
 *
 * Every leg must begin where the previous leg ended; malformed/disconnected
 * plans fail closed instead of inventing a hidden connection.
 */
export function buildSurfaceRacewayPlanV1(args: {
  sourceReceptaclePointId: string;
  legs: Array<{
    destinationKind: RouteAssistSurfaceRacewayDestinationKindV1;
    orderedGeometry: RouteAssistOrderedGeometryV1;
  }>;
}): RouteAssistSurfaceRacewayPlanV1 | null {
  if (!args.sourceReceptaclePointId || args.legs.length === 0) return null;

  let expectedSource = args.sourceReceptaclePointId;
  const legs: RouteAssistSurfaceRacewayLegV1[] = [];

  for (let index = 0; index < args.legs.length; index++) {
    const leg = args.legs[index];
    if (leg.orderedGeometry.sourcePointId !== expectedSource) return null;

    legs.push({
      index,
      fromPointId: leg.orderedGeometry.sourcePointId,
      toPointId: leg.orderedGeometry.destinationPointId,
      destinationKind: leg.destinationKind,
      orderedGeometry: leg.orderedGeometry,
    });
    expectedSource = leg.orderedGeometry.destinationPointId;
  }

  // A light fixture must be downstream of a switch in this V1 surface-raceway
  // use case; Route Assist must not silently model source -> light while claiming
  // the requested switch is part of the route.
  const lightIndex = legs.findIndex((leg) => leg.destinationKind === "LIGHT_FIXTURE");
  if (lightIndex >= 0) {
    if (lightIndex === 0 || legs[lightIndex - 1].destinationKind !== "SWITCH") return null;
  }

  return {
    version: 1,
    sourceReceptaclePointId: args.sourceReceptaclePointId,
    convertSourceReceptacleToSurfaceRacewayBox: true,
    legs,
  };
}
