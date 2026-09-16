import { getRouteAssistFactV1, type RouteAssistFactStoreV1, type RouteAssistFactTypeV1 } from "./factModel";
import { ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1, routeAssistFeatureInstanceScopeIdV1 } from "./routeFeatureScope";

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
 * CORRECTION: a resolved DOORWAY_ENTRY_SIDE fact is not the same as a
 * PHYSICALLY resolved entry side. UNRESOLVED is a real, valid closed-set
 * value (visualSceneSemantics.ts) -- the provider's honest way of saying it
 * saw the doorway but couldn't determine which casing comes first. Treating
 * mere presence of the fact as satisfying the requirement let a doorway
 * reach PHOTO_SUFFICIENT with a genuinely unresolved entry side, which is
 * exactly the fail-open shape the hardening pass eliminated at the schema
 * level (entrySide validation) without eliminating it here, one layer up.
 * Only LEFT/RIGHT count as resolved; UNRESOLVED is treated identically to
 * the fact being missing entirely.
 */
function doorwayEntrySideResolved(fact: ReturnType<typeof getRouteAssistFactV1>): boolean {
  return Boolean(fact && fact.value.kind === "ENUM" && (fact.value.value === "LEFT" || fact.value.value === "RIGHT"));
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
 *   2. A visible plane transition (CORNER_PRESENCE=true) is NOT itself an
 *      escalation signal -- see the PRODUCT CORRECTION note below. Only a
 *      transition that genuinely leaves this photo's frustum (TRANSITION_
 *      CONTINUATION_IN_FRAME=false) forces SWEEP_REQUIRED; a transition
 *      that's merely locally obscured (TRANSITION_VISUALLY_CONNECTED=false)
 *      is TARGETED_PHOTO_REQUIRED; a fully resolved transition falls
 *      through to the same local-fact checks as a straight run.
 *   3. With NO transition present, WALL_PLANE=false still forces
 *      SWEEP_REQUIRED unchanged from before -- an unexplained plane break
 *      with no identified transition to resolve it is exactly the
 *      structural case this rule exists for.
 *   4. Otherwise, any genuinely missing or unresolved LOCAL fact means
 *      TARGETED_PHOTO_REQUIRED, naming exactly what's missing.
 *   5. Only when nothing is missing and nothing structural was found does
 *      this return PHOTO_SUFFICIENT.
 *
 * Doorway/corner facts are read at the leg's PRIMARY feature instance
 * (routeFeatureScope.ts) -- this function still only ever considers one
 * doorway and one corner per leg; multi-instance routing is not implemented
 * here, only the identity scheme that will let it be added without a fact
 * model change.
 *
 * CORRECTION PASS (baseboard): BASEBOARD_CONTINUITY previously forced
 * SWEEP_REQUIRED when false, on the theory that a broken baseboard meant
 * the route left the wall. That over-escalated real cases: cropping,
 * furniture, and simple occlusion can make a baseboard look discontinuous
 * in one photo without the underlying route being unsupported. BASEBOARD_
 * CONTINUITY now only ever contributes to TARGETED_PHOTO_REQUIRED.
 *
 * PRODUCT CORRECTION (corner): CORNER_PRESENCE=true previously forced
 * SWEEP_REQUIRED unconditionally, on the theory that any plane change means
 * the route leaves what one photo can show. That's also over-escalation: a
 * fully visible connected transition (`A outlet -> wall 1 -> visible inside
 * corner -> wall 2 -> B outlet`, all in one frame) is exactly the kind of
 * case photo-first exists to resolve without a sweep. See factModel.ts's
 * TRANSITION_VISUALLY_CONNECTED/TRANSITION_CONTINUATION_IN_FRAME for what
 * now actually decides this.
 *
 * PRODUCT CORRECTION (doorway bypass is an ALTERNATIVE local-trim path, not
 * an additional requirement on top of baseboard): a real doorway physically
 * interrupts baseboard continuity by construction -- the trim run at a
 * doorway opening legitimately goes wall/trim -> side casing -> top casing
 * -> opposite side casing -> wall/trim, not wall/trim -> [gap] -> wall/trim.
 * Requiring BASEBOARD_CONTINUITY=true (or even just written) UNCONDITIONALLY,
 * even once the doorway and every casing are fully resolved, forced
 * TARGETED_PHOTO_REQUIRED on a leg that was actually completely
 * characterized. A fully resolved doorway bypass -- DOORWAY_PRESENCE=true,
 * all three casings present, and DOORWAY_ENTRY_SIDE resolved to LEFT/RIGHT
 * -- now substitutes for baseboard continuity across the opening: once that
 * bypass is established, BASEBOARD_CONTINUITY no longer independently
 * contributes to `missing`, regardless of its own value. This is an
 * ALTERNATIVE path, not a global relaxation: an ordinary wall route (no
 * doorway, or a doorway not yet fully characterized) still requires
 * baseboard continuity exactly as before.
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

  const doorwayScopeId = routeAssistFeatureInstanceScopeIdV1("doorway", args.legScopeId, ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1);
  const cornerScopeId = routeAssistFeatureInstanceScopeIdV1("corner", args.legScopeId, ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1);
  const missing: RouteAssistFactTypeV1[] = [];

  const corner = getRouteAssistFactV1(args.store, "CORNER_PRESENCE", cornerScopeId);
  const cornerConfirmed = booleanValue(corner) === true;

  if (cornerConfirmed) {
    const continuationInFrame = getRouteAssistFactV1(args.store, "TRANSITION_CONTINUATION_IN_FRAME", cornerScopeId);
    if (booleanValue(continuationInFrame) === false) {
      return { escalation: "SWEEP_REQUIRED", reason: "the route continues beyond the visible transition in a way this photo cannot establish; sequential cross-view topology is genuinely needed", missingFactTypes: [] };
    }
    const visuallyConnected = getRouteAssistFactV1(args.store, "TRANSITION_VISUALLY_CONNECTED", cornerScopeId);
    if (booleanValue(visuallyConnected) === false) {
      return { escalation: "TARGETED_PHOTO_REQUIRED", reason: "a visible transition exists but is not clearly connected in this photo (occlusion/framing); a closer look at that transition may resolve it", missingFactTypes: ["TRANSITION_VISUALLY_CONNECTED"] };
    }
    if (!continuationInFrame) missing.push("TRANSITION_CONTINUATION_IN_FRAME");
    if (!visuallyConnected) missing.push("TRANSITION_VISUALLY_CONNECTED");
    if (missing.length > 0) {
      return { escalation: "TARGETED_PHOTO_REQUIRED", reason: `a visible transition exists but is not yet fully characterized: ${missing.join(", ")}`, missingFactTypes: missing };
    }
    // Both confirmed true: the transition is fully resolved from this one
    // photo. Fall through to the same local-fact checks a straight,
    // transition-free run would go through -- WALL_PLANE is not consulted
    // here, since a resolved transition legitimately means the route is
    // NOT one flat plane, which is no longer itself a problem.
  } else {
    const wallPlane = getRouteAssistFactV1(args.store, "WALL_PLANE", args.legScopeId);
    if (booleanValue(wallPlane) === false) {
      return { escalation: "SWEEP_REQUIRED", reason: "source and destination are not on one continuous supported wall/trim plane, and no visible transition was identified to explain the break", missingFactTypes: [] };
    }
    if (!wallPlane) missing.push("WALL_PLANE");
  }

  // Doorway resolution is computed BEFORE the baseboard check below, because
  // a fully resolved doorway bypass changes whether baseboard continuity is
  // even required for this leg -- see the PRODUCT CORRECTION note above.
  const doorwayPresence = getRouteAssistFactV1(args.store, "DOORWAY_PRESENCE", doorwayScopeId);
  let fullyResolvedDoorwayBypass = false;
  if (!doorwayPresence) {
    missing.push("DOORWAY_PRESENCE");
  } else if (booleanValue(doorwayPresence) === true) {
    for (const casingType of DOORWAY_CASING_TYPES) {
      if (!getRouteAssistFactV1(args.store, casingType, doorwayScopeId)) missing.push(casingType);
    }
    const casingsResolved = DOORWAY_CASING_TYPES.every((casingType) => getRouteAssistFactV1(args.store, casingType, doorwayScopeId));
    const entrySideResolved = doorwayEntrySideResolved(getRouteAssistFactV1(args.store, "DOORWAY_ENTRY_SIDE", doorwayScopeId));
    if (casingsResolved && !entrySideResolved) missing.push("DOORWAY_ENTRY_SIDE");
    fullyResolvedDoorwayBypass = casingsResolved && entrySideResolved;
  }

  // A fully resolved doorway bypass substitutes for baseboard continuity
  // across the opening -- the trim run legitimately leaves the baseboard
  // plane there. Otherwise, the existing requirement is unchanged: missing
  // or explicitly false baseboard continuity means TARGETED_PHOTO_REQUIRED.
  if (!fullyResolvedDoorwayBypass) {
    const baseboard = getRouteAssistFactV1(args.store, "BASEBOARD_CONTINUITY", args.legScopeId);
    if (!baseboard || booleanValue(baseboard) === false) missing.push("BASEBOARD_CONTINUITY");
  }

  if (missing.length > 0) {
    return { escalation: "TARGETED_PHOTO_REQUIRED", reason: `route is locally understandable but missing: ${missing.join(", ")}`, missingFactTypes: missing };
  }

  return {
    escalation: "PHOTO_SUFFICIENT",
    reason: cornerConfirmed
      ? "source and destination are connected by a fully visible, resolved transition, with a fully visible supported wall/trim path and no unresolved local facts"
      : "source and destination are connected by a fully visible supported wall/trim path with no unresolved local facts",
    missingFactTypes: [],
  };
}
