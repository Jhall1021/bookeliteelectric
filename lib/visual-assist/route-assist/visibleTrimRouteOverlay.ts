import type { RouteAssistVisibleSceneObjectV1, RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";
import type { RouteAssistVisibleTrimRouteProposalV1, RouteAssistVisibleTrimRouteStepV1 } from "./visibleTrimRouteProposal";

export type RouteAssistVisibleOverlayPointV1 = { x: number; y: number };
export type RouteAssistVisibleOverlayPathV1 = {
  imageId: string;
  points: RouteAssistVisibleOverlayPointV1[];
  stepKinds: RouteAssistVisibleTrimRouteStepV1["kind"][];
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
 * The output is presentation only. It does not mutate the route graph or create
 * footage, turns, fittings, materials, labor, pricing, or accepted facts.
 */
export function buildVisibleTrimRouteOverlayV1(args: {
  semantics: RouteAssistVisibleSceneSemanticsV1;
  proposal: RouteAssistVisibleTrimRouteProposalV1;
}): RouteAssistVisibleTrimRouteOverlayV1 | null {
  if (args.proposal.status !== "REVIEW_REQUIRED" || args.proposal.problems.length) return null;
  const objects = new Map(args.semantics.objects.map((object) => [object.id, object]));
  const captureIds = new Set(args.semantics.captureImageIds);
  const grouped = new Map<string, RouteAssistVisibleTrimRouteStepV1[]>();

  for (const step of args.proposal.steps) {
    const object = objects.get(step.objectId);
    if (!object || object.imageId !== step.imageId || !captureIds.has(step.imageId)) return null;
    const existing = grouped.get(step.imageId) ?? [];
    existing.push(step);
    grouped.set(step.imageId, existing);
  }

  const paths: RouteAssistVisibleOverlayPathV1[] = [];
  for (const imageId of args.semantics.captureImageIds) {
    const steps = grouped.get(imageId);
    if (!steps?.length) continue;
    const points = steps.map((step) => trimAnchor(objects.get(step.objectId)!, step.kind));
    if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null;
    paths.push({ imageId, points, stepKinds: steps.map((step) => step.kind) });
  }
  if (!paths.length) return null;
  return { version: 1, paths, requiresHomeownerReview: true };
}
