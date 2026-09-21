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
 *
 * REGION-AWARE CORRECTION (real-phone diagnostic, 21 Sep 2026): a real
 * capture with a genuinely narrow, valid RIGHT-continuation overlap
 * (photo1's own right ~20% edge strip -- a fixed TV, a ceiling vent, the
 * wall/ceiling line, all real, non-moving landmarks, all necessarily
 * confined to that narrow column by the geometry of the pan) was
 * rejected as "concentrated in a single region," even though its
 * bounding-box extent (spansEnough, below) comfortably passed. Root
 * cause, confirmed by direct code trace, not inferred from the error
 * text alone: occupiedQuadrantsV1 divided the FROM image's own GLOBAL
 * [0,1]x[0,1] extent into a 2x2 grid and required landmarks to touch 2
 * of those 4 ABSOLUTE quadrants. A narrow edge-strip overlap (the entire
 * point of this guided-continuation feature's ghost-edge design,
 * ghostEdgeCropRectV1) is geometrically confined to one HALF of that
 * global grid by construction -- it can only ever touch the 2 quadrants
 * on its own side, and if the strip's distinctive, prompt-eligible
 * landmarks (the AI is explicitly told to avoid movable objects and
 * repeated/ambiguous features) happen to cluster toward one end of that
 * half, even a textbook-valid capture fails a check anchored to the
 * WRONG reference frame. This is a coverage-test-against-the-wrong-
 * region bug, not evidence that the landmarks were actually poor.
 *
 * A first attempt at the fix (splitting the region into 2 halves at its
 * OWN midpoint, instead of the image's global midpoint) turned out to be
 * a mathematical no-op for exactly this feature's regions:
 * ghostEdgeCropRectV1 always returns a region spanning the image's FULL
 * extent along its dominant axis (RIGHT/LEFT: {y:0,height:1}; UP/DOWN:
 * {x:0,width:1}), so that region's own midpoint along its dominant axis
 * is ALWAYS 0.5 -- identical to the global image midpoint. A landmark
 * set confined to, say, the upper 40% of a tall room's edge strip (a
 * fixed TV and ceiling vent, with nothing distinctive lower down once
 * movable furniture is correctly excluded) never straddles that
 * midpoint either way, halves or quadrants.
 *
 * THE ACTUAL FIX: occupiedRegionBinsV1 splits the expected overlap
 * region into THREE bins along its dominant axis (not two, and not at
 * an arbitrary fixed midpoint) and requires landmarks to touch at least
 * 2 of the 3. A genuinely narrow cluster (everything within one bin,
 * e.g. all landmarks crammed into the top third) still fails; a
 * landmark set that spans a meaningful portion of the strip -- without
 * needing to straddle its exact center -- now passes. Callers that do
 * not know an expected region keep the exact prior global-quadrant
 * behavior -- this is additive, not a threshold change, and a genuinely
 * tiny/clustered candidate set is still rejected
 * either way.
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

/** A normalized [0,1] sub-rectangle of an image's own local space -- structurally identical to alignmentLock.ts's RouteAssistNormalizedRectV1, redeclared here so this module keeps zero dependency on that one. */
export type RouteAssistDistributionReferenceRegionV1 = { x: number; y: number; width: number; height: number };

/** How many bins `occupiedRegionBinsV1` splits the reference region's dominant axis into. THREE, not two -- see that function's own doc comment for why an exact-midpoint 2-way split is mathematically a no-op for this feature's own edge-strip regions. */
const REGION_DISTRIBUTION_BIN_COUNT_V1 = 3;

