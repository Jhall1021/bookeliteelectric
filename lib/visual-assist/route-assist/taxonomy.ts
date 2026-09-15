/**
 * The closed vocabularies Route Assist speaks.
 *
 * Same discipline as `../taxonomy.ts`: every enum a customer or a contractor
 * can see is one of these strings, and nothing else. Unlike the equipment-ID
 * taxonomies, none of this vocabulary is produced by a model in Phase 1 — a
 * customer taps a button that means one of these values. The closed-set
 * discipline still matters, because it's what keeps `geometry.ts` and
 * `invariants.ts` exhaustive: a UI that could emit an arbitrary string would
 * make both of those checks decorative.
 *
 * See ../../../docs/design/route-assist-v1.md for why this is a sibling
 * module under `visual-assist/` rather than a `VisualAssistTaskDefinition`.
 */

/** How the customer says they want the wiring installed. §8 of the brief. */
export const ROUTE_ASSIST_MODES = ["SURFACE", "CONCEALED", "UNSURE"] as const;
export type RouteAssistMode = (typeof ROUTE_ASSIST_MODES)[number];

/** What's being added at point B. §2 of the brief's supported use cases. */
export const ROUTE_ASSIST_DESTINATION_TYPES = [
  "RECEPTACLE",
  "SWITCH",
  "WALL_LIGHT",
  "CEILING_LIGHT",
  "SURFACE_BOX",
  "OTHER",
] as const;
export type RouteAssistDestinationType = (typeof ROUTE_ASSIST_DESTINATION_TYPES)[number];

/**
 * What a segment or a point sits on, by the customer's own tap — never
 * inferred from pixels. `UNKNOWN` covers "the customer didn't tag it,"
 * which is different from any of the other four and must stay distinguishable
 * so an untagged segment can't silently be treated as a wall run.
 */
export const ROUTE_SURFACES = ["WALL", "CEILING", "FLOOR", "UNKNOWN"] as const;
export type RouteSurface = (typeof ROUTE_SURFACES)[number];

/** What kind of point this is in the route graph. */
export const ROUTE_POINT_KINDS = ["SOURCE", "DESTINATION", "WAYPOINT"] as const;
export type RoutePointKind = (typeof ROUTE_POINT_KINDS)[number];

/**
 * An obstacle the customer has tagged a waypoint as routing around.
 *
 * Deliberately just these two. The brief also mentions "visible obstacle
 * detours" generally (§1), which is covered by a plain waypoint with no
 * obstacle tag at all — a corner the geometry math already counts. This
 * field exists only for the two cases the brief calls out as needing their
 * own counted field: doorways and windows (§7's
 * `doorwayBypassesCount`/`windowBypassesCount`).
 */
export const ROUTE_OBSTACLES = ["DOORWAY", "WINDOW"] as const;
export type RouteObstacle = (typeof ROUTE_OBSTACLES)[number];

/**
 * A LEGACY 2-D turn direction read from the customer-drawn polyline.
 *
 * IMPORTANT: this is not physical raceway fitting authority. A cross-product
 * in image space can tell which way the drawn line turns on the screen, but it
 * cannot prove whether the physical route uses an inside corner, an outside
 * corner, or a flat corner. Existing V1 aggregate logic still uses this type
 * for compatibility; new ordered geometry must use `RoutePhysicalTurn` below.
 */
export const ROUTE_TURN_DIRECTIONS = ["INSIDE", "OUTSIDE"] as const;
export type RouteTurnDirection = (typeof ROUTE_TURN_DIRECTIONS)[number];

/**
 * A physical, observable surface-route turn at a waypoint.
 *
 * This value may be set only when the capture/scan or an explicit human
 * observation establishes the physical fitting geometry. It must NEVER be
 * inferred merely from the left/right direction of a 2-D image-space line.
 * Absence is represented by null/undefined on the point, which means
 * "unknown / not established" rather than a guessed fitting.
 *
 * `SURFACE_CHANGE` is intentionally not part of this vocabulary. A change
 * from WALL to CEILING/FLOOR is derived from the adjacent segment surfaces
 * and remains a separate physical fact from a raceway corner fitting.
 */
export const ROUTE_PHYSICAL_TURNS = ["FLAT", "INSIDE", "OUTSIDE"] as const;
export type RoutePhysicalTurn = (typeof ROUTE_PHYSICAL_TURNS)[number];

/**
 * The only four words this system may use for concealed-route difficulty.
 * `UNCERTAIN` is not a failure state — it's a legitimate, honest answer
 * (§2.B of the brief), and it is what a route with contradictory or thin
 * tagging resolves to rather than a guessed midpoint.
 */
export const ROUTE_COMPLEXITIES = ["SIMPLE", "MODERATE", "COMPLEX", "UNCERTAIN"] as const;
export type RouteComplexity = (typeof ROUTE_COMPLEXITIES)[number];

/**
 * §22 of the brief, verbatim. Each is a reason `buildRouteAssistResult`
 * refused to produce a `RouteAssistResult` and produced a
 * `RouteAssistIncomplete` instead. Never combined with a fabricated result —
 * see invariants.ts #5.
 */
export const ROUTE_ASSIST_INCOMPLETE_REASONS = [
  "ROUTE_NOT_FULLY_VISIBLE",
  "SOURCE_NOT_CLEAR",
  "DESTINATION_NOT_CLEAR",
  "INSUFFICIENT_ROOM_CONTEXT",
  "MULTIPLE_POSSIBLE_ROUTES",
  "GEOMETRY_LOW_CONFIDENCE",
] as const;
export type RouteAssistIncompleteReason = (typeof ROUTE_ASSIST_INCOMPLETE_REASONS)[number];

/** §11 of the brief: the customer's response to the route overlay. */
export const ROUTE_ASSIST_CONFIRMATION_DECISIONS = ["ACCEPTED", "ADJUSTED", "RETAKE"] as const;
export type RouteAssistConfirmationDecision = (typeof ROUTE_ASSIST_CONFIRMATION_DECISIONS)[number];
