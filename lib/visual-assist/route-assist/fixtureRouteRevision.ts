import type { RouteAssistReviewCorrectionV1 } from "./routeReviewCorrection";
import type { RouteAssistVisibleOverlayPathV1, RouteAssistVisibleTrimRouteOverlayV1 } from "./visibleTrimRouteOverlay";

function distanceSquaredToSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return (point.x - a.x) ** 2 + (point.y - a.y) ** 2;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return (point.x - px) ** 2 + (point.y - py) ** 2;
}

function insertPassPoint(path: RouteAssistVisibleOverlayPathV1, point: { x: number; y: number }): RouteAssistVisibleOverlayPathV1 {
  if (path.points.length < 2) return path;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.points.length - 1; index++) {
    const distance = distanceSquaredToSegment(point, path.points[index], path.points[index + 1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  const stepKind = path.stepKinds[Math.min(bestIndex, path.stepKinds.length - 1)] ?? "BASEBOARD";
  return {
    ...path,
    points: [...path.points.slice(0, bestIndex + 1), { ...point }, ...path.points.slice(bestIndex + 1)],
    stepKinds: [...path.stepKinds.slice(0, bestIndex + 1), stepKind, ...path.stepKinds.slice(bestIndex + 1)],
  };
}

/**
 * Development-fixture-only presentation simulation for the correction loop.
 * It makes the revised proposal visibly pass through homeowner guidance so the
 * phone review UX can be exercised before a real semantic provider is wired.
 *
 * This helper does not mutate Route Assist geometry, establish measurement, or
 * represent provider evidence. Production correction handling remains provider
 * re-analysis followed by normal validation and homeowner review.
 */
export function buildFixtureCorrectionAwareOverlayV1(args: {
  baseline: RouteAssistVisibleTrimRouteOverlayV1;
  corrections: readonly RouteAssistReviewCorrectionV1[];
}): RouteAssistVisibleTrimRouteOverlayV1 {
  let paths = args.baseline.paths.map((path) => ({ ...path, points: path.points.map((point) => ({ ...point })), stepKinds: [...path.stepKinds] }));
  for (const correction of args.corrections) {
    if (correction.kind !== "ROUTE_SHOULD_PASS_HERE" || !correction.point) continue;
    paths = paths.map((path) => path.imageId === correction.imageId ? insertPassPoint(path, correction.point!) : path);
  }
  return { version: 1, paths, requiresHomeownerReview: true };
}
