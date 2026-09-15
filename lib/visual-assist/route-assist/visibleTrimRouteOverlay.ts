import type { RouteAssistVisibleSceneObjectV1, RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";
import type { RouteAssistVisibleTrimRouteProposalV1, RouteAssistVisibleTrimRouteStepV1 } from "./visibleTrimRouteProposal";

export type RouteAssistVisibleOverlayPointV1 = { x: number; y: number };
export type RouteAssistVisibleOverlayPathV1 = {
  imageId: string;
  points: RouteAssistVisibleOverlayPointV1[];
  stepKinds: RouteAssistVisibleTrimRouteStepV1["kind"][];
  /** Builder-populated provenance label; optional for older detached test fixtures. */
  evidenceRole?: "PRIMARY_SWEEP" | "SUPPLEMENTAL_RECAPTURE";
};
export type RouteAssistVisibleTrimRouteOverlayV1 = {
  version: 1;
  /** One path per captured scene; never draw coordinates across image frames. */
  paths: RouteAssistVisibleOverlayPathV1[];
  requiresHomeownerReview: true;
};

function center(object: RouteAssistVisibleSceneObjectV1): RouteAssistVisibleOverlayPointV1 {
  return { x: object.box.x + object.box.width / 2, y: object.box.y + object.box.height / 2 };
}
function trimAnchor(object: RouteAssistVisibleSceneObjectV1, kind: RouteAssistVisibleTrimRouteStepV1["kind"]): RouteAssistVisibleOverlayPointV1 {
  const b = object.box;
  if (kind === "BASEBOARD") return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (kind === "DOOR_SIDE_UP") return { x: b.x + b.width / 2, y: b.y + b.height };
  if (kind === "DOOR_SIDE_DOWN") return { x: b.x + b.width / 2, y: b.y + b.height };
  if (kind === "DOOR_TOP") return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  return center(object);
}

/**
 * Convert a review-only visible trim proposal into normalized image overlay
 * coordinates. Each polyline is strictly frame-local: a camera sweep is not a
 * stitched metric panorama, so this adapter never draws a fake line between
 * coordinates from different images.
 *
 * Supplemental recapture frames may display local review anchors, but their
 * order is presentation-only and never treated as route adjacency/topology.
 */
export function buildVisibleTrimRouteOverlayV1(args: {
  semantics: RouteAssistVisibleSceneSemanticsV1;
  proposal: RouteAssistVisibleTrimRouteProposalV1;
  authorizedSupplementalImageIds?: readonly string[];
}): RouteAssistVisibleTrimRouteOverlayV1 | null {
  if (args.proposal.status !== "REVIEW_REQUIRED" || args.proposal.problems.length) return null;
  const objects = new Map(args.semantics.objects.map((object) => [object.id, object]));
  const primaryIds = new Set(args.semantics.captureImageIds);
  const supplementalIds = new Set(args.authorizedSupplementalImageIds ?? []);
  const authorizedIds = new Set([...primaryIds, ...supplementalIds]);
  const grouped = new Map<string, RouteAssistVisibleTrimRouteStepV1[]>();

  for (const step of args.proposal.steps) {
    const object = objects.get(step.objectId);
    if (!object || object.imageId !== step.imageId || !authorizedIds.has(step.imageId)) return null;
    const existing = grouped.get(step.imageId) ?? [];
    existing.push(step);
    grouped.set(step.imageId, existing);
  }

  const orderedImageIds = [
    ...args.semantics.captureImageIds,
    ...[...supplementalIds].sort((a, b) => a.localeCompare(b)),
  ];
  const paths: RouteAssistVisibleOverlayPathV1[] = [];
  for (const imageId of orderedImageIds) {
    const steps = grouped.get(imageId);
    if (!steps?.length) continue;
    const points = steps.map((step) => trimAnchor(objects.get(step.objectId)!, step.kind));
    if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null;
    paths.push({
      imageId,
      points,
      stepKinds: steps.map((step) => step.kind),
      evidenceRole: primaryIds.has(imageId) ? "PRIMARY_SWEEP" : "SUPPLEMENTAL_RECAPTURE",
    });
  }
  if (!paths.length) return null;
  return { version: 1, paths, requiresHomeownerReview: true };
}
