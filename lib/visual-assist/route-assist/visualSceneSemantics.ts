import type { RoutePoint, RouteSegment } from "./types";
import {
  ROUTE_ASSIST_VISIBLE_SCENE_QUALITY_ISSUES_V1,
  type RouteAssistVisibleSceneQualityIssueV1,
} from "./visibleSceneQuality";

/**
 * Provider-neutral vocabulary for what an ordinary camera/CV provider may
 * visibly identify in the homeowner's ordered room sweep.
 *
 * These are scene labels and anchors only. They are not a second route taxonomy
 * and carry no material, fitting, labor, pricing, hidden-wiring, or Routing V2
 * authority.
 */
export type RouteAssistVisibleSceneObjectKindV1 =
  | "SOURCE_RECEPTACLE"
  | "DESTINATION_MARKER"
  | "BASEBOARD_OR_TRIM"
  | "DOORWAY"
  | "DOOR_SIDE_CASING"
  | "DOOR_TOP_CASING"
  | "WINDOW"
  | "VISIBLE_OBSTACLE";

export type RouteAssistNormalizedImageBoxV1 = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RouteAssistVisibleSceneObjectV1 = {
  id: string;
  kind: RouteAssistVisibleSceneObjectKindV1;
  imageId: string;
  confidence: number;
  box: RouteAssistNormalizedImageBoxV1;
  /** Existing graph anchor only when the visible object corresponds to one. */
  pointId?: string | null;
  /** Provider-local plane identity; never canonical surface identity by itself. */
  surfacePlaneId?: string | null;
};

export type RouteAssistVisibleSegmentObservationV1 = {
  segmentId: string;
  imageId: string;
  surfacePlaneId?: string | null;
  /** Visible scene objects relevant to reviewing this existing graph segment. */
  objectIds: string[];
  confidence: number;
};

/**
 * Explicit provider-local doorway grouping for review-only routing.
 *
 * Left/right are physical doorway sides in one coherent scene reconstruction,
 * not inferred by comparing image-space x coordinates from unrelated frames.
 * entrySide describes which casing the proposed source->destination traversal
 * reaches first. UNRESOLVED must fail closed in the trim-route proposal.
 */
export type RouteAssistVisibleDoorwayGroupV1 = {
  id: string;
  doorwayObjectId: string;
  leftCasingObjectId: string;
  topCasingObjectId: string;
  rightCasingObjectId: string;
  entrySide: "LEFT" | "RIGHT" | "UNRESOLVED";
};

export type RouteAssistVisibleSceneSemanticsV1 = {
  version: 1;
  /** Must preserve the durable capture order supplied to the provider. */
  captureImageIds: string[];
  objects: RouteAssistVisibleSceneObjectV1[];
  segmentObservations: RouteAssistVisibleSegmentObservationV1[];
  doorwayGroups?: RouteAssistVisibleDoorwayGroupV1[];
  /** Explicit provider evidence that the sweep needs targeted recapture/review. */
  qualityIssues?: RouteAssistVisibleSceneQualityIssueV1[];
};

function validUnit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1; }
function validBox(box: RouteAssistNormalizedImageBoxV1): boolean {
  return validUnit(box.x) && validUnit(box.y) && Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0 && box.x + box.width <= 1 && box.y + box.height <= 1;
}

/**
 * Fail closed before semantic CV output can be used by any route-review adapter.
 * Source/destination labels must point at existing graph points; segment labels
 * must point at existing graph segments. No new route nodes/segments can be
 * invented by the provider through this contract.
 */
