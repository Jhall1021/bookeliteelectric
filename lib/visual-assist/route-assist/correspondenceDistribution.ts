import type { RouteAssistLocalPointV1, RouteAssistPointCorrespondenceV1 } from "./imageRegistration";

/**
 * LANDMARK SPATIAL DISTRIBUTION (real-phone correction: a real registration
 * attempt was rejected with only 4 candidate landmark pairs -- the minimum
 * a homography can even be fit from, with zero redundancy for outlier
 * rejection. Requesting MORE candidates (frameRegistrationAiGateway.ts) is
 * the primary fix, but more points alone is not sufficient: 8 points
 * clustered in one tiny corner of the overlap are still geometrically
 * weak evidence for a full-frame transform. This module answers "are
 * these candidate correspondences spread widely enough across the
 * overlap to trust a geometric fit from them," entirely independent of
 * how many of them there are.
 *
 * Deliberately measured in each image's own RAW normalized [0,1] local
 * space (not aspect-corrected) -- this is a data-ACQUISITION-quality
 * heuristic ("did the AI find landmarks all over the shared view, or
 * only in one spot"), not a geometric-fit-accuracy concern. The fit
 * itself (imageRegistration.ts's registerFrameV1) applies its own
 * aspect-ratio correction before fitting; that is a separate, later
 * concern from whether the candidate SET was well spread to begin with.
 */

export type RouteAssistCorrespondenceDistributionV1 = {
  fromBoundingBoxWidth: number;
  fromBoundingBoxHeight: number;
  toBoundingBoxWidth: number;
  toBoundingBoxHeight: number;
  /** Out of a 2x2 grid over the FROM image -- how many distinct quadrants at least one landmark touches. */
  occupiedQuadrantsFrom: number;
  /** Smallest pairwise distance among FROM points -- a very small value means at least two "distinct" landmarks are really the same spot. */
  minPairSeparation: number;
};

const DISTRIBUTION_GRID_SIZE_V1 = 2;

function boundingBoxExtentV1(points: readonly RouteAssistLocalPointV1[]): { width: number; height: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function occupiedQuadrantsV1(points: readonly RouteAssistLocalPointV1[], gridSize: number = DISTRIBUTION_GRID_SIZE_V1): number {
  const cells = new Set<string>();
  for (const p of points) {
    const cx = Math.min(gridSize - 1, Math.max(0, Math.floor(p.x * gridSize)));
    const cy = Math.min(gridSize - 1, Math.max(0, Math.floor(p.y * gridSize)));
    cells.add(`${cx},${cy}`);
  }
  return cells.size;
}

function minPairwiseSeparationV1(points: readonly RouteAssistLocalPointV1[]): number {
  let min = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : 0;
}

export function computeRouteAssistCorrespondenceDistributionV1(correspondences: readonly RouteAssistPointCorrespondenceV1[]): RouteAssistCorrespondenceDistributionV1 {
  const fromPoints = correspondences.map((c) => c.from);
  const toPoints = correspondences.map((c) => c.to);
  const fromExtent = boundingBoxExtentV1(fromPoints);
  const toExtent = boundingBoxExtentV1(toPoints);
  return {
    fromBoundingBoxWidth: fromExtent.width,
    fromBoundingBoxHeight: fromExtent.height,
    toBoundingBoxWidth: toExtent.width,
    toBoundingBoxHeight: toExtent.height,
    occupiedQuadrantsFrom: occupiedQuadrantsV1(fromPoints),
    minPairSeparation: minPairwiseSeparationV1(fromPoints),
  };
}

/** The bounding box must span at least this fraction of the image's own [0,1] extent along EITHER axis -- loose on purpose (a narrow ghost-edge overlap can legitimately be tall/narrow), just enough to rule out "every landmark within one small corner." */
export const ROUTE_ASSIST_MIN_DISTRIBUTION_EXTENT_V1 = 0.2;
/** Out of a 2x2 grid (4 quadrants), landmarks must touch at least this many distinct ones. */
export const ROUTE_ASSIST_MIN_DISTRIBUTION_QUADRANTS_V1 = 2;
/** Two "distinct" landmarks closer than this (in normalized units) are treated as effectively duplicated, contributing no real spatial spread. */
export const ROUTE_ASSIST_MIN_DISTRIBUTION_PAIR_SEPARATION_V1 = 0.02;

export type RouteAssistDistributionEvaluationV1 = { sufficient: boolean; reason: string; distribution: RouteAssistCorrespondenceDistributionV1 };

/**
 * Evaluates whether a candidate correspondence set is spread widely
 * enough across the overlap to trust a geometric fit from it. Applied as
 * a GATE before any model fitting is attempted (registerFrameV1) -- a
 * clustered set is rejected with an explicit, distinguishable reason
 * rather than being handed to RANSAC, which has no way to tell "tightly
 * clustered but internally consistent" apart from "genuinely accurate."
 */
export function evaluateRouteAssistCorrespondenceDistributionV1(correspondences: readonly RouteAssistPointCorrespondenceV1[]): RouteAssistDistributionEvaluationV1 {
  const distribution = computeRouteAssistCorrespondenceDistributionV1(correspondences);
  const spansEnough = distribution.fromBoundingBoxWidth >= ROUTE_ASSIST_MIN_DISTRIBUTION_EXTENT_V1 || distribution.fromBoundingBoxHeight >= ROUTE_ASSIST_MIN_DISTRIBUTION_EXTENT_V1;
  if (!spansEnough) {
    return { sufficient: false, reason: "candidate landmarks are clustered in too small an area of the overlap to safely fit geometry -- spread landmarks across more of the shared view", distribution };
  }
  if (distribution.occupiedQuadrantsFrom < ROUTE_ASSIST_MIN_DISTRIBUTION_QUADRANTS_V1) {
    return { sufficient: false, reason: "candidate landmarks are concentrated in a single region of the overlap -- spread landmarks across more of the shared view", distribution };
  }
  return { sufficient: true, reason: "landmarks are sufficiently spread across the overlap", distribution };
}

/**
 * Collapses near-duplicate correspondences (both endpoints within
 * ROUTE_ASSIST_MIN_DISTRIBUTION_PAIR_SEPARATION_V1 of another pair's
 * endpoints) to their first occurrence. A duplicate pair inflates
 * apparent redundancy/inlier count without adding any real independent
 * evidence -- two "landmarks" that are really the same point should never
 * count as two points toward a distribution or redundancy requirement.
 */
export function dedupeRouteAssistCorrespondencesV1(
  correspondences: readonly RouteAssistPointCorrespondenceV1[],
  epsilon: number = ROUTE_ASSIST_MIN_DISTRIBUTION_PAIR_SEPARATION_V1,
): RouteAssistPointCorrespondenceV1[] {
  const kept: RouteAssistPointCorrespondenceV1[] = [];
  for (const candidate of correspondences) {
    const isDuplicate = kept.some(
      (existing) => Math.hypot(existing.from.x - candidate.from.x, existing.from.y - candidate.from.y) < epsilon && Math.hypot(existing.to.x - candidate.to.x, existing.to.y - candidate.to.y) < epsilon,
    );
    if (!isDuplicate) kept.push(candidate);
  }
  return kept;
}
