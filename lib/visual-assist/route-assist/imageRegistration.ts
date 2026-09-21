/**
 * REAL IMAGE REGISTRATION (product correction: replace approximate
 * capture-order/overlapFraction/direction placement with actual
 * image-to-image geometric registration).
 *
 * This module is pure geometry -- no provider calls, no DOM/canvas, no
 * dependency on Route Assist's fact model. It takes a set of point
 * CORRESPONDENCES between two images (each point normalized [0,1] within
 * its own image, matching this codebase's existing local-coordinate
 * convention) and:
 *
 *   1. Fits the SMALLEST transform model (translation, then similarity,
 *      then affine, then homography) whose robust inlier consensus meets
 *      an explicit accuracy threshold -- never a more complex model than
 *      the evidence actually supports.
 *   2. Rejects outright, with no fallback placement, when no model reaches
 *      that threshold. There is no "approximate anyway" path here: a
 *      caller that gets REJECTED must not add the frame to the workspace.
 *
 * WHERE CORRESPONDENCES COME FROM: this module does not care. In this
 * codebase they are PROPOSED by the semantic AI Gateway call
 * (frameOverlapAiGateway.ts's landmark points) -- the AI's job is only to
 * suggest which points in each image plausibly depict the same physical
 * feature; it never gets a vote on the final transform. Every proposed
 * pair here is treated as a candidate that may be an outlier, and the
 * robust consensus fit (a small, exhaustive RANSAC-style search over
 * minimal point subsets, deterministic rather than randomized -- correspondence
 * counts here are small enough that exhaustive search is cheap and gives
 * reproducible results for the same input, which matters for testability)
 * is what actually decides the geometry. "Semantic overlap must not
 * determine final image geometry" is enforced structurally: nothing in
 * this file reads a confidence score, an overlap-fraction estimate, or a
 * direction guess -- only point coordinates and reprojection error.
 */

import { dedupeRouteAssistCorrespondencesV1, evaluateRouteAssistCorrespondenceDistributionV1, type RouteAssistDistributionReferenceRegionV1 } from "./correspondenceDistribution";

export type RouteAssistLocalPointV1 = { x: number; y: number };

/** One candidate correspondence: the SAME physical point, as seen (allegedly) in two different frames' own normalized [0,1] local space. */
export type RouteAssistPointCorrespondenceV1 = { from: RouteAssistLocalPointV1; to: RouteAssistLocalPointV1 };

/**
 * Preferred transform hierarchy, smallest first. Every type is
 * representable as a 3x3 matrix (RouteAssistTransformMatrixV1); translation/
 * similarity/affine simply carry an implicit [0,0,1] bottom row.
 */
export const ROUTE_ASSIST_TRANSFORM_TYPES_V1 = ["TRANSLATION", "SIMILARITY", "AFFINE", "HOMOGRAPHY"] as const;
export type RouteAssistTransformTypeV1 = (typeof ROUTE_ASSIST_TRANSFORM_TYPES_V1)[number];

/** Row-major 3x3 matrix: [m0 m1 m2, m3 m4 m5, m6 m7 m8] applied to homogeneous [x,y,1] with a perspective divide. */
export type RouteAssistTransformMatrixV1 = readonly [number, number, number, number, number, number, number, number, number];

export function identityTransformV1(): RouteAssistTransformMatrixV1 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function applyTransformV1(m: RouteAssistTransformMatrixV1, p: RouteAssistLocalPointV1): RouteAssistLocalPointV1 {
  const wx = m[0] * p.x + m[1] * p.y + m[2];
  const wy = m[3] * p.x + m[4] * p.y + m[5];
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: wx / w, y: wy / w };
}

/** Composes two transforms: applying the result to a point is the same as applying `inner` then `outer` (outer ∘ inner). Used to chain a new frame's registration through an already-registered previous frame's own transform into workspace space. */
export function composeTransformsV1(outer: RouteAssistTransformMatrixV1, inner: RouteAssistTransformMatrixV1): RouteAssistTransformMatrixV1 {
  const r: number[] = new Array(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) sum += outer[row * 3 + k] * inner[k * 3 + col];
      r[row * 3 + col] = sum;
    }
  }
  return r as unknown as RouteAssistTransformMatrixV1;
}

