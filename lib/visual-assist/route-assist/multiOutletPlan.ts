export type RouteAssistPlanPoint = {
  x: number;
  y: number;
};

export type RouteAssistOutletEndpoint = {
  id: string;
  label: string;
  point: RouteAssistPlanPoint;
};

export type RouteAssistOutletLeg = {
  id: string;
  ordinal: number;
  fromEndpointId: string;
  toEndpointId: string;
  fromLabel: string;
  toLabel: string;
  source: RouteAssistPlanPoint;
  destination: RouteAssistPlanPoint;
};

/**
 * Compose a homeowner's ordered multi-outlet plan into ordinary Route Assist
 * legs. This is intentionally not a second routing engine: every returned leg
 * is still an independent A->B-shaped route that must go through the existing
 * scan/evidence/review/result pipeline.
 *
 * Example: A + [B, C, D] => A->B, B->C, C->D.
 */
export function buildOrderedOutletLegs(
  source: RouteAssistOutletEndpoint,
  newOutlets: readonly RouteAssistOutletEndpoint[],
): RouteAssistOutletLeg[] {
  const legs: RouteAssistOutletLeg[] = [];
  let previous = source;

  newOutlets.forEach((endpoint, index) => {
    legs.push({
      id: `outlet-leg-${index + 1}`,
      ordinal: index + 1,
      fromEndpointId: previous.id,
      toEndpointId: endpoint.id,
      fromLabel: previous.label,
      toLabel: endpoint.label,
      source: { ...previous.point },
      destination: { ...endpoint.point },
    });
    previous = endpoint;
  });

  return legs;
}
