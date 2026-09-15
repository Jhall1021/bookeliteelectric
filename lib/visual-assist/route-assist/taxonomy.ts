/**
 * The closed vocabularies Route Assist speaks.
 *
 * Route Assist records observable physical facts and homeowner placement
 * intent. It never owns pricing, diagnosis, code compliance, hidden framing,
 * or material/labor decisions.
 */

/** How the customer says they want the wiring installed. */
export const ROUTE_ASSIST_MODES = ["SURFACE", "CONCEALED", "UNSURE"] as const;
export type RouteAssistMode = (typeof ROUTE_ASSIST_MODES)[number];

/** What the homeowner is placing at the end of, or within, a capture. */
export const ROUTE_ASSIST_DESTINATION_TYPES = [
  "RECEPTACLE",
  "SWITCH",
  "WALL_LIGHT",
  "CEILING_LIGHT",
  "CEILING_FAN",
  "RECESSED_LIGHT",
  "SURFACE_BOX",
  "OTHER",
] as const;
export type RouteAssistDestinationType = (typeof ROUTE_ASSIST_DESTINATION_TYPES)[number];

/** Physical surface occupied by a point/segment. */
export const ROUTE_SURFACES = ["WALL", "CEILING", "FLOOR", "UNKNOWN"] as const;
export type RouteSurface = (typeof ROUTE_SURFACES)[number];

/** What kind of point this is in the single SOURCE -> DESTINATION route graph. */
export const ROUTE_POINT_KINDS = ["SOURCE", "DESTINATION", "WAYPOINT"] as const;
export type RoutePointKind = (typeof ROUTE_POINT_KINDS)[number];

/** Two obstacle classes retained by the original manual capture. */
export const ROUTE_OBSTACLES = ["DOORWAY", "WINDOW"] as const;
export type RouteObstacle = (typeof ROUTE_OBSTACLES)[number];

/**
 * LEGACY image-space turn direction.
 *
 * This is retained for V1 compatibility only. A 2-D cross-product can tell
 * which way a line turns on a photo; it cannot prove which physical raceway
 * fitting is present. New ordered/scan geometry must use RoutePhysicalTurn.
 */
export const ROUTE_TURN_DIRECTIONS = ["INSIDE", "OUTSIDE"] as const;
export type RouteTurnDirection = (typeof ROUTE_TURN_DIRECTIONS)[number];

/**
 * A physically established surface-route turn.
 *
 * It may be supplied only by calibrated/world geometry or explicit human
 * confirmation. It must never be inferred merely from a screen-space bend.
 */
export const ROUTE_PHYSICAL_TURNS = ["FLAT", "INSIDE", "OUTSIDE"] as const;
export type RoutePhysicalTurn = (typeof ROUTE_PHYSICAL_TURNS)[number];

/** The capture experience requested by the service invocation. */
export const ROUTE_ASSIST_CAPTURE_KINDS = ["ROUTE", "PLACEMENT_LAYOUT"] as const;
export type RouteAssistCaptureKind = (typeof ROUTE_ASSIST_CAPTURE_KINDS)[number];

/** Concealed-route difficulty remains a conservative summary, not diagnosis. */
export const ROUTE_COMPLEXITIES = ["SIMPLE", "MODERATE", "COMPLEX", "UNCERTAIN"] as const;
export type RouteComplexity = (typeof ROUTE_COMPLEXITIES)[number];

/** Reasons capture can refuse rather than invent geometry. */
export const ROUTE_ASSIST_INCOMPLETE_REASONS = [
  "ROUTE_NOT_FULLY_VISIBLE",
  "SOURCE_NOT_CLEAR",
  "DESTINATION_NOT_CLEAR",
  "INSUFFICIENT_ROOM_CONTEXT",
  "MULTIPLE_POSSIBLE_ROUTES",
  "GEOMETRY_LOW_CONFIDENCE",
] as const;
export type RouteAssistIncompleteReason = (typeof ROUTE_ASSIST_INCOMPLETE_REASONS)[number];

/** Customer confirmation of the proposed route/layout. */
export const ROUTE_ASSIST_CONFIRMATION_DECISIONS = ["ACCEPTED", "ADJUSTED", "RETAKE"] as const;
export type RouteAssistConfirmationDecision = (typeof ROUTE_ASSIST_CONFIRMATION_DECISIONS)[number];