/** General 3x3 inverse via the adjugate/determinant formula. Returns null only if the matrix is singular (should not happen for any transform this module actually fits, but a caller must not assume it always succeeds). */
export function invertTransformV1(m: RouteAssistTransformMatrixV1): RouteAssistTransformMatrixV1 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  return [
    (e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet,
    (f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet,
    (d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet,
  ];
}

export function reprojectionErrorV1(matrix: RouteAssistTransformMatrixV1, correspondence: RouteAssistPointCorrespondenceV1): number {
  const projected = applyTransformV1(matrix, correspondence.from);
  return Math.hypot(projected.x - correspondence.to.x, projected.y - correspondence.to.y);
}

/** Gauss-Jordan elimination with partial pivoting. Returns null if the system is singular (degenerate/collinear point configuration) rather than ever guessing a solution. */
function solveLinearSystemV1(matrix: readonly (readonly number[])[], rhs: readonly number[]): number[] | null {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivotRow][col])) pivotRow = row;
    }
    if (Math.abs(augmented[pivotRow][col]) < 1e-9) return null;
    [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];
    const pivot = augmented[col][col];
    for (let c = col; c <= n; c += 1) augmented[col][c] /= pivot;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c += 1) augmented[row][c] -= factor * augmented[col][c];
    }
  }
  return augmented.map((row) => row[n]);
}

/** Ordinary least squares via normal equations (A^T A x = A^T b). `rows[i]` is one linear equation's coefficients; `targets[i]` its right-hand side. Exact when rows.length === unknowns, a genuine least-squares fit when there are more. */
function leastSquaresV1(rows: readonly (readonly number[])[], targets: readonly number[]): number[] | null {
  const unknowns = rows[0]?.length ?? 0;
  if (unknowns === 0 || rows.length < unknowns) return null;
  const ata: number[][] = Array.from({ length: unknowns }, () => new Array(unknowns).fill(0));
  const atb: number[] = new Array(unknowns).fill(0);
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    for (let i = 0; i < unknowns; i += 1) {
      atb[i] += row[i] * targets[r];
      for (let j = 0; j < unknowns; j += 1) ata[i][j] += row[i] * row[j];
    }
  }
  return solveLinearSystemV1(ata, atb);
}

function fitTranslationV1(points: readonly RouteAssistPointCorrespondenceV1[]): RouteAssistTransformMatrixV1 | null {
  if (points.length === 0) return null;
  let dx = 0;
  let dy = 0;
  for (const p of points) {
    dx += p.to.x - p.from.x;
    dy += p.to.y - p.from.y;
  }
  dx /= points.length;
  dy /= points.length;
  return [1, 0, dx, 0, 1, dy, 0, 0, 1];
}

/** 2D similarity (uniform scale + rotation + translation) is LINEAR in [a,b,tx,ty] once written as x'=a*x-b*y+tx, y'=b*x+a*y+ty (a=s·cosθ, b=s·sinθ) -- so this is an ordinary 4-unknown least squares fit, exact at 2 points, robust with more. */
function fitSimilarityV1(points: readonly RouteAssistPointCorrespondenceV1[]): RouteAssistTransformMatrixV1 | null {
  const rows: number[][] = [];
  const targets: number[] = [];
  for (const p of points) {
    rows.push([p.from.x, -p.from.y, 1, 0]);
    targets.push(p.to.x);
    rows.push([p.from.y, p.from.x, 0, 1]);
    targets.push(p.to.y);
  }
  const solved = leastSquaresV1(rows, targets);
  if (!solved) return null;
  const [a, b, tx, ty] = solved;
  return [a, -b, tx, b, a, ty, 0, 0, 1];
}

