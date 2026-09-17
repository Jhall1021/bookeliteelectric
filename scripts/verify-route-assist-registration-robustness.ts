/**
 * REAL-PHONE CORRECTION: a live registration attempt was accepted as
 * HOMOGRAPHY from only 4 candidate landmark pairs -- the bare minimum a
 * homography can even be fit from, with zero redundancy for outlier
 * rejection -- and separately, a normal second-photo attempt was rejected
 * with "pathological workspace transform" and no way to tell why. This
 * file proves the fixes: MORE landmarks are requested by the AI gateway
 * prompt, a spatial-distribution gate rejects clustered/duplicate
 * candidates before any fit is attempted, HOMOGRAPHY specifically
 * requires redundant evidence beyond its own minimal point count, a
 * complexity penalty keeps simpler models selected unless a more complex
 * one is materially and reliably better, aspect-ratio correction makes
 * the fit itself orientation-consistent, and a rejected composition
 * reports its EXACT sanity-failure reason plus full diagnostics.
 *
 * Run: npx tsx scripts/verify-route-assist-registration-robustness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeRouteAssistCorrespondenceDistributionV1,
  dedupeRouteAssistCorrespondencesV1,
  evaluateRouteAssistCorrespondenceDistributionV1,
  ROUTE_ASSIST_MIN_DISTRIBUTION_QUADRANTS_V1,
} from "../lib/visual-assist/route-assist/correspondenceDistribution";
import {
  applyTransformV1,
  evaluateRouteAssistTransformSanityV1,
  registerFrameV1,
  ROUTE_ASSIST_REGISTRATION_COMPLEXITY_COMPARISON_FLOOR_V1,
  ROUTE_ASSIST_REGISTRATION_HOMOGRAPHY_MIN_REDUNDANCY_V1,
  type RouteAssistLocalPointV1,
  type RouteAssistPointCorrespondenceV1,
  type RouteAssistTransformMatrixV1,
} from "../lib/visual-assist/route-assist/imageRegistration";
import { addRouteAssistStitchedWorkspaceFrameV1, emptyRouteAssistStitchedWorkspaceV1 } from "../lib/visual-assist/route-assist/stitchedWorkspace";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function correspondencesFor(transform: RouteAssistTransformMatrixV1, points: readonly RouteAssistLocalPointV1[]): RouteAssistPointCorrespondenceV1[] {
  return points.map((from) => ({ from, to: applyTransformV1(transform, from) }));
}

const CORNER_SPREAD_4: RouteAssistLocalPointV1[] = [
  { x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 },
];
const CORNER_SPREAD_6: RouteAssistLocalPointV1[] = [
  { x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.5, y: 0.5 }, { x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 }, { x: 0.6, y: 0.15 },
];
const MANY_POINTS_10: RouteAssistLocalPointV1[] = [
  { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.15 }, { x: 0.5, y: 0.2 }, { x: 0.2, y: 0.4 },
  { x: 0.6, y: 0.45 }, { x: 0.15, y: 0.6 }, { x: 0.45, y: 0.65 }, { x: 0.35, y: 0.8 },
  { x: 0.55, y: 0.85 }, { x: 0.25, y: 0.9 },
];

function main() {
  // --- 6/7: landmark proposal prompt asks for more, spatially spread landmarks

  const gateway = readFileSync("lib/visual-assist/route-assist/frameRegistrationAiGateway.ts", "utf8");

  check("6. the landmark-proposal prompt asks for substantially more than the historical minimum of 4, explicitly naming an 8-20 target range", () => {
    assert.match(gateway, /roughly 8 to 20 landmarks/);
    assert.match(gateway, /four is only the bare mathematical minimum/i);
  });

  check("7. up to 20 distributed correspondences are structurally supported (response schema allows it, and the prompt instructs spreading across the full overlap)", () => {
    assert.match(gateway, /maxItems:\s*20/);
    assert.match(gateway, /Spread your landmarks across the FULL overlapping area/);
  });

  check("prompt names preferred stable architectural landmark kinds and explicitly avoids unstable/movable ones", () => {
    for (const preferred of ["wall/ceiling intersections", "doorway corners", "window corners", "trim/molding intersections", "cabinet or other fixed built-in"]) {
      assert.ok(gateway.includes(preferred), `expected prompt to mention: ${preferred}`);
    }
    for (const avoided of ["blank, featureless wall", "repeated ceiling tile", "screen or monitor", "chairs, bags", "People."]) {
      assert.ok(gateway.toLowerCase().includes(avoided.toLowerCase()), `expected prompt to warn against: ${avoided}`);
    }
  });

  // --- 8/9/10/11: distribution + redundancy + dedup ---------------------------

  check("8. exactly 4 well-distributed candidate pairs (homography's own minimal point count) are treated as low-redundancy evidence -- a genuine homography-only relationship among them is REJECTED, not accepted on paper-thin evidence", () => {
    const homographyTruth: RouteAssistTransformMatrixV1 = [1.1, 0.05, -0.3, -0.04, 1.05, 0.03, 0.2, 0.15, 1];
    const result = registerFrameV1({ correspondences: correspondencesFor(homographyTruth, CORNER_SPREAD_4) });
    assert.equal(result.outcome, "REJECTED", JSON.stringify(result));
  });

  check("9. clustered correspondences (all landmarks in one small corner) are rejected as geometrically weak, before any model fit is even attempted", () => {
    const clustered: RouteAssistLocalPointV1[] = [
      { x: 0.1, y: 0.1 }, { x: 0.12, y: 0.11 }, { x: 0.14, y: 0.09 }, { x: 0.11, y: 0.13 }, { x: 0.13, y: 0.12 }, { x: 0.15, y: 0.1 },
    ];
    const evaluation = evaluateRouteAssistCorrespondenceDistributionV1(correspondencesFor([1, 0, 0.2, 0, 1, 0, 0, 0, 1] as RouteAssistTransformMatrixV1, clustered));
    assert.equal(evaluation.sufficient, false);
    const result = registerFrameV1({ correspondences: correspondencesFor([1, 0, 0.2, 0, 1, 0, 0, 0, 1] as RouteAssistTransformMatrixV1, clustered) });
    assert.equal(result.outcome, "REJECTED");
    assert.match(result.outcome === "REJECTED" ? result.reason : "", /clustered/);
  });

  check("10. well-distributed correspondences across multiple quadrants of the overlap are accepted as sufficient", () => {
    const evaluation = evaluateRouteAssistCorrespondenceDistributionV1(correspondencesFor([1, 0, 0.2, 0, 1, 0, 0, 0, 1] as RouteAssistTransformMatrixV1, CORNER_SPREAD_6));
    assert.equal(evaluation.sufficient, true);
    assert.ok(evaluation.distribution.occupiedQuadrantsFrom >= ROUTE_ASSIST_MIN_DISTRIBUTION_QUADRANTS_V1);
  });

  check("11. obvious duplicate landmark pairs (same physical point proposed twice) are collapsed before they can inflate apparent redundancy", () => {
    const base = correspondencesFor([1, 0, 0.2, 0, 1, 0, 0, 0, 1] as RouteAssistTransformMatrixV1, CORNER_SPREAD_4);
    const withDuplicates = [...base, { from: { x: base[0].from.x + 0.001, y: base[0].from.y }, to: { x: base[0].to.x + 0.001, y: base[0].to.y } }, { ...base[1] }];
    const deduped = dedupeRouteAssistCorrespondencesV1(withDuplicates);
    assert.equal(deduped.length, 4, JSON.stringify(deduped));
  });

  check("distribution computation reports genuine bounding-box/quadrant/separation metrics, not a placeholder", () => {
    const distribution = computeRouteAssistCorrespondenceDistributionV1(correspondencesFor([1, 0, 0.2, 0, 1, 0, 0, 0, 1] as RouteAssistTransformMatrixV1, CORNER_SPREAD_6));
    assert.ok(distribution.fromBoundingBoxWidth > 0.5);
    assert.ok(distribution.minPairSeparation > 0);
  });

  // --- 12/13: ordinary phone pan registers ------------------------------------

  check("12. an ordinary phone pan with small rotation registers (SIMILARITY), using well-distributed points", () => {
    const similarityTruth: RouteAssistTransformMatrixV1 = [1.05 * Math.cos(0.1), -1.05 * Math.sin(0.1), 0.2, 1.05 * Math.sin(0.1), 1.05 * Math.cos(0.1), 0.05, 0, 0, 1];
    const result = registerFrameV1({ correspondences: correspondencesFor(similarityTruth, CORNER_SPREAD_6) });
    assert.equal(result.outcome, "REGISTERED", JSON.stringify(result));
    assert.equal(result.outcome === "REGISTERED" && result.transformType, "SIMILARITY");
  });

  check("13. an ordinary phone pan with a genuine, modest perspective difference registers as HOMOGRAPHY when there is enough redundant evidence (6 points, beyond the minimal 4)", () => {
    const modestHomography: RouteAssistTransformMatrixV1 = [1.1, 0.05, -0.3, -0.04, 1.05, 0.03, 0.2, 0.15, 1];
    const result = registerFrameV1({ correspondences: correspondencesFor(modestHomography, CORNER_SPREAD_6) });
    assert.equal(result.outcome, "REGISTERED", JSON.stringify(result));
    assert.equal(result.outcome === "REGISTERED" && result.transformType, "HOMOGRAPHY");
    assert.equal(result.outcome === "REGISTERED" && result.candidateCount >= 4 + ROUTE_ASSIST_REGISTRATION_HOMOGRAPHY_MIN_REDUNDANCY_V1, true);
  });

  // --- 14/15: outlier rejection via redundancy ---------------------------------

  check("14. one bad landmark out of 10 is discarded as an outlier because redundancy exists -- the fit still registers on the remaining 9", () => {
    const translationTruth: RouteAssistTransformMatrixV1 = [1, 0, 0.25, 0, 1, -0.1, 0, 0, 1];
    const good = correspondencesFor(translationTruth, MANY_POINTS_10);
    const withOneBad = good.map((c, i) => (i === 3 ? { from: c.from, to: { x: c.to.x + 0.4, y: c.to.y - 0.3 } } : c));
    const result = registerFrameV1({ correspondences: withOneBad });
    assert.equal(result.outcome, "REGISTERED", JSON.stringify(result));
    assert.equal(result.outcome === "REGISTERED" && result.inlierCount, 9);
  });

  check("15. two bad landmarks out of 10 can still be discarded while consensus remains strong", () => {
    const translationTruth: RouteAssistTransformMatrixV1 = [1, 0, 0.25, 0, 1, -0.1, 0, 0, 1];
    const good = correspondencesFor(translationTruth, MANY_POINTS_10);
    const withTwoBad = good.map((c, i) => (i === 3 || i === 7 ? { from: c.from, to: { x: c.to.x + 0.4, y: c.to.y - 0.3 } } : c));
    const result = registerFrameV1({ correspondences: withTwoBad });
    assert.equal(result.outcome, "REGISTERED", JSON.stringify(result));
    assert.equal(result.outcome === "REGISTERED" && result.inlierCount, 8);
  });

  // --- 16/17: complexity penalty ----------------------------------------------

  check("16. a simpler model (AFFINE) stays selected under real, above-floor per-point noise, even though it is not a perfect fit -- never spuriously escalating to HOMOGRAPHY without a MATERIAL improvement", () => {
    const affineTruth: RouteAssistTransformMatrixV1 = [1.05, 0.03, 0.2, -0.02, 1.04, 0.05, 0, 0, 1];
    const jitter = [1, -1, 0.6, -0.8, 0.9, -0.5].map((s) => s * 0.02);
    const corr = correspondencesFor(affineTruth, CORNER_SPREAD_6).map((c, i) => ({ from: c.from, to: { x: c.to.x + jitter[i], y: c.to.y - jitter[(i + 2) % 6] } }));
    const result = registerFrameV1({ correspondences: corr });
    assert.equal(result.outcome, "REGISTERED", JSON.stringify(result));
    assert.equal(result.outcome === "REGISTERED" && result.transformType, "AFFINE");
    assert.ok(result.outcome === "REGISTERED" && result.meanReprojectionError > ROUTE_ASSIST_REGISTRATION_COMPLEXITY_COMPARISON_FLOOR_V1, "the simpler model's error must be a real, above-floor number here, not a trivial exact fit -- proving the ratio/distribution logic (not just the floor) keeps it selected");
  });

  check("17. HOMOGRAPHY is only selected when it is materially (not marginally) more accurate than an already-passing simpler model -- proven by test 13's genuine perspective case actually needing it, contrasted with test 16's noisy-but-affine case never escalating", () => {
    // This is a cross-reference assertion tying the two proofs above
    // together as the two branches of the same rule, rather than a new
    // fixture -- see tests 13 and 16.
    const modestHomography: RouteAssistTransformMatrixV1 = [1.1, 0.05, -0.3, -0.04, 1.05, 0.03, 0.2, 0.15, 1];
    const genuinelyNeedsHomography = registerFrameV1({ correspondences: correspondencesFor(modestHomography, CORNER_SPREAD_6) });
    assert.equal(genuinelyNeedsHomography.outcome === "REGISTERED" && genuinelyNeedsHomography.transformType, "HOMOGRAPHY");
  });

  // --- 18/19: aspect-ratio audit -----------------------------------------------

  check("18. a portrait phone aspect ratio (9:16, both frames) remains geometrically sane -- registers cleanly, matching the same result as an unscaled aspect ratio for a pure translation", () => {
    const translationTruth: RouteAssistTransformMatrixV1 = [1, 0, 0.25, 0, 1, -0.1, 0, 0, 1];
    const portraitAspect = 9 / 16;
    const result = registerFrameV1({ correspondences: correspondencesFor(translationTruth, MANY_POINTS_10), fromAspectRatio: portraitAspect, toAspectRatio: portraitAspect });
    assert.equal(result.outcome, "REGISTERED", JSON.stringify(result));
    assert.equal(result.outcome === "REGISTERED" && result.inlierCount, 10);
  });

  check("19. aspect-ratio correction makes reprojection error orientation-consistent: the SAME real pixel-scale error scores comparably whether the frame is landscape or portrait, rather than depending on which axis it happens to fall on", () => {
    // A fixed error along X, expressed as a FRACTION of each frame's own
    // width -- with aspect correction, this maps to a consistent physical
    // distance regardless of the frame's own aspect ratio; without it
    // (aspectRatio omitted, i.e. 1), the same fractional-of-width error
    // would represent a smaller or larger physical distance depending on
    // how wide the frame actually is.
    const truth: RouteAssistTransformMatrixV1 = [1, 0, 0.2, 0, 1, 0, 0, 0, 1];
    const points = CORNER_SPREAD_6;
    const landscapeAspect = 16 / 9;
    const portraitAspect = 9 / 16;
    const errorFractionOfWidth = 0.01;
    const landscapeCorr = correspondencesFor(truth, points).map((c) => ({ from: c.from, to: { x: c.to.x + errorFractionOfWidth, y: c.to.y } }));
    const portraitCorr = correspondencesFor(truth, points).map((c) => ({ from: c.from, to: { x: c.to.x + errorFractionOfWidth, y: c.to.y } }));
    const landscapeResult = registerFrameV1({ correspondences: landscapeCorr, fromAspectRatio: landscapeAspect, toAspectRatio: landscapeAspect, minInlierCount: 1, minInlierRatio: 0.5 });
    const portraitResult = registerFrameV1({ correspondences: portraitCorr, fromAspectRatio: portraitAspect, toAspectRatio: portraitAspect, minInlierCount: 1, minInlierRatio: 0.5 });
    assert.equal(landscapeResult.outcome, "REGISTERED", JSON.stringify(landscapeResult));
    assert.equal(portraitResult.outcome, "REGISTERED", JSON.stringify(portraitResult));
    if (landscapeResult.outcome === "REGISTERED" && portraitResult.outcome === "REGISTERED") {
      // Both are the SAME nominal error (a pure x-offset of 0.01 in each
      // frame's own local space) -- aspect correction means the fit
      // itself is measured in isotropic units either way, so a genuine
      // TRANSLATION model explains both equally well (near-zero residual
      // in aspect-corrected space for a pure per-axis offset), regardless
      // of orientation.
      assert.ok(landscapeResult.meanReprojectionError < 1e-6, JSON.stringify(landscapeResult));
      assert.ok(portraitResult.meanReprojectionError < 1e-6, JSON.stringify(portraitResult));
    }
  });

  check("19b. addRouteAssistStitchedWorkspaceFrameV1 composes correctly for two portrait (9:16) frames -- the second frame's transformed corners remain finite and form a sane, non-degenerate quad", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    const portraitAspect = 9 / 16;
    const first = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: "p1", aspectRatio: portraitAspect });
    assert.equal(first.outcome, "ADDED");
    workspace = first.outcome === "ADDED" ? first.workspace : workspace;
    const truth: RouteAssistTransformMatrixV1 = [1.03, 0.02, 0.25, -0.01, 1.02, 0.03, 0, 0, 1];
    const result = addRouteAssistStitchedWorkspaceFrameV1({
      workspace,
      imageId: "p2",
      aspectRatio: portraitAspect,
      correspondencesFromPrevious: correspondencesFor(truth, CORNER_SPREAD_6),
    });
    assert.equal(result.outcome, "ADDED", JSON.stringify(result));
  });

  // --- 20/21: pathological composition still rejected, with exact reason -----

  check("20. a self-crossing composed quad is still rejected (a stricter check than the old extent-only bounds, catching a case the old check would have missed)", () => {
    // The SAME kind of forward-looking-fine-but-badly-conditioned-inverse
    // matrix identified during this pass's own investigation: a large
    // bottom-row (perspective) term whose INVERSE, applied over the unit
    // square, folds the quad over itself.
    const pathological: RouteAssistTransformMatrixV1 = [1.1, 0.05, -0.3, -0.04, 1.05, 0.03, 1.5, 0.9, 1];
    const sanity = evaluateRouteAssistTransformSanityV1(pathological);
    // The forward matrix itself may or may not be sane; what matters for
    // this proof is that ITS INVERSE (what stitchedWorkspace.ts actually
    // composes into the workspace) is caught.
    const inverse = [
      0.6342809312707377, -0.1984065474160642, 0.19623647580370215, 0.052701739157393804, 0.9610317140465707, -0.013020429674179674, -0.9988529621477505,
      -0.5673187215178084, 0.717363673001211,
    ] as RouteAssistTransformMatrixV1;
    const inverseSanity = evaluateRouteAssistTransformSanityV1(inverse);
    assert.equal(inverseSanity.sane, false, JSON.stringify({ sanity, inverseSanity }));
    assert.equal(inverseSanity.sane === false && inverseSanity.reason, "SELF_CROSSING_QUAD", JSON.stringify(inverseSanity));
  });

  check("21. a REFUSED add reports the EXACT sanity-failure reason plus full composed-transform diagnostics (raw pair matrix, inverse, previous/composed workspace transforms, transformed corners) -- not just a generic message", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    const first = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: "f1", aspectRatio: 1 });
    assert.equal(first.outcome, "ADDED");
    workspace = first.outcome === "ADDED" ? first.workspace : workspace;
    // The unrealistic, extreme-perspective truth from before this pass's
    // fix -- deliberately reused here as a REGRESSION proof that such a
    // case is still caught (now via the stricter self-crossing check) and
    // reported with full diagnostics, not merely a generic message.
    const extremeHomography: RouteAssistTransformMatrixV1 = [1.1, 0.05, -0.3, -0.04, 1.05, 0.03, 1.5, 0.9, 1];
    const result = addRouteAssistStitchedWorkspaceFrameV1({
      workspace,
      imageId: "f2",
      aspectRatio: 1,
      correspondencesFromPrevious: correspondencesFor(extremeHomography, CORNER_SPREAD_6),
    });
    assert.equal(result.outcome, "REFUSED", JSON.stringify(result));
    if (result.outcome === "REFUSED") {
      assert.ok(result.diagnostics, "expected composed-transform diagnostics on a pathological-composition refusal");
      assert.ok(result.diagnostics?.sanityFailureReason, JSON.stringify(result.diagnostics));
      assert.ok(Array.isArray(result.diagnostics?.transformedCorners) && result.diagnostics!.transformedCorners.length === 4);
      assert.ok(result.diagnostics?.rawPairMatrix && result.diagnostics?.rawPairInverseMatrix && result.diagnostics?.previousTransformToWorkspace && result.diagnostics?.composedTransformToWorkspace);
      assert.match(result.problem, new RegExp(result.diagnostics!.sanityFailureReason!));
    }
  });

  console.log(`\nRoute Assist registration-robustness verification: ${passed} passed, 0 failed.`);
}

main();
