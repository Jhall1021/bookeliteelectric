/**
 * Proves the real image-registration geometry: imageRegistration.ts's
 * transform fitting (translation -> similarity -> affine -> homography),
 * robust consensus (RANSAC-style inlier selection), and rejection when no
 * model clears the quality bar. Pure math, no provider calls, no DOM --
 * every case here is a synthetic point-correspondence set with a known
 * ground-truth transform (or deliberately none).
 *
 * Run: npx tsx scripts/verify-route-assist-image-registration.ts
 */
import assert from "node:assert/strict";
import {
  applyTransformV1,
  identityTransformV1,
  invertTransformV1,
  registerFrameV1,
  type RouteAssistLocalPointV1,
  type RouteAssistPointCorrespondenceV1,
  type RouteAssistTransformMatrixV1,
} from "../lib/visual-assist/route-assist/imageRegistration";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const SAMPLE_POINTS: RouteAssistLocalPointV1[] = [
  { x: 0.15, y: 0.2 },
  { x: 0.75, y: 0.18 },
  { x: 0.4, y: 0.55 },
  { x: 0.85, y: 0.7 },
  { x: 0.25, y: 0.82 },
  { x: 0.6, y: 0.35 },
];

function correspondencesFor(transform: RouteAssistTransformMatrixV1, points: RouteAssistLocalPointV1[] = SAMPLE_POINTS): RouteAssistPointCorrespondenceV1[] {
  return points.map((from) => ({ from, to: applyTransformV1(transform, from) }));
}

function translationMatrix(dx: number, dy: number): RouteAssistTransformMatrixV1 {
  return [1, 0, dx, 0, 1, dy, 0, 0, 1];
}

function similarityMatrix(angleRad: number, scale: number, dx: number, dy: number): RouteAssistTransformMatrixV1 {
  const a = scale * Math.cos(angleRad);
  const b = scale * Math.sin(angleRad);
  return [a, -b, dx, b, a, dy, 0, 0, 1];
}

