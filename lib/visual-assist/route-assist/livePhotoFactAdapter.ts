import {
  removeRouteAssistFactsV1,
  routeAssistFactIdV1,
  writeRouteAssistFactV1,
  type RouteAssistFactStoreV1,
  type RouteAssistFactTypeV1,
  type RouteAssistFactValueV1,
} from "./factModel";
import { ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1, routeAssistFeatureInstanceScopeIdV1 } from "./routeFeatureScope";
import type { RouteAssistVisibleSceneObjectV1, RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";

/**
 * Translates ALREADY-VALIDATED whole-scene semantics for one photo into
 * atomic fact writes.
 *
 * "Already validated" is load-bearing: this module never calls the vision
 * provider and never runs validateRouteAssistVisibleSceneSemanticsV1 itself
 * -- the caller (the API route) must have run the semantics through
 * runRouteAssistVisibleSceneProviderV1 first. That upstream validation is
 * what already rejects an unauthorized image id, an unknown object kind, or
 * an unrecognized entrySide before this function ever sees the data — this
 * module's own job is narrower: given trustworthy semantics, decide which
 * OPEN atomic facts they support, and write only those.
 *
 * ALLOWLIST, not just discipline: every call this module makes into
 * writeRouteAssistFactV1 names a type from ROUTE_ASSIST_LIVE_PHOTO_FACT_
 * TYPES_V1. assertAllowedFactType throws if that ever drifts — a genuine
 * bug, not a data problem — rather than silently trusting that nobody adds
 * a call writing SOURCE_ANCHOR/DESTINATION_ANCHOR here later. factModel.ts's
 * own provenance check would refuse such a write anyway (this module always
 * writes with VISION_PROVIDER provenance, and anchors are homeowner-only),
 * so this is defense in depth, not the only thing stopping it.
 *
 * ONE PHOTO, ONE IMAGE ID: "between the anchors" is decided by image-space
 * x-position within this single frame — the same object/anchor coordinate
 * space, not a cross-frame inference. That's a legitimate 2D fact for
 * objects sharing a frame with the taps, per the photo-first design review.
 *
 * WALL_PLANE and CORNER_PRESENCE are derived from the SAME signal (the
 * presence or absence of a visible CORNER object between the anchors)
 * rather than asked of the model twice — a single still photo either shows
 * a plane change between the anchors or it doesn't; asking for both
 * separately would let a model self-contradict for no benefit.
 *
 * PRODUCT CORRECTION: when a CORNER object IS found, this adapter also
 * derives TRANSITION_VISUALLY_CONNECTED and TRANSITION_CONTINUATION_IN_
 * FRAME (factModel.ts) rather than leaving evaluateRouteAssistPhotoEscalationV1
 * to treat every corner as an automatic sweep. Both are derived from
 * signals the schema already carries -- no new provider-facing field was
 * added for this correction.
 *
 * CONSERVATIVE-EVIDENCE CORRECTION: TRANSITION_VISUALLY_CONNECTED and
 * TRANSITION_CONTINUATION_IN_FRAME are NOT written true merely because a
 * plausible object exists somewhere nearby. "Baseboard object exists on
 * both sides" and "a destination marker was found" are real signals, but
 * on their own they are existence checks, not proof the objects are part
 * of one connected, visible run -- baseboard can appear on both sides of a
 * corner while the actual connecting section is occluded; a destination
 * marker can be visible while the physical link from the corner to it is
 * not established. So this adapter requires COHERENCE: an explicit
 * segmentObservation for this leg's own segment, at or above
 * CONSERVATIVE_EVIDENCE_CONFIDENCE_FLOOR_V1 confidence, naming the corner
 * (and, for TRANSITION_CONTINUATION_IN_FRAME, the destination) -- the same
 * discipline doorwayGroups already uses (an explicit, structured tie, not
 * co-occurrence). Per fact:
 *   - TRUE only when that coherent, confident tie exists (and, for
 *     TRANSITION_VISUALLY_CONNECTED, no disqualifying quality issue --
 *     see the STRUCTURAL-VISIBILITY CORRECTION below).
 *   - FALSE only on strong, direct STRUCTURAL negative evidence that the
 *     schema can actually express as a real absence. As of this pass,
 *     NEITHER transition fact has such a signal: "no DESTINATION_MARKER
 *     object was matched" (TRANSITION_CONTINUATION_IN_FRAME, corrected in
 *     an earlier pass) does not prove the route leaves the visible scene,
 *     only that this adapter didn't find one. Since false deterministically
 *     forces an escalation (TARGETED_PHOTO_REQUIRED or SWEEP_REQUIRED --
 *     captureEscalation.ts), writing it on absence-of-evidence over-
 *     escalates a usable photo. This adapter therefore never writes false
 *     for either transition fact today; it will again if a future
 *     perception schema adds a real structural negative signal for one of
 *     them.
 *   - Otherwise UNWRITTEN (OPEN): objects exist (or are simply missing),
 *     but nothing PROVES a confident claim either way. Ambiguous, and left
 *     that way rather than promoted to true or manufactured as false --
 *     evaluateRouteAssistPhotoEscalationV1 then correctly asks for a
 *     targeted photo instead of proceeding on a heuristic or escalating to
 *     a sweep it hasn't earned.
 *
 * STRUCTURAL-VISIBILITY CORRECTION (TRANSITION_VISUALLY_CONNECTED):
 * baseboard visible on BOTH sides used to be the sole proof channel for
 * this fact -- too conservative. A real phone test showed a genuinely
 * usable photo (corner clearly visible, both adjoining wall planes visible,
 * continuation confirmed, baseboard itself confirmed continuous) still
 * asking for another photo merely because movable furniture (a couch, end
 * table, chair, plant stand, ...) blocked part of the lower wall in one
 * frame region the adapter happened to check. Visible structural continuity
 * beats movable-furniture occlusion: baseboard is now SUPPORTING evidence,
 * not the sole authority over wall topology. TRUE now requires only that
 * the CORNER itself is named in a coherent, confident segmentObservation
 * for this leg's segment -- the provider's own structured claim that it
 * examined this segment and found one connected surface, independent of
 * whether baseboard specifically was visible on either side. This is still
 * never mere co-occurrence: a corner merely existing somewhere in frame,
 * with no segmentObservation backing it, still leaves the fact OPEN exactly
 * as before. Near/far baseboard objects, when present, are still passed as
 * additional evidenceImageIds -- real supporting evidence, just no longer
 * gating.
 *
 * The one guard against this being too permissive: if any qualityIssue
 * names this exact image (imageIds includes cornerObject.imageId), TRUE is
 * withheld regardless of segment coherence. A provider that flags
 * INSUFFICIENT_VISIBLE_ROUTE_CONTEXT (or any other quality issue) on this
 * image is explicitly saying it could NOT confidently assess the visible
 * route here -- exactly the signal for a FIXED route-critical obstruction
 * (a built-in cabinet, hearth, radiator/baseboard heater, another doorway
 * or corner, or anything else that could hide real structural topology)
 * rather than ordinary movable furniture the provider saw past. Movable
 * furniture and fixed obstructions are not distinguished by object kind --
 * this schema has no such taxonomy, and none was added here -- they are
 * distinguished by whether the PROVIDER, having seen the obstruction,
 * still had enough confidence to assert a coherent segment (movable) or
 * instead flagged the image as insufficiently clear (fixed/ambiguous). This
 * adapter trusts that provider-declared signal rather than inventing its
 * own geometric inference -- no hidden wiring, no assumed-continuous wall
 * behind an obstruction this adapter cannot itself see past.
 *
 * DOORWAY_PRESENCE follows the exact same principle: a photo with no
 * DOORWAY object found is not proof no doorway exists -- a model miss,
 * framing, or occlusion looks identical to a genuinely doorway-free wall.
 * This adapter writes DOORWAY_PRESENCE=true only when a DOORWAY object is
 * actually found; otherwise it leaves the fact OPEN rather than writing
 * false. A future provider-supported explicit negative signal (e.g.
 * NO_DOORWAY_PRESENT) could justify writing false; today's schema has no
 * such signal.
 */
const CONSERVATIVE_EVIDENCE_CONFIDENCE_FLOOR_V1 = 0.75;
const ROUTE_ASSIST_LIVE_PHOTO_FACT_TYPES_V1: ReadonlySet<RouteAssistFactTypeV1> = new Set([
  "WALL_PLANE",
  "BASEBOARD_CONTINUITY",
  "DOORWAY_PRESENCE",
  "DOORWAY_LEFT_CASING",
  "DOORWAY_TOP_CASING",
  "DOORWAY_RIGHT_CASING",
  "DOORWAY_ENTRY_SIDE",
  "CORNER_PRESENCE",
  "CORNER_KIND",
  "TRANSITION_VISUALLY_CONNECTED",
  "TRANSITION_CONTINUATION_IN_FRAME",
  "WINDOW",
  "VISIBLE_OBSTACLE",
  "ANCHOR_OBJECT_MATCH",
]);

function assertAllowedFactType(type: RouteAssistFactTypeV1): void {
  if (!ROUTE_ASSIST_LIVE_PHOTO_FACT_TYPES_V1.has(type)) {
    throw new Error(`livePhotoFactAdapter attempted to write ${type}, which is outside its allowed fact types -- this is a bug in the adapter, not a data problem`);
  }
}

export type RouteAssistLivePhotoFactApplicationV1 = {
  store: RouteAssistFactStoreV1;
  problems: string[];
};

function objectCenterX(object: RouteAssistVisibleSceneObjectV1): number {
  return object.box.x + object.box.width / 2;
}

function isBetweenAnchorsV1(object: RouteAssistVisibleSceneObjectV1, imageId: string, minX: number, maxX: number): boolean {
  return object.imageId === imageId && objectCenterX(object) >= minX && objectCenterX(object) <= maxX;
}

const ROUTE_ASSIST_LEG_SCOPED_PHOTO_EVIDENCE_TYPES_V1: readonly RouteAssistFactTypeV1[] = ["WALL_PLANE", "BASEBOARD_CONTINUITY", "WINDOW", "VISIBLE_OBSTACLE"];
const ROUTE_ASSIST_CORNER_SCOPED_PHOTO_EVIDENCE_TYPES_V1: readonly RouteAssistFactTypeV1[] = ["CORNER_PRESENCE", "CORNER_KIND", "TRANSITION_VISUALLY_CONNECTED", "TRANSITION_CONTINUATION_IN_FRAME"];
const ROUTE_ASSIST_DOORWAY_SCOPED_PHOTO_EVIDENCE_TYPES_V1: readonly RouteAssistFactTypeV1[] = ["DOORWAY_PRESENCE", "DOORWAY_LEFT_CASING", "DOORWAY_TOP_CASING", "DOORWAY_RIGHT_CASING", "DOORWAY_ENTRY_SIDE"];

/**
 * CAPTURE/INTERPRETATION LIFECYCLE BOUNDARY: starts a fresh evidence cycle
 * for one leg by dropping every fact THIS adapter itself could have
 * written for a PRIOR photo of the same leg -- before a caller applies a
 * NEW photo's semantics.
 *
 * A real phone test hit exactly the gap this closes: interpreting a second
 * photo for the same leg in one session reused the same legScopeId/
 * doorwayScopeId/cornerScopeId as the first, so every fact the first photo
 * had locked (WALL_PLANE, CORNER_PRESENCE, BASEBOARD_CONTINUITY,
 * ANCHOR_OBJECT_MATCH, ...) refused the second photo's writes with
 * REFUSED_LOCKED -- leaving a mixture of stale locked state and whatever
 * new evidence happened to land on still-open facts, not a clean
 * reinterpretation.
 *
 * This is a DELETION at the capture-lifecycle boundary, not a change to
 * lock semantics: removeRouteAssistFactsV1 (factModel.ts) drops rows
 * entirely, so writeRouteAssistFactV1's LOCKED refusal is completely
 * unchanged and still applies to every fact NOT named here, and to a caller
 * that reapplies WITHOUT calling this reset first (see
 * verify-route-assist-live-photo-interpretation.ts's "re-applying the
 * adapter to an already-interpreted leg is refused" test, which stays
 * exactly as strict as before -- this function is an explicit, deliberate
 * signal that a new evidence cycle is starting, never an implicit one).
 *
 * SOURCE_ANCHOR/DESTINATION_ANCHOR (the homeowner's own placements) are
 * never touched -- they are a different fact TYPE than ANCHOR_OBJECT_MATCH
 * even though they share the same scopeId ("A", "B", ...), and homeowner
 * intent must survive reinterpretation exactly as before.
 */
export function resetRouteAssistLegPhotoEvidenceV1(args: {
  store: RouteAssistFactStoreV1;
  legScopeId: string;
  sourcePointId: string;
  destinationPointId: string;
}): RouteAssistFactStoreV1 {
  const doorwayScopeId = routeAssistFeatureInstanceScopeIdV1("doorway", args.legScopeId, ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1);
  const cornerScopeId = routeAssistFeatureInstanceScopeIdV1("corner", args.legScopeId, ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1);
  const factIds = [
    ...ROUTE_ASSIST_LEG_SCOPED_PHOTO_EVIDENCE_TYPES_V1.map((type) => routeAssistFactIdV1(type, args.legScopeId)),
    ...ROUTE_ASSIST_CORNER_SCOPED_PHOTO_EVIDENCE_TYPES_V1.map((type) => routeAssistFactIdV1(type, cornerScopeId)),
    ...ROUTE_ASSIST_DOORWAY_SCOPED_PHOTO_EVIDENCE_TYPES_V1.map((type) => routeAssistFactIdV1(type, doorwayScopeId)),
    routeAssistFactIdV1("ANCHOR_OBJECT_MATCH", args.sourcePointId),
    routeAssistFactIdV1("ANCHOR_OBJECT_MATCH", args.destinationPointId),
  ];
  return removeRouteAssistFactsV1(args.store, factIds);
}

/**
 * Apply one photo's validated semantics to the fact store for one leg.
 * Every write uses VISION_PROVIDER provenance and locks on write -- this is
 * a single still photo's one-shot interpretation, not an iterative targeted
 * round (see the report's Open Issues for why targeted resolution of these
 * same fact types is deliberately not built yet).
 */
export function applyRouteAssistLiveVisibleSceneFactsV1(args: {
  store: RouteAssistFactStoreV1;
  semantics: RouteAssistVisibleSceneSemanticsV1;
  legScopeId: string;
  sourcePointId: string;
  destinationPointId: string;
  imageId: string;
  sourceAnchor: { x: number; y: number };
  destinationAnchor: { x: number; y: number };
  providerKey: string;
}): RouteAssistLivePhotoFactApplicationV1 {
  const problems: string[] = [];
  let store = args.store;
  const at = new Date().toISOString();
  const minX = Math.min(args.sourceAnchor.x, args.destinationAnchor.x);
  const maxX = Math.max(args.sourceAnchor.x, args.destinationAnchor.x);
  const between = (object: RouteAssistVisibleSceneObjectV1) => isBetweenAnchorsV1(object, args.imageId, minX, maxX);

  function write(type: RouteAssistFactTypeV1, scopeId: string, value: RouteAssistFactValueV1, evidenceImageIds: string[]): void {
    assertAllowedFactType(type);
    const result = writeRouteAssistFactV1(store, {
      type,
      scopeId,
      value,
      evidenceImageIds,
      provenance: { source: "VISION_PROVIDER", providerKey: args.providerKey, at },
      lockOnWrite: true,
    });
    if (result.outcome === "WRITTEN") {
      store = result.store;
    } else {
      // A refusal here means the fact was already locked (a genuine repeat
      // application) or, in principle, a value-shape defect in this
      // module's own construction -- either way, report it rather than
      // silently discard it, but never let it stop the rest of this photo's
      // facts from being applied.
      problems.push(result.problem);
    }
  }

  const doorwayScopeId = routeAssistFeatureInstanceScopeIdV1("doorway", args.legScopeId, ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1);
  const cornerScopeId = routeAssistFeatureInstanceScopeIdV1("corner", args.legScopeId, ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1);

  // Computed early: TRANSITION_CONTINUATION_IN_FRAME (below) reuses this
  // exact match rather than re-deriving it.
  const destinationMatch = args.semantics.objects.find((object) => object.kind === "DESTINATION_MARKER" && object.pointId === args.destinationPointId);

  const cornerObject = args.semantics.objects.find((object) => object.kind === "CORNER" && between(object));
  write("CORNER_PRESENCE", cornerScopeId, { kind: "BOOLEAN", value: Boolean(cornerObject) }, cornerObject ? [cornerObject.imageId] : [args.imageId]);
  write("WALL_PLANE", args.legScopeId, { kind: "BOOLEAN", value: !cornerObject }, [args.imageId]);

  const baseboardObjects = args.semantics.objects.filter((object) => object.kind === "BASEBOARD_OR_TRIM" && between(object));
  write("BASEBOARD_CONTINUITY", args.legScopeId, { kind: "BOOLEAN", value: baseboardObjects.length > 0 }, baseboardObjects.length ? baseboardObjects.map((o) => o.imageId) : [args.imageId]);

  if (cornerObject) {
    const cornerX = objectCenterX(cornerObject);
    const nearSide = { lo: Math.min(args.sourceAnchor.x, cornerX), hi: Math.max(args.sourceAnchor.x, cornerX) };
    const farSide = { lo: Math.min(cornerX, args.destinationAnchor.x), hi: Math.max(cornerX, args.destinationAnchor.x) };
    const nearBaseboard = baseboardObjects.filter((object) => { const x = objectCenterX(object); return x >= nearSide.lo && x <= nearSide.hi; });
    const farBaseboard = baseboardObjects.filter((object) => { const x = objectCenterX(object); return x >= farSide.lo && x <= farSide.hi; });

    const coherentSegment = (requiredObjectIds: string[]) => args.semantics.segmentObservations.some((observation) =>
      observation.segmentId === args.legScopeId &&
      observation.confidence >= CONSERVATIVE_EVIDENCE_CONFIDENCE_FLOOR_V1 &&
      requiredObjectIds.every((id) => observation.objectIds.includes(id)),
    );

    // STRUCTURAL-VISIBILITY CORRECTION: baseboard on both sides is no
    // longer required to establish this fact -- see the module doc comment
    // above. TRUE requires only a coherent, confident segmentObservation
    // naming the corner for this leg's segment, withheld if this image
    // carries an explicit quality issue (a provider-declared signal that
    // it could not confidently assess the visible route here -- the
    // fixed-obstruction/ambiguity guard). Baseboard, when visible on either
    // side, still rides along as real supporting evidenceImageIds.
    const imageHasQualityIssue = (args.semantics.qualityIssues ?? []).some((issue) => issue.imageIds.includes(cornerObject.imageId));
    if (!imageHasQualityIssue && coherentSegment([cornerObject.id])) {
      const supportingImageIds = [...new Set([cornerObject.imageId, ...nearBaseboard.map((object) => object.imageId), ...farBaseboard.map((object) => object.imageId)])];
      write("TRANSITION_VISUALLY_CONNECTED", cornerScopeId, { kind: "BOOLEAN", value: true }, supportingImageIds);
    }
    // else: no coherent segmentObservation names the corner for this
    // segment at all (mere co-occurrence, not proof), or this image was
    // explicitly flagged as insufficiently clear -- ambiguous either way.
    // Left unwritten (OPEN) rather than promoted to true or demoted to false.

    // CORRECTION: a missing destinationMatch used to be written as a strong
    // negative (false) on the theory that "no destination object found at
    // all" proves the destination lies beyond what the image establishes.
    // It doesn't -- a missed match can equally be a model miss, ambiguous
    // visual evidence, or insufficient marker recognition, none of which
    // prove the route actually leaves the frame. Since false deterministically
    // forces SWEEP_REQUIRED (captureEscalation.ts), that over-escalated a
    // usable single photo on absence-of-evidence rather than evidence of
    // absence. The perception schema has no distinct signal for "the route
    // provably leaves the visible scene" (as opposed to "no destination
    // object was matched"), so this adapter no longer manufactures false
    // for this fact at all -- only the positive coherent-evidence case
    // below is confident enough to write anything but leave it open.
    if (destinationMatch && farBaseboard.length > 0 && coherentSegment([cornerObject.id, farBaseboard[0].id, destinationMatch.id])) {
      write("TRANSITION_CONTINUATION_IN_FRAME", cornerScopeId, { kind: "BOOLEAN", value: true }, [cornerObject.imageId, farBaseboard[0].imageId, destinationMatch.imageId]);
    }
    // else: either no destination marker was matched at all, or one exists
    // but nothing ties the corner, the far-side trim, and the destination
    // together as one connected observation -- in both cases, ambiguous
    // rather than disproven, so left unwritten (OPEN). evaluateRouteAssist
    // PhotoEscalationV1 then asks for a targeted photo instead of a sweep.
  }

  const windowObjects = args.semantics.objects.filter((object) => object.kind === "WINDOW" && between(object));
  if (windowObjects.length) write("WINDOW", args.legScopeId, { kind: "OBJECT_REF", objectId: windowObjects[0].id, imageId: windowObjects[0].imageId }, [windowObjects[0].imageId]);

  const obstacleObjects = args.semantics.objects.filter((object) => object.kind === "VISIBLE_OBSTACLE" && between(object));
  if (obstacleObjects.length) write("VISIBLE_OBSTACLE", args.legScopeId, { kind: "OBJECT_REF", objectId: obstacleObjects[0].id, imageId: obstacleObjects[0].imageId }, [obstacleObjects[0].imageId]);

  const doorwayObject = args.semantics.objects.find((object) => object.kind === "DOORWAY" && between(object));
  if (doorwayObject) {
    write("DOORWAY_PRESENCE", doorwayScopeId, { kind: "BOOLEAN", value: true }, [doorwayObject.imageId]);
    const group = (args.semantics.doorwayGroups ?? []).find((candidate) => candidate.doorwayObjectId === doorwayObject.id);
    if (group) {
      const objectById = new Map(args.semantics.objects.map((object) => [object.id, object]));
      const left = objectById.get(group.leftCasingObjectId);
      const top = objectById.get(group.topCasingObjectId);
      const right = objectById.get(group.rightCasingObjectId);
      if (left) write("DOORWAY_LEFT_CASING", doorwayScopeId, { kind: "OBJECT_REF", objectId: left.id, imageId: left.imageId }, [left.imageId]);
      if (top) write("DOORWAY_TOP_CASING", doorwayScopeId, { kind: "OBJECT_REF", objectId: top.id, imageId: top.imageId }, [top.imageId]);
      if (right) write("DOORWAY_RIGHT_CASING", doorwayScopeId, { kind: "OBJECT_REF", objectId: right.id, imageId: right.imageId }, [right.imageId]);
      // UNRESOLVED is a real, valid closed-set value, and this adapter still
      // writes it faithfully -- it is not this module's job to decide
      // whether an unresolved entry side is good enough. CORRECTION: it used
      // to be, incidentally, because the evaluator only checked whether this
      // fact existed at all, so writing UNRESOLVED-as-locked was enough to
      // satisfy the requirement without the physical side ever being known.
      // evaluateRouteAssistPhotoEscalationV1 now checks the VALUE
      // (doorwayEntrySideResolved: only LEFT/RIGHT count), so an honestly
      // reported UNRESOLVED correctly still drives TARGETED_PHOTO_REQUIRED.
      write("DOORWAY_ENTRY_SIDE", doorwayScopeId, { kind: "ENUM", value: group.entrySide }, [doorwayObject.imageId]);
    }
    // No group found: the doorway is visible but not sufficiently
    // characterized (e.g. the provider reported DOORWAY_CONTEXT_INCOMPLETE).
    // Casing/entry-side facts stay unwritten -- OPEN/missing, not a guess --
    // which is exactly what drives evaluateRouteAssistPhotoEscalationV1 to
    // TARGETED_PHOTO_REQUIRED rather than this adapter deciding that itself.
  }
  // CORRECTION: no DOORWAY object being found used to be written as a
  // strong negative (false) on the theory that the provider having nothing
  // to report proves no doorway exists. It doesn't -- a model miss,
  // framing, or occlusion looks identical to a genuinely doorway-free
  // wall, and this adapter has no way to tell them apart from absence
  // alone. DOORWAY_PRESENCE is therefore left unwritten (OPEN) whenever no
  // DOORWAY object is found, exactly like every other absence-based
  // inference this correction pass removes -- evaluateRouteAssistPhoto
  // EscalationV1 already treats an open DOORWAY_PRESENCE the same as a
  // missing one, asking for a targeted photo rather than concluding either
  // way on no evidence. A future explicit provider-supported negative
  // signal (e.g. NO_DOORWAY_PRESENT) could justify writing false; today's
  // schema has no such signal.

  const sourceMatch = args.semantics.objects.find((object) => object.kind === "SOURCE_RECEPTACLE" && object.pointId === args.sourcePointId);
  if (sourceMatch) write("ANCHOR_OBJECT_MATCH", args.sourcePointId, { kind: "ANCHOR_MATCH", objectId: sourceMatch.id, imageId: sourceMatch.imageId, matchesPlacement: true }, [sourceMatch.imageId]);

  if (destinationMatch) write("ANCHOR_OBJECT_MATCH", args.destinationPointId, { kind: "ANCHOR_MATCH", objectId: destinationMatch.id, imageId: destinationMatch.imageId, matchesPlacement: true }, [destinationMatch.imageId]);

  return { store, problems };
}