export function validateRouteAssistVisibleSceneSemanticsV1(args: {
  semantics: RouteAssistVisibleSceneSemanticsV1;
  expectedCaptureImageIds: readonly string[];
  points: readonly RoutePoint[];
  segments: readonly RouteSegment[];
}): string[] {
  const problems: string[] = [];
  const { semantics } = args;
  if (semantics.version !== 1) return ["visible scene semantics version must be 1"];
  if (semantics.captureImageIds.length !== args.expectedCaptureImageIds.length || semantics.captureImageIds.some((id, index) => id !== args.expectedCaptureImageIds[index])) problems.push("visible scene capture order does not match provider input");

  const captureIds = new Set(args.expectedCaptureImageIds);
  const pointIds = new Set(args.points.map((point) => point.id));
  const segmentIds = new Set(args.segments.map((segment) => segment.id));
  const objectIds = new Set<string>();
  const objectById = new Map<string, RouteAssistVisibleSceneObjectV1>();

  for (const object of semantics.objects) {
    if (!object.id || objectIds.has(object.id)) problems.push(`visible scene object has duplicate or empty id: ${object.id || "<empty>"}`); else objectIds.add(object.id);
    objectById.set(object.id, object);
    if (!captureIds.has(object.imageId)) problems.push(`visible scene object ${object.id} references unknown image ${object.imageId}`);
    if (!validUnit(object.confidence)) problems.push(`visible scene object ${object.id} has invalid confidence`);
    if (!validBox(object.box)) problems.push(`visible scene object ${object.id} has invalid normalized box`);
    if ((object.kind === "SOURCE_RECEPTACLE" || object.kind === "DESTINATION_MARKER") && (!object.pointId || !pointIds.has(object.pointId))) problems.push(`visible scene object ${object.id} must anchor to an existing route point`);
    if (object.pointId && !pointIds.has(object.pointId)) problems.push(`visible scene object ${object.id} references unknown point ${object.pointId}`);
  }

  for (const observation of semantics.segmentObservations) {
    if (!segmentIds.has(observation.segmentId)) problems.push(`visible segment observation references unknown segment ${observation.segmentId}`);
    if (!captureIds.has(observation.imageId)) problems.push(`visible segment ${observation.segmentId} references unknown image ${observation.imageId}`);
    if (!validUnit(observation.confidence)) problems.push(`visible segment ${observation.segmentId} has invalid confidence`);
    for (const objectId of observation.objectIds) if (!objectIds.has(objectId)) problems.push(`visible segment ${observation.segmentId} references unknown object ${objectId}`);
  }

  const doorwayGroupIds = new Set<string>();
  for (const group of semantics.doorwayGroups ?? []) {
    if (!group.id || doorwayGroupIds.has(group.id)) problems.push(`visible doorway group has duplicate or empty id: ${group.id || "<empty>"}`); else doorwayGroupIds.add(group.id);
    const doorway = objectById.get(group.doorwayObjectId);
    const left = objectById.get(group.leftCasingObjectId);
    const top = objectById.get(group.topCasingObjectId);
    const right = objectById.get(group.rightCasingObjectId);
    if (doorway?.kind !== "DOORWAY") problems.push(`doorway group ${group.id} must reference a DOORWAY object`);
    if (left?.kind !== "DOOR_SIDE_CASING") problems.push(`doorway group ${group.id} left casing must reference a DOOR_SIDE_CASING object`);
    if (top?.kind !== "DOOR_TOP_CASING") problems.push(`doorway group ${group.id} top casing must reference a DOOR_TOP_CASING object`);
    if (right?.kind !== "DOOR_SIDE_CASING") problems.push(`doorway group ${group.id} right casing must reference a DOOR_SIDE_CASING object`);
    if (new Set([group.doorwayObjectId, group.leftCasingObjectId, group.topCasingObjectId, group.rightCasingObjectId]).size !== 4) problems.push(`doorway group ${group.id} must reference four distinct scene objects`);
  }

  const qualityIssueCodes = new Set<string>();
  for (const issue of semantics.qualityIssues ?? []) {
    if (!(ROUTE_ASSIST_VISIBLE_SCENE_QUALITY_ISSUES_V1 as readonly string[]).includes(issue.code)) problems.push(`visible scene quality issue has unknown code: ${String(issue.code)}`);
    if (qualityIssueCodes.has(issue.code)) problems.push(`visible scene quality issue is duplicated: ${issue.code}`); else qualityIssueCodes.add(issue.code);
    if (!Array.isArray(issue.imageIds)) problems.push(`visible scene quality issue ${issue.code} must carry imageIds`);
    else if (issue.imageIds.some((imageId) => !captureIds.has(imageId))) problems.push(`visible scene quality issue ${issue.code} references unknown image`);
  }

  return problems;
}