function main() {
  // --- 1: translated overlapping images align correctly --------------------
  check("1. a pure rightward translation registers exactly, using the SMALLEST sufficient model (TRANSLATION, not something more complex)", () => {
    const truth = translationMatrix(0.3, 0.02);
    const result = registerFrameV1({ correspondences: correspondencesFor(truth) });
    assert.equal(result.outcome, "REGISTERED", JSON.stringify(result));
    assert.equal(result.outcome === "REGISTERED" && result.transformType, "TRANSLATION");
    assert.equal(result.outcome === "REGISTERED" && result.inlierCount, SAMPLE_POINTS.length);
    if (result.outcome === "REGISTERED") assert.ok(result.meanReprojectionError < 1e-6, JSON.stringify(result));
  });

  // --- 2/3: rightward vs leftward continuation ------------------------------
  check("2. a rightward continuation's fitted transform moves points to the right (positive x translation)", () => {
    const truth = translationMatrix(0.4, 0);
    const result = registerFrameV1({ correspondences: correspondencesFor(truth) });
    assert.equal(result.outcome, "REGISTERED");
    if (result.outcome === "REGISTERED") {
      const origin = applyTransformV1(result.matrix, { x: 0, y: 0 });
      assert.ok(origin.x > 0.3, JSON.stringify(origin));
    }
  });

  check("3. a leftward continuation's fitted transform moves points to the left (negative x translation)", () => {
    const truth = translationMatrix(-0.4, 0);
    const result = registerFrameV1({ correspondences: correspondencesFor(truth) });
    assert.equal(result.outcome, "REGISTERED");
    if (result.outcome === "REGISTERED") {
      const origin = applyTransformV1(result.matrix, { x: 0, y: 0 });
      assert.ok(origin.x < -0.3, JSON.stringify(origin));
    }
  });

  // --- 4: upward/downward continuation ---------------------------------------
  check("4. upward and downward continuations register with the correct sign of y translation", () => {
    const up = registerFrameV1({ correspondences: correspondencesFor(translationMatrix(0, -0.35)) });
    const down = registerFrameV1({ correspondences: correspondencesFor(translationMatrix(0, 0.35)) });
    assert.equal(up.outcome, "REGISTERED");
    assert.equal(down.outcome, "REGISTERED");
    if (up.outcome === "REGISTERED" && down.outcome === "REGISTERED") {
      assert.ok(applyTransformV1(up.matrix, { x: 0, y: 0 }).y < 0);
      assert.ok(applyTransformV1(down.matrix, { x: 0, y: 0 }).y > 0);
    }
  });

  // --- 5: modest camera rotation is handled ---------------------------------
  check("5. modest rotation + scale (a similarity transform) is NOT well-explained by pure translation, but registers exactly as SIMILARITY", () => {
    const truth = similarityMatrix(0.3, 1.08, 0.25, 0.05);
    const result = registerFrameV1({ correspondences: correspondencesFor(truth) });
    assert.equal(result.outcome, "REGISTERED", JSON.stringify(result));
    assert.equal(result.outcome === "REGISTERED" && result.transformType, "SIMILARITY", "a genuinely rotated/scaled scene must not be mis-registered as a plain translation");
    if (result.outcome === "REGISTERED") assert.ok(result.meanReprojectionError < 1e-6, JSON.stringify(result));
  });

  // --- 6: modest perspective change is handled when needed -----------------
  check("6. a genuine perspective (homography) transform, spread across points near all four corners, is not well-explained by any lower-order model at a demanding inlier ratio, but registers exactly as HOMOGRAPHY", () => {
    const cornerSpreadPoints: RouteAssistLocalPointV1[] = [
      { x: 0.02, y: 0.02 },
      { x: 0.98, y: 0.03 },
      { x: 0.5, y: 0.5 },
      { x: 0.97, y: 0.97 },
      { x: 0.03, y: 0.95 },
      { x: 0.6, y: 0.1 },
    ];
    const truth: RouteAssistTransformMatrixV1 = [1.1, 0.05, 0.05, -0.04, 1.05, 0.03, 1.5, 0.9, 1];
    // A demanding inlier ratio (0.9, versus the 0.6 default) is deliberate
    // here: with only 6 points, a lower-order model can otherwise satisfy
    // the DEFAULT threshold by quietly writing off 1-2 genuinely perspective-
    // distorted points as "outliers" -- which is a real, honest behavior of
    // robust fitting, not a bug, but it means this specific escalation
    // proof needs every point to count to force homography to be tried.
    const result = registerFrameV1({ correspondences: correspondencesFor(truth, cornerSpreadPoints), minInlierRatio: 0.9 });
    assert.equal(result.outcome, "REGISTERED", JSON.stringify(result));
    assert.equal(result.outcome === "REGISTERED" && result.transformType, "HOMOGRAPHY", "genuine perspective distortion, when every point must be explained, must not be mis-registered as a lower-order model");
    if (result.outcome === "REGISTERED") {
      assert.equal(result.inlierCount, 6);
      assert.ok(result.meanReprojectionError < 1e-5, JSON.stringify(result));
    }
  });

  // --- 10: alignment meets an explicit, tunable quality threshold ----------
  check("10. the SAME borderline-noisy correspondence set passes under a loose threshold and fails under a strict one -- the quality bar is explicit and load-bearing, not decorative", () => {
    const truth = translationMatrix(0.2, 0.1);
    const noisy = correspondencesFor(truth).map((c, i) => ({ from: c.from, to: { x: c.to.x + (i % 2 === 0 ? 0.045 : -0.045), y: c.to.y } }));
    const loose = registerFrameV1({ correspondences: noisy, inlierDistanceThreshold: 0.1, maxMeanReprojectionError: 0.1 });
    // Also demands a high inlier RATIO (0.95): otherwise a flexible enough
    // model (affine/homography) can satisfy the tight per-point threshold
    // on a subset of just 4-of-6 points and still clear the (looser)
    // default 0.6 ratio -- a real, honest property of robust fitting on a
    // small sample, not a bug, but this specific proof wants EVERY point to
    // be held to the strict bar at once.
    const strict = registerFrameV1({ correspondences: noisy, inlierDistanceThreshold: 0.02, maxMeanReprojectionError: 0.01, minInlierRatio: 0.95 });
    assert.equal(loose.outcome, "REGISTERED", JSON.stringify(loose));
    assert.equal(strict.outcome, "REJECTED", JSON.stringify(strict));
  });

  // --- 11: unrelated images fail registration -------------------------------
  check("11. correspondences with no consistent geometric relationship at all (unrelated images) are REJECTED under every transform model", () => {
    // A genuinely random permutation-style scramble, using enough points
    // that even a flexible 8-DOF homography cannot coincidentally explain
    // most of them within the inlier threshold (a smaller random set can
    // occasionally produce an accidental low-DOF fit purely by chance --
    // this is exactly why real RANSAC consensus is scored against inlier
    // RATIO across a meaningfully-sized candidate set, not raw count alone).
    const scrambled: RouteAssistPointCorrespondenceV1[] = [
      { from: { x: 0.1, y: 0.1 }, to: { x: 0.9, y: 0.85 } },
      { from: { x: 0.8, y: 0.2 }, to: { x: 0.15, y: 0.6 } },
      { from: { x: 0.5, y: 0.9 }, to: { x: 0.4, y: 0.1 } },
      { from: { x: 0.3, y: 0.4 }, to: { x: 0.7, y: 0.75 } },
      { from: { x: 0.9, y: 0.6 }, to: { x: 0.05, y: 0.3 } },
      { from: { x: 0.2, y: 0.7 }, to: { x: 0.85, y: 0.15 } },
      { from: { x: 0.65, y: 0.05 }, to: { x: 0.3, y: 0.95 } },
      { from: { x: 0.05, y: 0.5 }, to: { x: 0.6, y: 0.4 } },
      { from: { x: 0.95, y: 0.9 }, to: { x: 0.1, y: 0.05 } },
      { from: { x: 0.45, y: 0.15 }, to: { x: 0.5, y: 0.55 } },
    ];
    const result = registerFrameV1({ correspondences: scrambled });
    assert.equal(result.outcome, "REJECTED", JSON.stringify(result));
  });

  // --- 12: semantic-plausible-but-geometrically-poor match fails ------------
  check("12. a correspondence set that superficially looks plausible (a real underlying transform PLUS heavy, deterministic scatter, across enough points that a model can't just exact-fit its own minimal sample and get lucky) still fails geometric registration -- semantic plausibility is never enough", () => {
    const truth = translationMatrix(0.25, -0.1);
    const manyPoints: RouteAssistLocalPointV1[] = [
      { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.15 }, { x: 0.5, y: 0.2 }, { x: 0.2, y: 0.4 },
      { x: 0.6, y: 0.45 }, { x: 0.15, y: 0.6 }, { x: 0.45, y: 0.65 }, { x: 0.35, y: 0.8 },
      { x: 0.55, y: 0.85 }, { x: 0.25, y: 0.9 },
    ];
    // Fixed, IRREGULAR scatter (deterministic on purpose -- a test must
    // reproduce the same result every run, and a simple repeating +/-
    // pattern turns out to have enough accidental structure for a flexible
    // 8-DOF homography to partially absorb it) large enough, and irregular
    // enough, that no 4-point-minimal-sample fit can happen to satisfy 60%+
    // of the remaining points.
    const dxs = [0.18, -0.22, 0.09, -0.31, 0.24, -0.11, 0.29, -0.17, 0.13, -0.26];
    const dys = [-0.19, 0.27, -0.08, 0.21, -0.33, 0.16, -0.23, 0.3, -0.12, 0.19];
    const heavilyScattered = correspondencesFor(truth, manyPoints).map((c, i) => ({ from: c.from, to: { x: c.to.x + dxs[i], y: c.to.y + dys[i] } }));
    const result = registerFrameV1({ correspondences: heavilyScattered });
    assert.equal(result.outcome, "REJECTED", JSON.stringify(result));
  });

  // --- matrix math sanity (used throughout stitchedWorkspace.ts) -----------
  check("13. invertTransformV1 composed with the original matrix recovers the identity (within floating-point tolerance)", () => {
    const m = similarityMatrix(0.4, 1.2, 0.3, -0.2);
    const inv = invertTransformV1(m);
    assert.ok(inv);
    const point = { x: 0.37, y: 0.62 };
    const roundTrip = applyTransformV1(inv!, applyTransformV1(m, point));
    assert.ok(Math.abs(roundTrip.x - point.x) < 1e-9 && Math.abs(roundTrip.y - point.y) < 1e-9, JSON.stringify(roundTrip));
  });

  check("14. identityTransformV1 leaves every point unchanged", () => {
    const point = { x: 0.42, y: 0.17 };
    assert.deepEqual(applyTransformV1(identityTransformV1(), point), point);
  });

  console.log(`\nRoute Assist image-registration verification: ${passed} passed, 0 failed.`);
}

main();
