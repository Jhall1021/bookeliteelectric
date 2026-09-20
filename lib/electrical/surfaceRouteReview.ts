import { SURFACE_BOUNDS, SURFACE_ENDPOINT_RECIPE, type SurfaceEndpoint } from "../../prisma/_surfaceRouteModule";
import type { RoutingV2SurfacePhysicalFactProjectionV1, RoutingV2SurfacePhysicalFactsV1 } from "./routeAssistRoutingV2Facts";

export type ConfirmedSurfaceRouteFacts = {
  surfaceRouteFeet: number;
  insideCornerCount: number;
  outsideCornerCount: number;
  flatCornerCount: number;
};

export type SurfaceRouteReviewInput =
  | { source: "ROUTE_ASSIST_CONFIRMED"; explicitlyConfirmed: boolean; projection: RoutingV2SurfacePhysicalFactProjectionV1; confirmedFacts: ConfirmedSurfaceRouteFacts }
  | { source: "CONTRACTOR_MEASUREMENT"; explicitlyConfirmed: boolean; confirmedFacts: ConfirmedSurfaceRouteFacts };

export type ConfirmedSurfaceRouteReview = {
  source: SurfaceRouteReviewInput["source"];
  facts: ConfirmedSurfaceRouteFacts;
  components: { key: string; quantity: number }[];
  routeAssistCorrections: Partial<Record<keyof ConfirmedSurfaceRouteFacts, { proposed: number; confirmed: number }>>;
  automaticPriceApproval: false;
};

const integerInRange = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;

function validateFacts(facts: ConfirmedSurfaceRouteFacts): string[] {
  const problems: string[] = [];
  if (!Number.isFinite(facts.surfaceRouteFeet) || facts.surfaceRouteFeet < SURFACE_BOUNDS.feet.min || facts.surfaceRouteFeet > SURFACE_BOUNDS.feet.max) {
    problems.push(`surfaceRouteFeet must be between ${SURFACE_BOUNDS.feet.min} and ${SURFACE_BOUNDS.feet.max}`);
  }
  for (const key of ["insideCornerCount", "outsideCornerCount", "flatCornerCount"] as const) {
    if (!integerInRange(facts[key], SURFACE_BOUNDS.corners.min, SURFACE_BOUNDS.corners.max)) {
      problems.push(`${key} must be a whole number between ${SURFACE_BOUNDS.corners.min} and ${SURFACE_BOUNDS.corners.max}`);
    }
  }
  return problems;
}

function proposedFacts(projection: RoutingV2SurfacePhysicalFactProjectionV1): RoutingV2SurfacePhysicalFactsV1 {
  if (projection.state !== "COMPLETE" || !projection.facts) {
    throw new Error(`Route Assist geometry is incomplete: ${projection.blockers.join("; ") || "no complete physical facts"}`);
  }
  return projection.facts;
}

/**
 * Bind reviewed surface-route geometry to the shared Routing V2 vocabulary.
 * Route Assist evidence is a proposal, never authority by itself. This cannot
 * approve labor, materials, a service, or a customer price.
 */
export function confirmSurfaceRouteReview(endpoint: SurfaceEndpoint, input: SurfaceRouteReviewInput): ConfirmedSurfaceRouteReview {
  if (!input.explicitlyConfirmed) throw new Error("Contractor confirmation is required before surface-route facts can bind.");
  const problems = validateFacts(input.confirmedFacts);
  if (problems.length) throw new Error(problems.join("; "));

  const corrections: ConfirmedSurfaceRouteReview["routeAssistCorrections"] = {};
  if (input.source === "ROUTE_ASSIST_CONFIRMED") {
    const proposed = proposedFacts(input.projection);
    const pairs: [keyof ConfirmedSurfaceRouteFacts, number][] = [
      ["surfaceRouteFeet", proposed.surfaceRouteFt],
      ["insideCornerCount", proposed.insideCornerCount],
      ["outsideCornerCount", proposed.outsideCornerCount],
      ["flatCornerCount", proposed.flatCornerCount],
    ];
    for (const [key, value] of pairs) {
      if (value !== input.confirmedFacts[key]) corrections[key] = { proposed: value, confirmed: input.confirmedFacts[key] };
    }
  }

  const recipe = SURFACE_ENDPOINT_RECIPE[endpoint];
  const components = [
    { key: "ELEC_ROUTE_SURFACE_MOUNTED", quantity: 1 },
    { key: "SURFACE_ROUTE_FT", quantity: input.confirmedFacts.surfaceRouteFeet },
    { key: "SURFACE_ROUTE_INSIDE_CORNER", quantity: input.confirmedFacts.insideCornerCount },
    { key: "SURFACE_ROUTE_OUTSIDE_CORNER", quantity: input.confirmedFacts.outsideCornerCount },
    { key: "SURFACE_ROUTE_FLAT_CORNER", quantity: input.confirmedFacts.flatCornerCount },
    { key: recipe.core, quantity: 1 },
    { key: recipe.box, quantity: 1 },
  ].filter((component) => component.quantity > 0);

  return { source: input.source, facts: { ...input.confirmedFacts }, components, routeAssistCorrections: corrections, automaticPriceApproval: false };
}
