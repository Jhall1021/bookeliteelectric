import type { RouteAssistReviewCorrectionV1 } from "./routeReviewCorrection";
import type { RouteAssistVisibleOverlayPathV1, RouteAssistVisibleTrimRouteOverlayV1 } from "./visibleTrimRouteOverlay";

function nearestSegmentIndex(path: RouteAssistVisibleOverlayPathV1, point: { x: number; y: number }): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.points.length - 1; index++) {
    const a = path.points[index];
    const b = path.points[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denominator = dx * dx + dy * dy;
    const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const distance = (point.x - px) ** 2 + (point.y - py) ** 2;
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  }
  return bestIndex;
}

function insertPassPoint(path: RouteAssistVisibleOverlayPathV1, point: { x: number; y: number }): RouteAssistVisibleOverlayPathV1 {
  if (path.points.length < 2) return path;
  const index = nearestSegmentIndex(path, point);
  const stepKind = path.stepKinds[Math.min(index, path.stepKinds.length - 1)] ?? "BASEBOARD";
  return {
    ...path,
    points: [...path.points.slice(0, index + 1), { ...point }, ...path.points.slice(index + 1)],
    stepKinds: [...path.stepKinds.slice(0, index + 1), stepKind, ...path.stepKinds.slice(index + 1)],
  };
}

function insertAvoidDetour(path: RouteAssistVisibleOverlayPathV1, point: { x: number; y: number }): RouteAssistVisibleOverlayPathV1 {
  if (path.points.length < 2) return path;
  const index = nearestSegmentIndex(path, point);
  const a = path.points[index];
  const b = path.points[index + 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const clearance = 0.09;
  const candidateA = { x: Math.max(0, Math.min(1, point.x + nx * clearance)), y: Math.max(0, Math.min(1, point.y + ny * clearance)) };
  const candidateB = { x: Math.max(0, Math.min(1, point.x - nx * clearance)), y: Math.max(0, Math.min(1, point.y - ny * clearance)) };
  const detour = Math.abs(candidateA.x - point.x) + Math.abs(candidateA.y - point.y) >= Math.abs(candidateB.x - point.x) + Math.abs(candidateB.y - point.y) ? candidateA : candidateB;
  const stepKind = path.stepKinds[Math.min(index, path.stepKinds.length - 1)] ?? "BASEBOARD";
  return {
    ...path,
    points: [...path.points.slice(0, index + 1), detour, ...path.points.slice(index + 1)],
    stepKinds: [...path.stepKinds.slice(0, index + 1), stepKind, ...path.stepKinds.slice(index + 1)],
  };
}

/**
 * Development-fixture-only presentation simulation for the correction loop.
 * PASS_HERE visibly bends through homeowner guidance; AVOID_HERE visibly bends
 * away from it. Neither operation represents provider evidence, accepted route
 * geometry, obstacle detection, or measurement.
 *
 * Production correction handling remains provider re-analysis followed by the
 * normal semantic validation and fresh homeowner review.
 */
export function buildFixtureCorrectionAwareOverlayV1(args: {
  baseline: RouteAssistVisibleTrimRouteOverlayV1;
  corrections: readonly RouteAssistReviewCorrectionV1[];
}): RouteAssistVisibleTrimRouteOverlayV1 {
  let paths = args.baseline.paths.map((path) => ({ ...path, points: path.points.map((point) => ({ ...point })), stepKinds: [...path.stepKinds] }));
  for (const correction of args.corrections) {
    if (!correction.point) continue;
    paths = paths.map((path) => {
      if (path.imageId !== correction.imageId) return path;
      if (correction.kind === "ROUTE_SHOULD_PASS_HERE") return insertPassPoint(path, correction.point!);
      if (correction.kind === "ROUTE_SHOULD_AVOID_HERE") return insertAvoidDetour(path, correction.point!);
      return path;
    });
  }
  return { version: 1, paths, requiresHomeownerReview: true };
}
