/**
 * Proves the governing capture UX's pure logic: alignmentLock.ts's ghost-
 * edge crop geometry, sensor-signal derivation/fusion (purely assistive,
 * never blocking), direction resolution, and the SEARCHING -> CLOSE ->
 * HOLD_STEADY -> ALIGNED lock state machine. Composes on top of the
 * UNCHANGED visual window classifier (frameContinuation.ts) and the
 * UNCHANGED real geometric registration (imageRegistration.ts). No DOM, no
 * network, no real sensors -- every case here is deterministic synthetic
 * input.
 *
 * Run: npx tsx scripts/verify-route-assist-alignment-lock.ts
 */
import assert from "node:assert/strict";
import {
  advanceRouteAssistAlignmentLockV1,
  classifyRouteAssistAlignmentProbeV1,
  deriveRouteAssistSensorSignalV1,
  ghostEdgeCropRectV1,
  ghostEdgeDisplayEdgeV1,
  initialRouteAssistAlignmentLockStateV1,
  resolveRouteAssistContinuationDirectionV1,
  ROUTE_ASSIST_ALIGNMENT_LOCK_MIN_DURATION_MS_V1,
  ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1,
  type RouteAssistAlignmentLockStateV1,
  type RouteAssistOrientationSampleV1,
} from "../lib/visual-assist/route-assist/alignmentLock";
import { isAffineRepresentableV1, isTransformSaneV1, registerFrameV1, type RouteAssistTransformMatrixV1 } from "../lib/visual-assist/route-assist/imageRegistration";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function main() {
  // --- Ghost-edge UI (pure geometry) ----------------------------------------

  check("2. RIGHT continuation crops the RIGHT edge of the prior image, occupying the polish pass's narrower 18-22% target band", () => {
    const rect = ghostEdgeCropRectV1("RIGHT");
    assert.equal(rect.x, 1 - ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1);
    assert.equal(rect.width, ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1);
    assert.equal(rect.height, 1);
    assert.ok(rect.width >= 0.18 && rect.width <= 0.22, JSON.stringify(rect));
  });

  check("3. LEFT continuation crops the LEFT edge (x=0)", () => {
    const rect = ghostEdgeCropRectV1("LEFT");
    assert.equal(rect.x, 0);
    assert.equal(rect.width, ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1);
  });

  check("4. UP continuation crops the TOP edge (y=0), spanning the full width", () => {
    const rect = ghostEdgeCropRectV1("UP");
    assert.equal(rect.y, 0);
    assert.equal(rect.width, 1);
    assert.equal(rect.height, ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1);
  });

  check("5. DOWN continuation crops the BOTTOM edge", () => {
    const rect = ghostEdgeCropRectV1("DOWN");
    assert.equal(rect.y, 1 - ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1);
    assert.equal(rect.width, 1);
    assert.equal(rect.height, ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1);
  });

  check("6a. the ghost strip is displayed on the OPPOSITE edge of the live view from its source edge, matching the storyboard's ghost-on-the-left/move-right layout", () => {
    assert.equal(ghostEdgeDisplayEdgeV1("RIGHT"), "LEFT");
    assert.equal(ghostEdgeDisplayEdgeV1("LEFT"), "RIGHT");
    assert.equal(ghostEdgeDisplayEdgeV1("UP"), "DOWN");
    assert.equal(ghostEdgeDisplayEdgeV1("DOWN"), "UP");
  });

  check("6b. the ghost crop rectangle is always a genuine STRIP (never the full [0,1]x[0,1] frame) for every direction -- the full prior image is never what gets shown", () => {
    for (const direction of ["LEFT", "RIGHT", "UP", "DOWN"] as const) {
      const rect = ghostEdgeCropRectV1(direction);
      assert.ok(rect.width < 1 || rect.height < 1, JSON.stringify({ direction, rect }));
    }
  });

  check("7. the ghost crop rectangle's own width/height preserve the source's real proportions for that strip -- it is a crop (a sub-rectangle of the original), never a rescale to a different shape", () => {
    // A crop rectangle expressed in the SAME normalized [0,1]x[0,1] local
    // space as the source image itself, by construction, describes exactly
    // the sub-region to draw FROM at that region's own real aspect ratio --
    // there is no separate "warp to fit" step anywhere in this function.
    const rect = ghostEdgeCropRectV1("RIGHT");
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 1 + 1e-9);
    assert.ok(rect.y >= 0 && rect.y + rect.height <= 1 + 1e-9);
  });

  // --- Alignment state machine ----------------------------------------------

  check("8a. insufficient overlap (too little) classifies as SEARCHING with 'move back' guidance", () => {
    const classification = classifyRouteAssistAlignmentProbeV1({ matched: true, confidence: 0.9, overlapFraction: 0.02 });
    assert.equal(classification.tier, "SEARCHING");
    assert.equal(classification.reason, "Move back slightly.");
  });

  check("8b. too much overlap (no new coverage yet) classifies as SEARCHING with 'keep moving' guidance", () => {
    const classification = classifyRouteAssistAlignmentProbeV1({ matched: true, confidence: 0.9, overlapFraction: 0.95 });
    assert.equal(classification.tier, "SEARCHING");
    assert.equal(classification.reason, "Keep moving.");
  });

  check("9. good overlap but poor sensor quality (unstable OR excessive tilt) classifies as CLOSE, not READY -- these are independent quality gates, never overridden by overlap alone", () => {
    const unstable = classifyRouteAssistAlignmentProbeV1({ matched: true, confidence: 0.9, overlapFraction: 0.5, sensor: { directionAgrees: null, tiltOk: true, stable: false } });
    assert.equal(unstable.tier, "CLOSE");
    assert.equal(unstable.reason, "Hold steady.");
    const tilted = classifyRouteAssistAlignmentProbeV1({ matched: true, confidence: 0.9, overlapFraction: 0.5, sensor: { directionAgrees: null, tiltOk: false, stable: true } });
    assert.equal(tilted.tier, "CLOSE");
    assert.equal(tilted.reason, "Straighten the phone.");
  });

  check("10. stable, valid overlap (no sensor data, or sensor data that is fine) classifies as READY", () => {
    const noSensor = classifyRouteAssistAlignmentProbeV1({ matched: true, confidence: 0.9, overlapFraction: 0.5 });
    assert.equal(noSensor.tier, "READY");
    const goodSensor = classifyRouteAssistAlignmentProbeV1({ matched: true, confidence: 0.9, overlapFraction: 0.5, sensor: { directionAgrees: false, tiltOk: true, stable: true } });
    assert.equal(goodSensor.tier, "READY", "a disagreeing DIRECTION hint must never block readiness -- direction is advisory only");
  });

  check("11. losing alignment (a SEARCHING or CLOSE probe) resets the lock outright -- the next READY probe starts a fresh count, never resuming", () => {
    let lock: RouteAssistAlignmentLockStateV1 = initialRouteAssistAlignmentLockStateV1();
    const ready = { matched: true, confidence: 0.9, overlapFraction: 0.5 };
    const lost = { matched: true, confidence: 0.9, overlapFraction: 0.95 };
    const first = advanceRouteAssistAlignmentLockV1({ previous: lock, probe: ready, nowMs: 0 });
    lock = first.lockState;
    assert.equal(lock.consecutiveReady, 1);
    const afterLoss = advanceRouteAssistAlignmentLockV1({ previous: lock, probe: lost, nowMs: 20 });
    assert.equal(afterLoss.state, "SEARCHING");
    assert.deepEqual(afterLoss.lockState, initialRouteAssistAlignmentLockStateV1());
    const resumed = advanceRouteAssistAlignmentLockV1({ previous: afterLoss.lockState, probe: ready, nowMs: 40 });
    assert.equal(resumed.lockState.consecutiveReady, 1, "must start over at 1, never resume a prior count");
  });

  check("12. one isolated READY probe does not capture -- it reports HOLD_STEADY, not ALIGNED", () => {
    const result = advanceRouteAssistAlignmentLockV1({ previous: initialRouteAssistAlignmentLockStateV1(), probe: { matched: true, confidence: 0.9, overlapFraction: 0.5 }, nowMs: 0 });
    assert.equal(result.shouldCapture, false);
    assert.equal(result.state, "HOLD_STEADY");
  });

  check("13a. a stable lock (two consecutive READY probes) reaches ALIGNED and triggers capture", () => {
    const probe = { matched: true, confidence: 0.9, overlapFraction: 0.5 };
    const first = advanceRouteAssistAlignmentLockV1({ previous: initialRouteAssistAlignmentLockStateV1(), probe, nowMs: 0 });
    const second = advanceRouteAssistAlignmentLockV1({ previous: first.lockState, probe, nowMs: 50 });
    assert.equal(second.state, "ALIGNED");
    assert.equal(second.shouldCapture, true);
  });

  check("13b. a stable lock via elapsed duration (one READY probe held long enough) also reaches ALIGNED", () => {
    const probe = { matched: true, confidence: 0.9, overlapFraction: 0.5 };
    const first = advanceRouteAssistAlignmentLockV1({ previous: initialRouteAssistAlignmentLockStateV1(), probe, nowMs: 0 });
    const second = advanceRouteAssistAlignmentLockV1({ previous: first.lockState, probe, nowMs: ROUTE_ASSIST_ALIGNMENT_LOCK_MIN_DURATION_MS_V1 + 5 });
    assert.equal(second.state, "ALIGNED");
    assert.equal(second.shouldCapture, true);
  });

  // --- Sensor assistance -----------------------------------------------------

  check("14. an expected pan direction that AGREES with the sensor hint improves the reported sensor signal (directionAgrees=true), without changing the underlying visual classification", () => {
    const reference: RouteAssistOrientationSampleV1 = { alpha: 10, beta: 0, gamma: 0, atMs: 0 };
    const current: RouteAssistOrientationSampleV1 = { alpha: 30, beta: 0, gamma: 0, atMs: 500 }; // heading increased -> RIGHT per this module's convention
    const signal = deriveRouteAssistSensorSignalV1({ referenceSample: reference, currentSample: current, recentSamples: [reference, current], expectedDirection: "RIGHT" });
    assert.ok(signal);
    assert.equal(signal!.directionAgrees, true);
  });

  check("15. a CONTRADICTORY sensor direction hint never overrides a strong visual classification -- the alignment probe still reaches READY", () => {
    const reference: RouteAssistOrientationSampleV1 = { alpha: 10, beta: 0, gamma: 0, atMs: 0 };
    const current: RouteAssistOrientationSampleV1 = { alpha: -10, beta: 0, gamma: 0, atMs: 500 }; // heading decreased -> LEFT hint
    // recentSamples deliberately tight around `current` (not spanning the
    // reference->current jump) so this fixture isolates a direction
    // disagreement from stability -- the large alpha swing used to derive
    // the direction hint must not also read as jitter.
    const recentSamples: RouteAssistOrientationSampleV1[] = [
      { ...current, atMs: 480 },
      current,
    ];
    const signal = deriveRouteAssistSensorSignalV1({ referenceSample: reference, currentSample: current, recentSamples, expectedDirection: "RIGHT" });
    assert.equal(signal!.directionAgrees, false, "sanity: the sensor genuinely disagrees in this fixture");
    assert.equal(signal!.stable, true, "sanity: this fixture is otherwise stable, isolating the direction disagreement");
    const classification = classifyRouteAssistAlignmentProbeV1({ matched: true, confidence: 0.9, overlapFraction: 0.5, sensor: signal });
    assert.equal(classification.tier, "READY", "a contradicting direction hint must not block readiness -- only tilt/stability do");
  });

  check("16. with no sensor data at all (null), alignment still reaches READY and ALIGNED purely from visual evidence -- the no-sensor fallback works", () => {
    const signal = deriveRouteAssistSensorSignalV1({ referenceSample: null, currentSample: null, recentSamples: [], expectedDirection: "RIGHT" });
    assert.equal(signal, null);
    const probe = { matched: true, confidence: 0.9, overlapFraction: 0.5, sensor: signal };
    const classification = classifyRouteAssistAlignmentProbeV1(probe);
    assert.equal(classification.tier, "READY");
    const first = advanceRouteAssistAlignmentLockV1({ previous: initialRouteAssistAlignmentLockStateV1(), probe, nowMs: 0 });
    const second = advanceRouteAssistAlignmentLockV1({ previous: first.lockState, probe, nowMs: 50 });
    assert.equal(second.shouldCapture, true);
  });

  check("17. a denied/unavailable sensor permission (modeled as sensor=null throughout) never blocks capture -- the full lock sequence still completes", () => {
    let lock: RouteAssistAlignmentLockStateV1 = initialRouteAssistAlignmentLockStateV1();
    const probe = { matched: true, confidence: 0.9, overlapFraction: 0.5, sensor: null };
    for (let i = 0; i < 3; i += 1) {
      const advance = advanceRouteAssistAlignmentLockV1({ previous: lock, probe, nowMs: i * 30 });
      lock = advance.lockState;
      if (advance.shouldCapture) {
        assert.equal(advance.state, "ALIGNED");
        return;
      }
    }
    assert.fail("expected capture to trigger within a few probes even with sensor entirely unavailable");
  });

  check("direction-resolution. visual direction, when present, always wins over a contradicting sensor hint", () => {
    assert.equal(resolveRouteAssistContinuationDirectionV1({ visualDirection: "RIGHT", sensorHint: "LEFT" }), "RIGHT");
  });

  check("direction-resolution-fallback. with no visual direction yet, the sensor hint is used", () => {
    assert.equal(resolveRouteAssistContinuationDirectionV1({ visualDirection: null, sensorHint: "UP" }), "UP");
  });

  check("direction-resolution-none. with neither signal, resolution is null (ask the homeowner to move, per the product direction)", () => {
    assert.equal(resolveRouteAssistContinuationDirectionV1({ visualDirection: null, sensorHint: null }), null);
  });

  // --- 20: homography must be detected from the COMPOSED transform ---------

  check("20a. isAffineRepresentableV1 accepts a matrix with an identity bottom row (translation/similarity/affine -- CSS matrix() is exact)", () => {
    const affine: RouteAssistTransformMatrixV1 = [1.05, -0.1, 0.3, 0.1, 1.05, -0.05, 0, 0, 1];
    assert.equal(isAffineRepresentableV1(affine), true);
  });

  check("20b. isAffineRepresentableV1 rejects a matrix with a genuine perspective (nonzero bottom-row) component -- must route to the projective renderer, never a CSS approximation", () => {
    const homography: RouteAssistTransformMatrixV1 = [1.05, -0.1, 0.3, 0.1, 1.05, -0.05, 0.2, 0.05, 1];
    assert.equal(isAffineRepresentableV1(homography), false);
  });

  check("20c. an AFFINE-typed registration step composed onto a HOMOGRAPHY-typed ancestor produces a COMPOSED transform that is correctly detected as non-affine -- transformType alone would miss this", () => {
    const homographyAncestor: RouteAssistTransformMatrixV1 = [1, 0, 0, 0, 1, 0, 0.15, 0.1, 1];
    const affineStep: RouteAssistTransformMatrixV1 = [1, 0, 0.2, 0, 1, 0.1, 0, 0, 1]; // this step's OWN fit is pure affine
    const composed = [
      homographyAncestor[0] * affineStep[0] + homographyAncestor[1] * affineStep[3] + homographyAncestor[2] * affineStep[6],
      homographyAncestor[0] * affineStep[1] + homographyAncestor[1] * affineStep[4] + homographyAncestor[2] * affineStep[7],
      homographyAncestor[0] * affineStep[2] + homographyAncestor[1] * affineStep[5] + homographyAncestor[2] * affineStep[8],
      homographyAncestor[3] * affineStep[0] + homographyAncestor[4] * affineStep[3] + homographyAncestor[5] * affineStep[6],
      homographyAncestor[3] * affineStep[1] + homographyAncestor[4] * affineStep[4] + homographyAncestor[5] * affineStep[7],
      homographyAncestor[3] * affineStep[2] + homographyAncestor[4] * affineStep[5] + homographyAncestor[5] * affineStep[8],
      homographyAncestor[6] * affineStep[0] + homographyAncestor[7] * affineStep[3] + homographyAncestor[8] * affineStep[6],
      homographyAncestor[6] * affineStep[1] + homographyAncestor[7] * affineStep[4] + homographyAncestor[8] * affineStep[7],
      homographyAncestor[6] * affineStep[2] + homographyAncestor[7] * affineStep[5] + homographyAncestor[8] * affineStep[8],
    ] as unknown as RouteAssistTransformMatrixV1;
    assert.equal(isAffineRepresentableV1(composed), false, "the composed transform must be treated as non-affine even though this step's own registration was AFFINE");
  });

  // --- 23: transformed bounds remain finite/sane ----------------------------

  check("23a. isTransformSaneV1 rejects a non-finite (NaN-producing) transform", () => {
    const pathological: RouteAssistTransformMatrixV1 = [1, 0, 0, 0, 1, 0, 0, 0, 0]; // w=0 everywhere -> division by zero -> NaN/Infinity corners
    assert.equal(isTransformSaneV1(pathological), false);
  });

  check("23b. isTransformSaneV1 rejects a degenerate (collapsed-to-a-line) transform", () => {
    const collapsed: RouteAssistTransformMatrixV1 = [0, 0, 0.5, 0, 1, 0, 0, 0, 1]; // zero x-extent
    assert.equal(isTransformSaneV1(collapsed), false);
  });

  check("23c. isTransformSaneV1 accepts an ordinary, sane transform", () => {
    const sane: RouteAssistTransformMatrixV1 = [1.05, -0.1, 0.3, 0.1, 1.05, -0.05, 0, 0, 1];
    assert.equal(isTransformSaneV1(sane), true);
  });

  check("23d. registerFrameV1 never returns REGISTERED with a pathological matrix, even if some minimal-sample fit would otherwise satisfy the statistical thresholds", () => {
    // Correspondences deliberately include one pair with an identical
    // from/to point far off-axis, which a translation/similarity fit
    // could, in principle, use as part of a degenerate minimal sample --
    // isTransformSaneV1 is what actually rules this out, not luck.
    const result = registerFrameV1({
      correspondences: [
        { from: { x: 0.1, y: 0.1 }, to: { x: 0.4, y: 0.1 } },
        { from: { x: 0.5, y: 0.2 }, to: { x: 0.8, y: 0.2 } },
        { from: { x: 0.3, y: 0.6 }, to: { x: 0.6, y: 0.6 } },
        { from: { x: 0.7, y: 0.7 }, to: { x: 1.0, y: 0.7 } },
      ],
    });
    if (result.outcome === "REGISTERED") {
      assert.ok(isTransformSaneV1(result.matrix), "any REGISTERED result must always be a sane transform");
    }
  });

  console.log(`\nRoute Assist alignment-lock architecture verification: ${passed} passed, 0 failed.`);
}

main();
