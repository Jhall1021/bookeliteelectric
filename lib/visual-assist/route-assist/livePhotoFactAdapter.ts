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
 */
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

  const cornerObject = args.semantics.objects.find((object) => object.kind === "CORNER" && between(object));
  write("CORNER_PRESENCE", cornerScopeId, { kind: "BOOLEAN", value: Boolean(cornerObject) }, cornerObject ? [cornerObject.imageId] : [args.imageId]);
  write("WALL_PLANE", args.legScopeId, { kind: "BOOLEAN", value: !cornerObject }, [args.imageId]);

  const baseboardObjects = args.semantics.objects.filter((object) => object.kind === "BASEBOARD_OR_TRIM" && between(object));
  write("BASEBOARD_CONTINUITY", args.legScopeId, { kind: "BOOLEAN", value: baseboardObjects.length > 0 }, baseboardObjects.length ? baseboardObjects.map((o) => o.imageId) : [args.imageId]);

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
      // UNRESOLVED is a real, valid closed-set value -- writing it locks the
      // fact as "resolved to unresolved," which correctly still leaves the
      // evaluator's DOORWAY_ENTRY_SIDE requirement satisfied (present) even
      // though the physical side itself remains unknown; escalation for a
      // genuinely unresolved entry side is a product decision outside this
      // proof's scope, not something this adapter should decide by omission.
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

  const destinationMatch = args.semantics.objects.find((object) => object.kind === "DESTINATION_MARKER" && object.pointId === args.destinationPointId);
  if (destinationMatch) write("ANCHOR_OBJECT_MATCH", args.destinationPointId, { kind: "ANCHOR_MATCH", objectId: destinationMatch.id, imageId: destinationMatch.imageId, matchesPlacement: true }, [destinationMatch.imageId]);

  return { store, problems };
}