/** Affine (6 DOF) decomposes into two independent 3-unknown least-squares fits: x'=a·x+b·y+c and y'=d·x+e·y+f share the same design rows. */
function fitAffineV1(points: readonly RouteAssistPointCorrespondenceV1[]): RouteAssistTransformMatrixV1 | null {
  const rows = points.map((p) => [p.from.x, p.from.y, 1]);
  const xTargets = points.map((p) => p.to.x);
  const yTargets = points.map((p) => p.to.y);
  const xSolved = leastSquaresV1(rows, xTargets);
  const ySolved = leastSquaresV1(rows, yTargets);
  if (!xSolved || !ySolved) return null;
  const [a, b, c] = xSolved;
  const [d, e, f] = ySolved;
  return [a, b, c, d, e, f, 0, 0, 1];
}

/** Homography (8 DOF, h9 fixed to 1) via the standard Direct Linear Transform, solved as ordinary least squares -- reasonable without the usual pixel-scale normalization step since these coordinates are already normalized to [0,1]. */
function fitHomographyV1(points: readonly RouteAssistPointCorrespondenceV1[]): RouteAssistTransformMatrixV1 | null {
  const rows: number[][] = [];
  const targets: number[] = [];
  for (const p of points) {
    const { x, y } = p.from;
    const { x: xp, y: yp } = p.to;
    rows.push([x, y, 1, 0, 0, 0, -xp * x, -xp * y]);
    targets.push(xp);
    rows.push([0, 0, 0, x, y, 1, -yp * x, -yp * y]);
    targets.push(yp);
  }
  const solved = leastSquaresV1(rows, targets);
  if (!solved) return null;
  const [h1, h2, h3, h4, h5, h6, h7, h8] = solved;
  return [h1, h2, h3, h4, h5, h6, h7, h8, 1];
}

function combinationsV1(n: number, k: number, cap = 4000): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];
  function recurse(start: number): void {
    if (result.length >= cap) return;
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < n; i += 1) {
      combo.push(i);
      recurse(i + 1);
      combo.pop();
      if (result.length >= cap) return;
    }
  }
  recurse(0);
  return result;
}

type FitFn = (points: readonly RouteAssistPointCorrespondenceV1[]) => RouteAssistTransformMatrixV1 | null;

type RansacConsensusV1 = { matrix: RouteAssistTransformMatrixV1; inlierIndices: number[]; meanError: number };

/**
 * Deterministic, exhaustive-minimal-subset consensus fit (a RANSAC
 * variant): every minimal-size combination of candidate correspondences is
 * fit, every candidate is scored against each fit by reprojection error,
 * and the fit with the most inliers wins (ties broken by lower mean
 * error). The winning inlier SET is then refit once more (using every
 * inlier, not just the minimal sample) for the final, more accurate
 * matrix. Deterministic rather than randomized because correspondence
 * counts here are always small (a handful of AI-proposed landmarks), so
 * exhaustive search is cheap and -- unlike random sampling -- gives the
 * exact same result for the exact same input, which this module's own
 * tests depend on.
 */
function ransacConsensusV1(args: { correspondences: readonly RouteAssistPointCorrespondenceV1[]; fit: FitFn; minPoints: number; inlierThreshold: number }): RansacConsensusV1 | null {
  const n = args.correspondences.length;
  if (n < args.minPoints) return null;
  const combos = combinationsV1(n, args.minPoints);
  let best: { matrix: RouteAssistTransformMatrixV1; inlierIndices: number[] } | null = null;
  for (const combo of combos) {
    const sample = combo.map((i) => args.correspondences[i]);
    const matrix = args.fit(sample);
    if (!matrix) continue;
    const inlierIndices: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (reprojectionErrorV1(matrix, args.correspondences[i]) <= args.inlierThreshold) inlierIndices.push(i);
    }
    if (!best || inlierIndices.length > best.inlierIndices.length) best = { matrix, inlierIndices };
  }
  if (!best || best.inlierIndices.length < args.minPoints) return null;
  const inlierPoints = best.inlierIndices.map((i) => args.correspondences[i]);
  const refined = args.fit(inlierPoints) ?? best.matrix;
  const errors = best.inlierIndices.map((i) => reprojectionErrorV1(refined, args.correspondences[i]));
  return { matrix: refined, inlierIndices: best.inlierIndices, meanError: errors.reduce((sum, e) => sum + e, 0) / errors.length };
}

