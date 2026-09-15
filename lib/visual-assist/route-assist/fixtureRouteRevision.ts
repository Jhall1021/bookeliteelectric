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

function replaceAnchor(path: RouteAssistVisibleOverlayPathV1, point: { x: number; y: number }, which: "SOURCE" | "DESTINATION"): RouteAssistVisibleOverlayPathV1 {
  if (!path.points.length) return path;
  const index = which === "SOURCE" ? 0 : path.points.length - 1;
  const points = path.points.map((candidate, candidateIndex) => candidateIndex === index ? { ...point } : { ...candidate });
  return { ...path, points, stepKinds: [...path.stepKinds] };
}

/**
 * Development-fixture-only presentation simulation for the correction loop.
 * PASS_HERE visibly bends through homeowner guidance; AVOID_HERE visibly bends
 * away from it. SOURCE/DESTINATION corrections move only the presentation
 * anchor in that captured frame so the re-identification UX can be rehearsed.
 *
 * None of these operations represents provider evidence, accepted Route Assist
 * geometry, obstacle detection, or measurement. Production correction handling
 * remains provider re-analysis followed by semantic validation and fresh review.
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
      if (correction.kind === "SOURCE_ANCHOR_WRONG") return replaceAnchor(path, correction.point!, "SOURCE");
      if (correction.kind === "DESTINATION_ANCHOR_WRONG") return replaceAnchor(path, correction.point!, "DESTINATION");
      return path;
    });
  }
  return { version: 1, paths, requiresHomeownerReview: true };
}