/**
 * Splits `region` into REGION_DISTRIBUTION_BIN_COUNT_V1 equal bins along
 * its OWN longer axis (never the image's absolute center) and counts how
 * many bins at least one point falls in.
 *
 * WHY THIRDS, NOT AN EXACT-MIDPOINT HALF SPLIT: ghostEdgeCropRectV1's
 * regions always span the image's FULL extent along their narrow
 * dimension's complement -- a RIGHT/LEFT continuation's region is
 * {y:0,height:1} (the full height), an UP/DOWN continuation's is
 * {x:0,width:1} (the full width). A region's own midpoint along its
 * dominant axis is therefore ALWAYS 0.5, IDENTICAL to the image's global
 * midpoint -- splitting a direction-scoped region into 2 halves at its
 * own middle is mathematically indistinguishable from the OLD global 2x2
 * quadrant grid for exactly the narrow-edge-strip overlaps this feature
 * exists to support, so a 2-way split would not actually fix anything.
 * A real, genuinely valid capture can have its only usable, prompt-
 * eligible landmarks (fixed fixtures -- the AI is told to avoid movable
 * objects and repeated/ambiguous features) sitting entirely within, say,
 * the upper 40% of a tall room's edge strip, with nothing distinctive
 * lower down; requiring an exact 50/50 straddle is an arbitrary
 * assumption about WHERE in the strip content happens to be. Splitting
 * into THIRDS instead (requiring >=2 of 3) still rejects a genuinely
 * tiny, narrow cluster (which stays within a single bin) while accepting
 * a landmark set that spans a meaningful portion of the strip without
 * needing to straddle its exact center.
 *
 * Points outside the region's own bounds still count, clamped to
 * whichever end bin they're nearest -- a landmark just outside the
 * nominal strip is still real evidence, not a reason to discard it.
 */
function occupiedRegionBinsV1(points: readonly RouteAssistLocalPointV1[], region: RouteAssistDistributionReferenceRegionV1, binCount: number = REGION_DISTRIBUTION_BIN_COUNT_V1): number {
  const splitOnX = region.width >= region.height;
  const start = splitOnX ? region.x : region.y;
  const extent = (splitOnX ? region.width : region.height) || 1e-9;
  const bins = new Set<number>();
  for (const p of points) {
    const value = splitOnX ? p.x : p.y;
    const bin = Math.min(binCount - 1, Math.max(0, Math.floor(((value - start) / extent) * binCount)));
    bins.add(bin);
  }
  return bins.size;
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
 *
 * `expectedOverlapRegion` (optional): the FROM image's own known,
 * expected overlap sub-rectangle, when the caller has one (a guided
 * continuation always does -- ghostEdgeCropRectV1's rect for the locked
 * direction). When supplied, the occupied-region check is measured
 * against THAT region's own longer axis instead of the whole image's
 * global 2x2 grid -- see this module's own doc comment for why the
 * global grid structurally cannot pass a narrow, direction-scoped
 * overlap regardless of how well-distributed its landmarks genuinely
 * are. Omitting it reproduces the exact prior global-quadrant behavior.
 */
export function evaluateRouteAssistCorrespondenceDistributionV1(
  correspondences: readonly RouteAssistPointCorrespondenceV1[],
  expectedOverlapRegion?: RouteAssistDistributionReferenceRegionV1,
): RouteAssistDistributionEvaluationV1 {
  const distribution = computeRouteAssistCorrespondenceDistributionV1(correspondences);
  const spansEnough = distribution.fromBoundingBoxWidth >= ROUTE_ASSIST_MIN_DISTRIBUTION_EXTENT_V1 || distribution.fromBoundingBoxHeight >= ROUTE_ASSIST_MIN_DISTRIBUTION_EXTENT_V1;
  if (!spansEnough) {
    return { sufficient: false, reason: "candidate landmarks are clustered in too small an area of the overlap to safely fit geometry -- spread landmarks across more of the shared view", distribution };
  }
  const occupied = expectedOverlapRegion ? occupiedRegionBinsV1(correspondences.map((c) => c.from), expectedOverlapRegion) : distribution.occupiedQuadrantsFrom;
  if (occupied < ROUTE_ASSIST_MIN_DISTRIBUTION_QUADRANTS_V1) {
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