/**
 * Quality/rejection thresholds. All in normalized [0,1] local-image units
 * (an image is 1 unit wide and 1 unit tall regardless of its actual pixel
 * dimensions, matching this codebase's existing local-coordinate
 * convention throughout).
 */
export const ROUTE_ASSIST_REGISTRATION_INLIER_DISTANCE_THRESHOLD_V1 = 0.05;
export const ROUTE_ASSIST_REGISTRATION_MIN_INLIER_COUNT_V1 = 4;
export const ROUTE_ASSIST_REGISTRATION_MIN_INLIER_RATIO_V1 = 0.6;
export const ROUTE_ASSIST_REGISTRATION_MAX_MEAN_REPROJECTION_ERROR_V1 = 0.035;

/**
 * PATHOLOGICAL-TRANSFORM CORRECTION: a fit can clear every statistical
 * quality bar above (enough inliers, low reprojection error) while still
 * being geometrically absurd -- a near-singular matrix, a fit that maps
 * the unit square to a degenerate sliver or a wildly oversized quad. Any
 * of these would render as a black screen, an invisible sliver, or a
 * broken composite. This is checked SEPARATELY from the statistical
 * thresholds, on the transform's actual effect on the unit square's 4
 * corners: reject when any corner is non-finite, when the resulting
 * bounding box has near-zero area (a collapsed transform), or when it is
 * absurdly large (thousands of image-widths -- never a plausible result
 * of two overlapping handheld phone photos).
 */
const MIN_SANE_TRANSFORM_EXTENT_V1 = 1e-3;
const MAX_SANE_TRANSFORM_EXTENT_V1 = 1000;
const MIN_SANE_TRANSFORM_DETERMINANT_V1 = 1e-6;

export const ROUTE_ASSIST_TRANSFORM_SANITY_FAILURE_REASONS_V1 = [
  "NON_FINITE_VALUE",
  "CORNER_AT_INFINITY",
  "TRANSFORMED_AREA_COLLAPSED",
  "TRANSFORMED_AREA_TOO_LARGE",
  "SELF_CROSSING_QUAD",
  "DETERMINANT_TOO_SMALL",
] as const;
export type RouteAssistTransformSanityFailureReasonV1 = (typeof ROUTE_ASSIST_TRANSFORM_SANITY_FAILURE_REASONS_V1)[number];

export type RouteAssistTransformSanityResultV1 =
  | { sane: true }
  | { sane: false; reason: RouteAssistTransformSanityFailureReasonV1; detail: string };

function matrix3Determinant(m: RouteAssistTransformMatrixV1): number {
  const [a, b, c, d, e, f, g, h, i] = m;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * Signed cross product of consecutive edge vectors around a quad's 4
 * corners (in order). For any CONVEX simple polygon traversed
 * consistently, every cross product shares the same sign; a self-
 * crossing ("bowtie") quad produces a mix of signs. This is a fast
 * heuristic, not an exact simple-polygon test (a genuinely concave but
 * still simple quad can trip it too) -- acceptable for a dev/rejection
 * diagnostic whose job is to catch clearly-broken geometry, not to
 * perfectly classify every possible quad shape.
 */
function hasSelfCrossingQuadV1(corners: readonly RouteAssistLocalPointV1[]): boolean {
  const cross: number[] = [];
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const c = corners[(i + 2) % corners.length];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    cross.push(v1x * v2y - v1y * v2x);
  }
  const positive = cross.some((value) => value > 0);
  const negative = cross.some((value) => value < 0);
  return positive && negative;
}

