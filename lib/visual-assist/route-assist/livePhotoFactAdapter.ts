import {
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
 * CONSERVATIVE-EVIDENCE CORRECTION: these two facts are NOT written true
 * merely because a plausible object exists somewhere nearby. "Baseboard
 * object exists on both sides" and "a destination marker was found" are
 * real signals, but on their own they are existence checks, not proof the
 * objects are part of one connected, visible run -- baseboard can appear on
 * both sides of a corner while the actual connecting section is occluded;
 * a destination marker can be visible while the physical link from the
 * corner to it is not established. So this adapter now additionally
 * requires COHERENCE: an explicit segmentObservation for this leg's own
 * segment, at or above CONSERVATIVE_EVIDENCE_CONFIDENCE_FLOOR_V1
 * confidence, whose objectIds tie the corner together with the specific
 * near/far-side objects being relied on -- the same discipline doorwayGroups
 * already uses (an explicit, structured tie, not co-occurrence). Three
 * outcomes per fact, deliberately:
 *   - TRUE only when that coherent, confident tie exists.
 *   - FALSE only on strong, direct NEGATIVE evidence (no baseboard object
 *     found anywhere on one side at all; no destination marker found at
 *     all) -- an absence is itself real, checkable evidence, not ambiguity.
 *   - Otherwise UNWRITTEN (OPEN): objects exist, but nothing ties them
 *     together into one confident claim. Ambiguous, and left that way
 *     rather than promoted to true -- evaluateRouteAssistPhotoEscalationV1
 *     then correctly asks for a targeted photo instead of proceeding on a
 *     heuristic.
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

    if (nearBaseboard.length === 0 || farBaseboard.length === 0) {
      // Strong negative: no baseboard/trim object found anywhere on at
      // least one side. A real, checkable absence, not ambiguity.
      write("TRANSITION_VISUALLY_CONNECTED", cornerScopeId, { kind: "BOOLEAN", value: false }, [cornerObject.imageId]);
    } else if (coherentSegment([cornerObject.id, nearBaseboard[0].id, farBaseboard[0].id])) {
      write("TRANSITION_VISUALLY_CONNECTED", cornerScopeId, { kind: "BOOLEAN", value: true }, [cornerObject.imageId, nearBaseboard[0].imageId, farBaseboard[0].imageId]);
    }
    // else: baseboard exists on both sides, but nothing ties the corner and
    // both sides together as one confident, coherent observation --
    // ambiguous. Left unwritten (OPEN) rather than promoted to true.

    if (!destinationMatch) {
      // Strong negative: the provider could not independently identify a
      // destination-marker object matching the homeowner's own anchor at
      // all -- "the destination lies beyond what the image establishes."
      write("TRANSITION_CONTINUATION_IN_FRAME", cornerScopeId, { kind: "BOOLEAN", value: false }, [args.imageId]);
    } else if (farBaseboard.length > 0 && coherentSegment([cornerObject.id, farBaseboard[0].id, destinationMatch.id])) {
      write("TRANSITION_CONTINUATION_IN_FRAME", cornerScopeId, { kind: "BOOLEAN", value: true }, [cornerObject.imageId, farBaseboard[0].imageId, destinationMatch.imageId]);
    }
    // else: a destination marker exists somewhere in frame, but nothing
    // ties the corner, the far-side trim, and the destination together as
    // one connected observation -- ambiguous, left unwritten.
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
  } else {
    write("DOORWAY_PRESENCE", doorwayScopeId, { kind: "BOOLEAN", value: false }, [args.imageId]);
  }

  const sourceMatch = args.semantics.objects.find((object) => object.kind === "SOURCE_RECEPTACLE" && object.pointId === args.sourcePointId);
  if (sourceMatch) write("ANCHOR_OBJECT_MATCH", args.sourcePointId, { kind: "ANCHOR_MATCH", objectId: sourceMatch.id, imageId: sourceMatch.imageId, matchesPlacement: true }, [sourceMatch.imageId]);

  if (destinationMatch) write("ANCHOR_OBJECT_MATCH", args.destinationPointId, { kind: "ANCHOR_MATCH", objectId: destinationMatch.id, imageId: destinationMatch.imageId, matchesPlacement: true }, [destinationMatch.imageId]);

  return { store, problems };
}
