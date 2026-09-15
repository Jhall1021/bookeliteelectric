export type RouteFactLengthSource =
  | "ROUTE_ASSIST_MEASURED"
  | "CUSTOMER_ENTERED"
  | "CONTRACTOR_POLICY"
  | "OTHER_EXPLICIT"
  | "UNRESOLVED";

export type RouteFactRouteClass =
  | "INTERIOR"
  | "EXTERIOR_SURFACE"
  | "UNDERGROUND"
  | "OTHER"
  | "UNRESOLVED";

export type RouteFactEnvironment = "DRY" | "WET" | "UNRESOLVED";

export type RouteFactReviewState = "CONFIRMED" | "REVIEW_REQUIRED" | "UNRESOLVED";

/**
 * Shared, pricing-neutral physical route fact.
 *
 * Route Assist remains authoritative for geometry. This contract intentionally
 * carries only one route quantity plus stable references into the existing
 * route graph/evidence. It is not a second route graph and has no material,
 * labor, price, cost, or electrical-design fields.
 */
export type RouteFact = {
  routeId: string;
  lengthFt: number | null;
  lengthSource: RouteFactLengthSource;
  routeClass: RouteFactRouteClass;
  environment: RouteFactEnvironment;
  orderedSegmentRefs: string[];
  observableEventRefs: string[];
  reviewState: RouteFactReviewState;
};