/**
 * PATHOLOGICAL-TRANSFORM CORRECTION: a fit can clear every statistical
 * quality bar above (enough inliers, low reprojection error) while still
 * being geometrically absurd -- a near-singular matrix, a fit that maps
 * the unit square to a degenerate sliver or a wildly oversized quad. Any
 * of these would render as a black screen, an invisible sliver, or a
 * broken composite. This is checked SEPARATELY from the statistical
 * thresholds, on the transform's actual effect on the unit square's 4
 * corners, and reports EXACTLY which check failed (real-phone
 * diagnostics correction: a bare boolean gave no way to tell whether a
 * rejected registration came from bad landmarks, a bad fit, inversion,
 * aspect correction, composition, or the sanity thresholds themselves).
 */
export function evaluateRouteAssistTransformSanityV1(matrix: RouteAssistTransformMatrixV1): RouteAssistTransformSanityResultV1 {
  if (!matrix.every((value) => Number.isFinite(value))) {
    return { sane: false, reason: "NON_FINITE_VALUE", detail: `matrix contains a non-finite value: [${matrix.join(", ")}]` };
  }
  const determinant = matrix3Determinant(matrix);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < MIN_SANE_TRANSFORM_DETERMINANT_V1) {
    return { sane: false, reason: "DETERMINANT_TOO_SMALL", detail: `matrix determinant ${determinant} is below the minimum sane magnitude ${MIN_SANE_TRANSFORM_DETERMINANT_V1}` };
  }
  const corners = ROUTE_ASSIST_LOCAL_UNIT_CORNERS_V1.map((corner) => applyTransformV1(matrix, corner));
  if (!corners.every((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y))) {
    return { sane: false, reason: "CORNER_AT_INFINITY", detail: `a transformed unit-square corner is non-finite: ${JSON.stringify(corners)}` };
  }
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (!(width > MIN_SANE_TRANSFORM_EXTENT_V1 && height > MIN_SANE_TRANSFORM_EXTENT_V1)) {
    return { sane: false, reason: "TRANSFORMED_AREA_COLLAPSED", detail: `transformed unit square collapsed to width=${width}, height=${height}` };
  }
  if (width > MAX_SANE_TRANSFORM_EXTENT_V1 || height > MAX_SANE_TRANSFORM_EXTENT_V1) {
    return { sane: false, reason: "TRANSFORMED_AREA_TOO_LARGE", detail: `transformed unit square is implausibly large: width=${width}, height=${height}` };
  }
  if (hasSelfCrossingQuadV1(corners)) {
    return { sane: false, reason: "SELF_CROSSING_QUAD", detail: `transformed unit-square corners no longer form a simple (non-self-intersecting) quad: ${JSON.stringify(corners)}` };
  }
  return { sane: true };
}

export function isTransformSaneV1(matrix: RouteAssistTransformMatrixV1): boolean {
  return evaluateRouteAssistTransformSanityV1(matrix).sane;
}

const AFFINE_BOTTOM_ROW_EPSILON_V1 = 1e-9;

/**
 * RENDERING-CORRECTNESS: a frame's actual on-screen placement is
 * `transformToWorkspace`, composed transitively through every earlier
 * registration in the chain -- NOT just this frame's own registration
 * step. A step that itself fit as TRANSLATION/SIMILARITY/AFFINE can still
 * end up with a non-affine COMPOSED transform if any ancestor in the
 * chain was fit as HOMOGRAPHY (composing an affine matrix with a
 * homography's nonzero bottom row yields a matrix that itself has a
 * nonzero bottom row). So "is this matrix exactly representable as a 2D
 * CSS affine matrix()" must be answered by inspecting the matrix's own
 * bottom row -- [0,0,1], i.e. no perspective-divide component -- never by
 * reading a single step's transformType. A caller deciding CSS-affine vs.
 * true-projective rendering must call this on the frame's composed
 * transformToWorkspace, not on registration.transformType.
 */
export function isAffineRepresentableV1(matrix: RouteAssistTransformMatrixV1): boolean {
  return (
    Math.abs(matrix[6]) < AFFINE_BOTTOM_ROW_EPSILON_V1 &&
    Math.abs(matrix[7]) < AFFINE_BOTTOM_ROW_EPSILON_V1 &&
    Math.abs(matrix[8] - 1) < AFFINE_BOTTOM_ROW_EPSILON_V1
  );
}

