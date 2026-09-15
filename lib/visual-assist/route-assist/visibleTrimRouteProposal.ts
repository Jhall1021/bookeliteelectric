import { isTrimHuggingDoorwayBypassV1, type RouteAssistTrimBoundaryV1 } from "./surfaceRacewayRoutingPreference";
import { validateRouteAssistVisibleSceneSemanticsV1, type RouteAssistVisibleSceneObjectV1, type RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";
import type { RoutePoint, RouteSegment } from "./types";

export type RouteAssistVisibleTrimRouteStepV1 = {
  kind: "SOURCE" | "BASEBOARD" | "DOOR_SIDE_UP" | "DOOR_TOP" | "DOOR_SIDE_DOWN" | "DESTINATION";
  objectId: string;
  imageId: string;
};

export type RouteAssistVisibleTrimRouteProposalV1 = {
  version: 1;
  status: "REVIEW_REQUIRED" | "INSUFFICIENT_VISIBLE_EVIDENCE";
  steps: RouteAssistVisibleTrimRouteStepV1[];
  /** Presentation/review boundaries only; no fitting counts are implied. */
  trimBoundaries: RouteAssistTrimBoundaryV1[];
  requiresHomeownerReview: true;
  problems: string[];
};

function byCaptureOrder(captureImageIds: string[], objects: RouteAssistVisibleSceneObjectV1[]): RouteAssistVisibleSceneObjectV1[] {
  const order = new Map(captureImageIds.map((id, index) => [id, index]));
  return [...objects].sort((a, b) => (order.get(a.imageId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.imageId) ?? Number.MAX_SAFE_INTEGER) || a.box.x - b.box.x || a.id.localeCompare(b.id));
}

/**
 * Build a conservative homeowner-review proposal from already validated visible
 * scene semantics. This is not a graph mutation and does not establish footage,
 * physical turns, fittings, material quantities, labor, or price.
 *
 * A doorway bypass is proposed only when the sweep visibly contains a doorway,
 * both side casings, and the top casing. Missing pieces fail closed rather than
 * inventing the up/across/down geometry.
 */
export function proposeVisibleTrimHuggingRouteV1(args: {
  semantics: RouteAssistVisibleSceneSemanticsV1;
  expectedCaptureImageIds: readonly string[];
  points: readonly RoutePoint[];
  segments: readonly RouteSegment[];
}): RouteAssistVisibleTrimRouteProposalV1 {
  const problems = validateRouteAssistVisibleSceneSemanticsV1(args);
  if (problems.length) return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems };

  const ordered = byCaptureOrder([...args.expectedCaptureImageIds], args.semantics.objects);
  const source = ordered.find((object) => object.kind === "SOURCE_RECEPTACLE");
  const destination = [...ordered].reverse().find((object) => object.kind === "DESTINATION_MARKER");
  if (!source || !destination) return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["visible source and destination anchors are both required"] };

  const sourceIndex = ordered.indexOf(source); const destinationIndex = ordered.indexOf(destination);
  const between = ordered.slice(Math.min(sourceIndex, destinationIndex), Math.max(sourceIndex, destinationIndex) + 1);
  const baseboards = between.filter((object) => object.kind === "BASEBOARD_OR_TRIM");
  if (!baseboards.length) return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["no visible baseboard or trim continuity between source and destination"] };

  const doorway = between.find((object) => object.kind === "DOORWAY");
  const sides = between.filter((object) => object.kind === "DOOR_SIDE_CASING");
  const top = between.find((object) => object.kind === "DOOR_TOP_CASING");
  const steps: RouteAssistVisibleTrimRouteStepV1[] = [{ kind: "SOURCE", objectId: source.id, imageId: source.imageId }];
  const boundaries: RouteAssistTrimBoundaryV1[] = ["BASEBOARD"];
  steps.push({ kind: "BASEBOARD", objectId: baseboards[0].id, imageId: baseboards[0].imageId });

  if (doorway) {
    if (sides.length < 2 || !top) return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["doorway is visible but complete side/top casing evidence is missing"] };
    const sideOrdered = [...sides].sort((a, b) => a.box.x - b.box.x);
    const movingRight = destinationIndex >= sourceIndex;
    const first = movingRight ? sideOrdered[0] : sideOrdered[sideOrdered.length - 1];
    const second = movingRight ? sideOrdered[sideOrdered.length - 1] : sideOrdered[0];
    steps.push({ kind: "DOOR_SIDE_UP", objectId: first.id, imageId: first.imageId }, { kind: "DOOR_TOP", objectId: top.id, imageId: top.imageId }, { kind: "DOOR_SIDE_DOWN", objectId: second.id, imageId: second.imageId });
    boundaries.push(movingRight ? "DOOR_CASING_LEFT" : "DOOR_CASING_RIGHT", "DOOR_CASING_TOP", movingRight ? "DOOR_CASING_RIGHT" : "DOOR_CASING_LEFT", "BASEBOARD");
    if (!isTrimHuggingDoorwayBypassV1(boundaries)) return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["doorway evidence does not form a trim-hugging bypass"] };
    const afterDoor = baseboards[baseboards.length - 1]; if (afterDoor.id !== baseboards[0].id) steps.push({ kind: "BASEBOARD", objectId: afterDoor.id, imageId: afterDoor.imageId });
  }

  steps.push({ kind: "DESTINATION", objectId: destination.id, imageId: destination.imageId });
  return { version: 1, status: "REVIEW_REQUIRED", steps, trimBoundaries: boundaries, requiresHomeownerReview: true, problems: [] };
}
