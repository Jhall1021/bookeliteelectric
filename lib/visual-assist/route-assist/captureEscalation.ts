import { getRouteAssistFactV1, type RouteAssistFactStoreV1, type RouteAssistFactTypeV1 } from "./factModel";

/**
 * Deterministic capture-tier outcomes for one source->destination leg.
 *
 * Deliberately not something a model can decide by confidence or prose --
 * this is a pure function over already-written facts. A provider's job is to
 * PRODUCE facts (WALL_PLANE, CORNER_PRESENCE, doorway casings, ...); this
 * function's job is to look at what's actually locked/open and decide,
 * structurally, which of five outcomes that adds up to.
 *
 * WORLD_GEOMETRY_REQUIRED is defined for completeness (the escalation ceiling
 * this product direction names) but nothing in this module currently
 * produces it -- no photo-first fact this slice writes needs metric/world
 * geometry to interpret. It exists so a future caller that DOES need it
 * (e.g. a route whose scope genuinely requires calibrated measurement) has
 * a real state to return rather than overloading REVIEW_REQUIRED for two
 * different meanings.
 */
export const ROUTE_ASSIST_CAPTURE_ESCALATIONS_V1 = [
  "PHOTO_SUFFICIENT",
  "TARGETED_PHOTO_REQUIRED",
  "SWEEP_REQUIRED",
  "WORLD_GEOMETRY_REQUIRED",
  "REVIEW_REQUIRED",
] as const;
export type RouteAssistCaptureEscalationV1 = (typeof ROUTE_ASSIST_CAPTURE_ESCALATIONS_V1)[number];

export type RouteAssistCaptureEscalationResultV1 = {
  escalation: RouteAssistCaptureEscalationV1;
  reason: string;
  /** Populated only for TARGETED_PHOTO_REQUIRED -- exactly which open facts a next photo should target. */
  missingFactTypes: RouteAssistFactTypeV1[];
};

const DOORWAY_CASING_TYPES = ["DOORWAY_LEFT_CASING", "DOORWAY_TOP_CASING", "DOORWAY_RIGHT_CASING"] as const;

function booleanValue(fact: ReturnType<typeof getRouteAssistFactV1>): boolean | null {
  if (!fact || fact.value.kind !== "BOOLEAN") return null;
  return fact.value.value;
}

/**
 * Evaluate one leg (one source anchor, one destination anchor) against the
 * facts written so far. A leg is identified by `legScopeId` -- the scope
 * under which WALL_PLANE/CORNER_PRESENCE/doorway/baseboard facts for THIS
 * source->destination pair are written; anchors themselves are scoped by
 * their own label ("A", "B", ...), independent of which leg they belong to.
 *
 * Rule order matters and is deliberate:
 *   1. Both anchors must exist at all -- nothing else can be evaluated
 *      without them, and this is not itself an escalation decision.
 *   2. A structural "this cannot be a photo" signal (a real corner, or an
 *      explicitly broken plane/baseboard) always wins over any missing-fact
 *      count, because no additional still photo fixes it.
 *   3. Otherwise, any genuinely missing LOCAL fact means TARGETED_PHOTO_
 *      REQUIRED, naming exactly what's missing.
 *   4. Only when nothing is missing and nothing structural was found does
 *      this return PHOTO_SUFFICIENT.
 */
export function evaluateRouteAssistPhotoEscalationV1(args: {
  store: RouteAssistFactStoreV1;
  legScopeId: string;
  sourceScopeId: string;
  destinationScopeId: string;
}): RouteAssistCaptureEscalationResultV1 {
  const source = getRouteAssistFactV1(args.store, "SOURCE_ANCHOR", args.sourceScopeId);
  const destination = getRouteAssistFactV1(args.store, "DESTINATION_ANCHOR", args.destinationScopeId);
  if (!source || !destination) {
    return { escalation: "REVIEW_REQUIRED", reason: "source and destination anchors must both be placed before this leg can be evaluated", missingFactTypes: [] };
  }

  const corner = getRouteAssistFactV1(args.store, "CORNER_PRESENCE", args.legScopeId);
  if (booleanValue(corner) === true) {
    return { escalation: "SWEEP_REQUIRED", reason: "the route crosses a corner into another wall plane; a single photo cannot represent that", missingFactTypes: [] };
  }

  const wallPlane = getRouteAssistFactV1(args.store, "WALL_PLANE", args.legScopeId);
  if (booleanValue(wallPlane) === false) {
    return { escalation: "SWEEP_REQUIRED", reason: "source and destination are not on one continuous supported wall/trim plane", missingFactTypes: [] };
  }

  const baseboard = getRouteAssistFactV1(args.store, "BASEBOARD_CONTINUITY", args.legScopeId);
  if (booleanValue(baseboard) === false) {
    return { escalation: "SWEEP_REQUIRED", reason: "no visible continuous baseboard/trim between source and destination in this photo", missingFactTypes: [] };
  }

  const missing: RouteAssistFactTypeV1[] = [];
  if (!wallPlane) missing.push("WALL_PLANE");
  if (!baseboard) missing.push("BASEBOARD_CONTINUITY");

  const doorwayPresence = getRouteAssistFactV1(args.store, "DOORWAY_PRESENCE", args.legScopeId);
  if (!doorwayPresence) {
    missing.push("DOORWAY_PRESENCE");
  } else if (booleanValue(doorwayPresence) === true) {
    for (const casingType of DOORWAY_CASING_TYPES) {
      if (!getRouteAssistFactV1(args.store, casingType, args.legScopeId)) missing.push(casingType);
    }
    const casingsResolved = DOORWAY_CASING_TYPES.every((casingType) => getRouteAssistFactV1(args.store, casingType, args.legScopeId));
    if (casingsResolved && !getRouteAssistFactV1(args.store, "DOORWAY_ENTRY_SIDE", args.legScopeId)) missing.push("DOORWAY_ENTRY_SIDE");
  }

  if (missing.length > 0) {
    return { escalation: "TARGETED_PHOTO_REQUIRED", reason: `route is locally understandable but missing: ${missing.join(", ")}`, missingFactTypes: missing };
  }

  return { escalation: "PHOTO_SUFFICIENT", reason: "source and destination are on one supported wall plane with continuous baseboard and no unresolved local facts", missingFactTypes: [] };
}