export type RouteAssistRegistrationResultV1 =
  | {
      outcome: "REGISTERED";
      transformType: RouteAssistTransformTypeV1;
      matrix: RouteAssistTransformMatrixV1;
      inverseMatrix: RouteAssistTransformMatrixV1;
      inlierCount: number;
      candidateCount: number;
      meanReprojectionError: number;
      inlierIndices: number[];
    }
  | { outcome: "REJECTED"; reason: string; bestInlierCount: number; candidateCount: number; bestReprojectionError: number | null };

const TRANSFORM_MODELS_V1: ReadonlyArray<{ type: RouteAssistTransformTypeV1; minPoints: number; fit: FitFn }> = [
  { type: "TRANSLATION", minPoints: 1, fit: fitTranslationV1 },
  { type: "SIMILARITY", minPoints: 2, fit: fitSimilarityV1 },
  { type: "AFFINE", minPoints: 3, fit: fitAffineV1 },
  { type: "HOMOGRAPHY", minPoints: 4, fit: fitHomographyV1 },
];

/**
 * REDUNDANCY REQUIREMENT (real-phone correction: a registration attempt
 * with exactly 4 candidate landmarks -- HOMOGRAPHY's own minimum point
 * count -- was accepted as HOMOGRAPHY even though a fit from (at or near)
 * a model's minimal sample size has zero slack for outlier rejection: with
 * candidateCount==minPoints, "100% inliers" is tautological (the RANSAC
 * minimal sample IS the whole candidate set), not evidence of a robustly
 * tested consensus. HOMOGRAPHY specifically requires at least this many
 * candidates BEYOND its own minimum before it is even eligible to be
 * selected, regardless of how good its statistics look on paper.
 */
export const ROUTE_ASSIST_REGISTRATION_HOMOGRAPHY_MIN_REDUNDANCY_V1 = 2;

/**
 * COMPLEXITY PENALTY (real-phone correction: do not jump to a more
 * complex transform merely because a handful of points happen to permit
 * one). A more complex model is only preferred over an already-passing
 * simpler one when it is MATERIALLY more accurate -- its mean
 * reprojection error must fall to at most this fraction of the simpler
 * model's error -- AND only when the simpler model's error was above
 * ROUTE_ASSIST_REGISTRATION_COMPLEXITY_COMPARISON_FLOOR_V1 to begin with
 * (an already near-machine-precision fit has nothing meaningful left to
 * improve; comparing floating-point noise between two exact fits must
 * never flip the selection to a needlessly more complex model).
 */
export const ROUTE_ASSIST_REGISTRATION_COMPLEXITY_IMPROVEMENT_RATIO_V1 = 0.6;
export const ROUTE_ASSIST_REGISTRATION_COMPLEXITY_COMPARISON_FLOOR_V1 = 1e-4;

type RouteAssistRegistrationAttemptV1 = {
  type: RouteAssistTransformTypeV1;
  matrix: RouteAssistTransformMatrixV1;
  inlierIndices: number[];
  meanError: number;
};

