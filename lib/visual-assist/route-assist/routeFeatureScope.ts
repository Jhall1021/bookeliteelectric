/**
 * Instance-scoping convention for route features (doorways, corners) within
 * one leg.
 *
 * factModel.ts's `scopeId` is deliberately opaque -- this is the one small
 * convention that gives doorway/corner facts a stable identity that doesn't
 * collide when a leg eventually has more than one of either. A leg-level
 * fact (WALL_PLANE, BASEBOARD_CONTINUITY) describes the leg as a whole and
 * stays scoped directly by `legScopeId`; a FEATURE fact (DOORWAY_*,
 * CORNER_*) describes one instance of that feature on the leg, so it's
 * scoped by `${kind}:${legScopeId}:${instance}` instead.
 *
 * This slice only ever evaluates instance 1 of each feature kind
 * (captureEscalation.ts is explicitly not implementing multi-doorway/corner
 * routing yet) -- the point of this module is only that adding a second
 * doorway later is "write facts at instance 2," never "invent a new
 * identity scheme," because the scheme already has room for it.
 */
export const ROUTE_ASSIST_FEATURE_KINDS_V1 = ["doorway", "corner"] as const;
export type RouteAssistFeatureKindV1 = (typeof ROUTE_ASSIST_FEATURE_KINDS_V1)[number];

export function routeAssistFeatureInstanceScopeIdV1(kind: RouteAssistFeatureKindV1, legScopeId: string, instance: number): string {
  return `${kind}:${legScopeId}:${instance}`;
}

/** The instance this slice evaluates for each feature kind. Not a limit encoded anywhere else -- callers may write instance 2+ today; the evaluator just doesn't look at them yet. */
export const ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1 = 1;