/**
 * The one entry point this module exists for.
 *
 * ASPECT-RATIO AUDIT (real-phone correction): correspondences are
 * expressed in each image's own RAW normalized [0,1] independent-per-axis
 * space, which is only isotropic (equal physical distance per unit along
 * both axes) when that image's aspect ratio is 1. For a real phone photo
 * (16:9, 4:3, portrait, ...) this made reprojection error/inlier-distance
 * measurements axis-DEPENDENT -- the same real pixel error scores
 * differently depending on which axis (and therefore which photo
 * orientation) it falls on. Correspondences are corrected into an
 * isotropic space (x *= that image's own aspect ratio) before any model
 * is fit, and the resulting matrix is converted straight back to a
 * RAW-to-RAW matrix before being returned or measured further -- so every
 * caller (stitchedWorkspace.ts's composition, this function's own sanity/
 * redundancy/selection logic) sees exactly the same matrix semantics as
 * before this correction; only the FIT ITSELF got more accurate and
 * orientation-consistent. Omitting fromAspectRatio/toAspectRatio (both
 * default to 1) reproduces the previous, uncorrected behavior exactly.
 *
 * Tries TRANSLATION first, escalating to SIMILARITY, AFFINE, then
 * HOMOGRAPHY -- "do not use a more complex transform than necessary."
 * Every model that clears minInlierCount/minInlierRatio/
 * maxMeanReprojectionError is collected (not just the first), and the
 * SIMPLEST one is selected UNLESS a more complex one is materially more
 * accurate and has well-distributed inlier support (see the complexity-
 * penalty constants above) -- "ordinary homeowner panning should usually
 * resolve as TRANSLATION / SIMILARITY / AFFINE; HOMOGRAPHY should be the
 * exception." REJECTED means no eligible model cleared the bar, and
 * callers MUST NOT place the frame using any fallback/approximate
 * transform -- there isn't one to fall back to.
 */
export function registerFrameV1(args: {
  correspondences: readonly RouteAssistPointCorrespondenceV1[];
  fromAspectRatio?: number;
  toAspectRatio?: number;
  minInlierCount?: number;
  minInlierRatio?: number;
  maxMeanReprojectionError?: number;
  inlierDistanceThreshold?: number;
  /** The FROM image's own known, expected overlap sub-rectangle, when the caller has one -- see correspondenceDistribution.ts's own doc comment (the "REGION-AWARE CORRECTION" section) for why a narrow, direction-scoped overlap needs this to pass its distribution check fairly. Omit for the prior, region-agnostic (whole-image) behavior. */
  expectedOverlapRegion?: RouteAssistDistributionReferenceRegionV1;
}): RouteAssistRegistrationResultV1 {
  const minInlierCount = args.minInlierCount ?? ROUTE_ASSIST_REGISTRATION_MIN_INLIER_COUNT_V1;
  const minInlierRatio = args.minInlierRatio ?? ROUTE_ASSIST_REGISTRATION_MIN_INLIER_RATIO_V1;
  const maxMeanReprojectionError = args.maxMeanReprojectionError ?? ROUTE_ASSIST_REGISTRATION_MAX_MEAN_REPROJECTION_ERROR_V1;
  const inlierDistanceThreshold = args.inlierDistanceThreshold ?? ROUTE_ASSIST_REGISTRATION_INLIER_DISTANCE_THRESHOLD_V1;
  const fromAspectRatio = args.fromAspectRatio ?? 1;
  const toAspectRatio = args.toAspectRatio ?? 1;

  const deduped = dedupeRouteAssistCorrespondencesV1(args.correspondences);
  const candidateCount = deduped.length;

  if (candidateCount < 2) {
    return { outcome: "REJECTED", reason: "not enough matched landmarks to attempt registration", bestInlierCount: 0, candidateCount, bestReprojectionError: null };
  }

  const distribution = evaluateRouteAssistCorrespondenceDistributionV1(deduped, args.expectedOverlapRegion);
  if (!distribution.sufficient) {
    return { outcome: "REJECTED", reason: distribution.reason, bestInlierCount: 0, candidateCount, bestReprojectionError: null };
  }

  const fromCorrect: RouteAssistTransformMatrixV1 = [fromAspectRatio, 0, 0, 0, 1, 0, 0, 0, 1];
  const toCorrect: RouteAssistTransformMatrixV1 = [toAspectRatio, 0, 0, 0, 1, 0, 0, 0, 1];
  const toCorrectInverse = invertTransformV1(toCorrect) ?? identityTransformV1();
  const correctedCorrespondences: RouteAssistPointCorrespondenceV1[] = deduped.map((c) => ({
    from: { x: c.from.x * fromAspectRatio, y: c.from.y },
    to: { x: c.to.x * toAspectRatio, y: c.to.y },
  }));

  const attempts: RouteAssistRegistrationAttemptV1[] = [];
  let bestFailure: { inlierCount: number; reprojectionError: number } | null = null;

  for (const model of TRANSFORM_MODELS_V1) {
    const consensus = ransacConsensusV1({ correspondences: correctedCorrespondences, fit: model.fit, minPoints: model.minPoints, inlierThreshold: inlierDistanceThreshold });
    if (!consensus) continue;
    // Convert back to a RAW-to-RAW matrix immediately -- every later check
    // (sanity, redundancy, selection, and the returned result) operates on
    // exactly the matrix stitchedWorkspace.ts will actually store/compose.
    const rawMatrix = composeTransformsV1(toCorrectInverse, composeTransformsV1(consensus.matrix, fromCorrect));
    if (!isTransformSaneV1(rawMatrix)) continue; // statistically plausible but geometrically pathological -- never accepted, regardless of inlier stats
    const inlierRatio = candidateCount > 0 ? consensus.inlierIndices.length / candidateCount : 0;

    if (model.type === "HOMOGRAPHY" && candidateCount < model.minPoints + ROUTE_ASSIST_REGISTRATION_HOMOGRAPHY_MIN_REDUNDANCY_V1) {
      if (!bestFailure || consensus.inlierIndices.length > bestFailure.inlierCount) bestFailure = { inlierCount: consensus.inlierIndices.length, reprojectionError: consensus.meanError };
      continue; // not enough redundant evidence to trust a full projective fit -- never eligible regardless of its statistics.
    }

    if (consensus.inlierIndices.length >= minInlierCount && inlierRatio >= minInlierRatio && consensus.meanError <= maxMeanReprojectionError) {
      attempts.push({ type: model.type, matrix: rawMatrix, inlierIndices: consensus.inlierIndices, meanError: consensus.meanError });
    } else if (!bestFailure || consensus.inlierIndices.length > bestFailure.inlierCount) {
      bestFailure = { inlierCount: consensus.inlierIndices.length, reprojectionError: consensus.meanError };
    }
  }

  if (attempts.length === 0) {
    return {
      outcome: "REJECTED",
      reason: "no transform model could align enough matched landmarks with sufficient accuracy and redundancy",
      bestInlierCount: bestFailure?.inlierCount ?? 0,
      candidateCount,
      bestReprojectionError: bestFailure?.reprojectionError ?? null,
    };
  }

  // TRANSFORM_MODELS_V1 is smallest-first and attempts were pushed in that
  // same order -- select the SIMPLEST passing model unless a strictly
  // later (more complex) one is materially more accurate and its OWN
  // inlier subset is itself well-distributed.
  let selected = attempts[0];
  for (let i = 1; i < attempts.length; i += 1) {
    const candidate = attempts[i];
    const meaningfulBaseline = selected.meanError > ROUTE_ASSIST_REGISTRATION_COMPLEXITY_COMPARISON_FLOOR_V1;
    const materiallyBetter = meaningfulBaseline && candidate.meanError < selected.meanError * ROUTE_ASSIST_REGISTRATION_COMPLEXITY_IMPROVEMENT_RATIO_V1;
    const wellDistributedInliers = materiallyBetter && evaluateRouteAssistCorrespondenceDistributionV1(candidate.inlierIndices.map((index) => deduped[index])).sufficient;
    if (materiallyBetter && wellDistributedInliers) selected = candidate;
  }

  return {
    outcome: "REGISTERED",
    transformType: selected.type,
    matrix: selected.matrix,
    inverseMatrix: invertTransformV1(selected.matrix) ?? identityTransformV1(),
    inlierCount: selected.inlierIndices.length,
    candidateCount,
    meanReprojectionError: selected.meanError,
    inlierIndices: selected.inlierIndices,
  };
}

/** The 4 corners of a frame's own normalized local unit square, in a fixed order (top-left, top-right, bottom-right, bottom-left) -- used to compute transformed workspace bounds without assuming any particular transform shape. */
export const ROUTE_ASSIST_LOCAL_UNIT_CORNERS_V1: readonly RouteAssistLocalPointV1[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
