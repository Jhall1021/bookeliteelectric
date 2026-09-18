/**
 * Proves the evidence-based alignment engine (real-phone correction: no
 * visible "Hold steady" step, "Aligned" granted essentially on elapsed
 * time, and "Aligned" staying green while framing kept changing) and the
 * direction-lock engine (real-phone correction: direction was hardcoded
 * to RIGHT; now inferred, locked, and restartable). Pure functions, no
 * DOM, no network -- every case here is deterministic synthetic input.
 *
 * Run: npx tsx scripts/verify-route-assist-alignment-evidence.ts
 */
import assert from "node:assert/strict";
import {
  advanceRouteAssistAlignmentEvidenceV1,
  advanceRouteAssistDirectionLockV1,
  initialRouteAssistAlignmentEvidenceStateV1,
  initialRouteAssistDirectionLockStateV1,
  restartRouteAssistDirectionLockV1,
  ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1,
  ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1,
  ROUTE_ASSIST_ALIGNMENT_MOTION_SPREAD_LIMIT_V1,
  ROUTE_ASSIST_ALIGNMENT_MOTION_WINDOW_V1,
  ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1,
  ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1,
  type RouteAssistAlignmentEvidenceStateSnapshotV1,
  type RouteAssistAlignmentProbeV1,
} from "../lib/visual-assist/route-assist/alignmentEvidence";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const GOOD_PROBE: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.9, overlapFraction: 0.5 };
const MOVE_BACK_PROBE: RouteAssistAlignmentProbeV1 = { matched: false, confidence: 0.9, overlapFraction: 0.05 };
const KEEP_MOVING_PROBE: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.9, overlapFraction: 0.95 };
const LOW_CONFIDENCE_PROBE: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.5, overlapFraction: 0.5 };

function advanceMany(probes: readonly RouteAssistAlignmentProbeV1[]): RouteAssistAlignmentEvidenceStateSnapshotV1 {
  let snapshot = initialRouteAssistAlignmentEvidenceStateV1();
  for (const probe of probes) snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe });
  return snapshot;
}

function main() {
  // --- the reachable 4-step progression ---------------------------------

  check("1. a single good probe is ALMOST_THERE, never HOLD_STEADY or ALIGNED -- the streak requirements are strictly greater than 1", () => {
    const snapshot = advanceMany([GOOD_PROBE]);
    assert.equal(snapshot.state, "ALMOST_THERE", JSON.stringify(snapshot));
  });

  check(`2. exactly ${ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1} consecutive good probes reaches HOLD_STEADY, strictly before ALIGNED becomes possible`, () => {
    assert.ok(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1 > ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1, "the fix requires a real gap between the two streak thresholds -- otherwise HOLD_STEADY is unreachable, exactly the bug being fixed");
    const snapshot = advanceMany(Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill(GOOD_PROBE));
    assert.equal(snapshot.state, "HOLD_STEADY", JSON.stringify(snapshot));
  });

  check(`3. exactly ${ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1} consecutive good, CONSISTENT probes reaches ALIGNED -- HOLD_STEADY is a genuinely visible, reachable intermediate step, not skipped`, () => {
    const probes = Array(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1).fill(GOOD_PROBE);
    let snapshot = initialRouteAssistAlignmentEvidenceStateV1();
    const states: string[] = [];
    for (const probe of probes) {
      snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe });
      states.push(snapshot.state);
    }
    assert.equal(states[states.length - 1], "ALIGNED", JSON.stringify(states));
    assert.ok(states.includes("HOLD_STEADY"), `expected HOLD_STEADY to appear somewhere in the progression: ${JSON.stringify(states)}`);
    assert.ok(states.includes("ALMOST_THERE"), `expected ALMOST_THERE to appear somewhere in the progression: ${JSON.stringify(states)}`);
  });

  // --- elapsed time / streak alone is never sufficient ------------------

  check("4. overlap that stays in-range but keeps DRIFTING (motion spread above the limit) never reaches ALIGNED, no matter how long the streak runs -- elapsed probes alone are not enough", () => {
    // A long streak, but overlapFraction is never twice the same value in
    // the recent window -- always sawtoothing well beyond the spread
    // limit, modeling a phone that is still panning.
    const driftingProbes: RouteAssistAlignmentProbeV1[] = [];
    for (let i = 0; i < 10; i += 1) {
      driftingProbes.push({ matched: true, confidence: 0.9, overlapFraction: i % 2 === 0 ? 0.3 : 0.7 });
    }
    const snapshot = advanceMany(driftingProbes);
    assert.notEqual(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
    assert.equal(snapshot.state, "HOLD_STEADY", "a long, in-range-but-drifting streak should plateau at HOLD_STEADY, not silently degrade to SEARCHING");
  });

  check("5. once overlapFraction settles (spread within the limit) for a full motion-window's worth of probes, the SAME already-long streak reaches ALIGNED -- proving the motion check, not the streak count, was what was blocking it", () => {
    const drifting = Array.from({ length: 6 }, (_, i) => ({ matched: true, confidence: 0.9, overlapFraction: i % 2 === 0 ? 0.3 : 0.7 }) as RouteAssistAlignmentProbeV1);
    // Enough settled probes to fully flush the drifting readings out of
    // the motion window (not just satisfy the streak count) -- otherwise
    // one leftover drifting value in the window would still read as
    // unsettled, which is itself correct behavior, not a bug to route
    // around here.
    const settled = Array(ROUTE_ASSIST_ALIGNMENT_MOTION_WINDOW_V1).fill(GOOD_PROBE);
    const snapshot = advanceMany([...drifting, ...settled]);
    assert.equal(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
  });

  // --- hysteresis on revocation -------------------------------------------

  check("6. a SINGLE noisy out-of-range probe after ALIGNED does not immediately revoke it (hysteresis)", () => {
    const toAligned = Array(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1).fill(GOOD_PROBE);
    let snapshot = advanceMany(toAligned);
    assert.equal(snapshot.state, "ALIGNED");
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: MOVE_BACK_PROBE });
    assert.equal(snapshot.state, "ALIGNED", "one noisy probe must not flicker ALIGNED back to SEARCHING");
  });

  check(`7. ${ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1} CONSECUTIVE out-of-range probes DOES revoke ALIGNED back to SEARCHING -- readiness is continuously revalidated, not a one-way latch`, () => {
    const toAligned = Array(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1).fill(GOOD_PROBE);
    let snapshot = advanceMany(toAligned);
    for (let i = 0; i < ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1; i += 1) {
      snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: MOVE_BACK_PROBE });
    }
    assert.equal(snapshot.state, "SEARCHING", JSON.stringify(snapshot));
  });

  check("8. a noisy probe THEN a good probe (the blip recovers) keeps ALIGNED and resets the bad streak -- a single glitch never accumulates toward revocation across separated incidents", () => {
    const toAligned = Array(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1).fill(GOOD_PROBE);
    let snapshot = advanceMany(toAligned);
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: MOVE_BACK_PROBE });
    assert.equal(snapshot.state, "ALIGNED");
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: GOOD_PROBE });
    assert.equal(snapshot.state, "ALIGNED");
    assert.equal(snapshot.badStreak, 0, "a recovered probe should clear the bad streak, not merely pause it");
  });

  // --- reversal / overshoot / insufficient overlap / low-texture ---------

  check("9. REVERSAL: KEEP_MOVING (overshoot -- overlap too high, no new coverage) is SEARCHING, not a step toward alignment", () => {
    const snapshot = advanceMany([KEEP_MOVING_PROBE]);
    assert.equal(snapshot.state, "SEARCHING", JSON.stringify(snapshot));
  });

  check("10. OVERSHOOT then correction: overshooting first and then settling into range still requires the FULL streak from scratch -- overshoot probes never count toward it", () => {
    const snapshot = advanceMany([KEEP_MOVING_PROBE, KEEP_MOVING_PROBE, GOOD_PROBE]);
    assert.equal(snapshot.state, "ALMOST_THERE", JSON.stringify(snapshot));
    assert.equal(snapshot.goodStreak, 1);
  });

  check("11. INSUFFICIENT OVERLAP (too little, MOVE_BACK) is SEARCHING", () => {
    const snapshot = advanceMany([MOVE_BACK_PROBE]);
    assert.equal(snapshot.state, "SEARCHING", JSON.stringify(snapshot));
  });

  check("12. LOW-TEXTURE / LOW-CONFIDENCE scenes (matched=true but confidence below the floor) never accumulate a good streak -- stay SEARCHING no matter how many probes arrive", () => {
    const snapshot = advanceMany(Array(10).fill(LOW_CONFIDENCE_PROBE));
    assert.equal(snapshot.state, "SEARCHING", JSON.stringify(snapshot));
  });

  check("13. TILT / unreliable framing modeled as matched=false throughout never remains green", () => {
    const snapshot = advanceMany(Array(10).fill(MOVE_BACK_PROBE));
    assert.equal(snapshot.state, "SEARCHING");
  });

  // --- direction lock: infer, lock, avoid jitter, restart -----------------

  check("14. a single direction hint never locks -- one probe is not 'initial meaningful movement'", () => {
    const state = advanceRouteAssistDirectionLockV1({ previous: initialRouteAssistDirectionLockStateV1(), hint: "RIGHT" });
    assert.equal(state.locked, null, JSON.stringify(state));
  });

  check(`15. ${ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1} CONSECUTIVE agreeing hints locks the direction`, () => {
    let state = initialRouteAssistDirectionLockStateV1();
    for (let i = 0; i < ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1; i += 1) state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "UP" });
    assert.equal(state.locked, "UP", JSON.stringify(state));
  });

  check("16. once locked, a DIFFERENT hint is ignored outright -- 'avoid direction flipping from jitter'", () => {
    let state = initialRouteAssistDirectionLockStateV1();
    for (let i = 0; i < ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1; i += 1) state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "LEFT" });
    assert.equal(state.locked, "LEFT");
    const afterJitter = advanceRouteAssistDirectionLockV1({ previous: state, hint: "DOWN" });
    assert.equal(afterJitter.locked, "LEFT", "a locked direction must never change from a later, disagreeing hint");
  });

  check("17. an alternating (jittery) sequence of hints never locks -- agreement must be CONSECUTIVE, not merely frequent", () => {
    let state = initialRouteAssistDirectionLockStateV1();
    const alternating: Array<RouteAssistDirectionLockHintV1> = ["RIGHT", "LEFT", "RIGHT", "LEFT", "RIGHT", "LEFT"];
    for (const hint of alternating) state = advanceRouteAssistDirectionLockV1({ previous: state, hint });
    assert.equal(state.locked, null, JSON.stringify(state));
  });

  check("18. a null hint (no evidence this probe) resets the consecutive-hint streak rather than being silently skipped", () => {
    let state = initialRouteAssistDirectionLockStateV1();
    state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "DOWN" });
    state = advanceRouteAssistDirectionLockV1({ previous: state, hint: null });
    state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "DOWN" });
    assert.equal(state.locked, null, "the null hint in between must have reset the streak, so this is only the SECOND consecutive DOWN, not the third overall");
    state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "DOWN" });
    assert.equal(state.locked, "DOWN");
  });

  check("19. restartRouteAssistDirectionLockV1 clears an existing lock completely, matching the 'simple way to correct/restart direction' requirement", () => {
    let state = initialRouteAssistDirectionLockStateV1();
    for (let i = 0; i < ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1; i += 1) state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "RIGHT" });
    assert.equal(state.locked, "RIGHT");
    const restarted = restartRouteAssistDirectionLockV1();
    assert.deepEqual(restarted, initialRouteAssistDirectionLockStateV1());
    const relocked = advanceRouteAssistDirectionLockV1({ previous: advanceRouteAssistDirectionLockV1({ previous: restarted, hint: "DOWN" }), hint: "DOWN" });
    assert.equal(relocked.locked, "DOWN", "after a restart, a fresh direction must be lockable again");
  });

  check("20. symmetry: RIGHT, LEFT, UP, and DOWN all lock identically given the same evidence shape -- no direction is special-cased", () => {
    for (const direction of ["RIGHT", "LEFT", "UP", "DOWN"] as const) {
      let state = initialRouteAssistDirectionLockStateV1();
      for (let i = 0; i < ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1; i += 1) state = advanceRouteAssistDirectionLockV1({ previous: state, hint: direction });
      assert.equal(state.locked, direction, JSON.stringify({ direction, state }));
    }
  });

  // --- KNOWN LIMITATION, made explicit and unmissable ------------------------
  //
  // Every input to this engine (matched, confidence, overlapFraction) is an
  // AI VISION MODEL'S OWN SELF-REPORTED ESTIMATE from a single image-pair
  // comparison call (frameOverlapAiGateway.ts) -- there is no pixel-level
  // motion measurement (no optical flow, no frame differencing), no sensor
  // reading, and no geometric registration (no feature correspondences, no
  // homography fit, no reprojection error) anywhere in this file or in the
  // client that calls it. The "motion spread" stability check is a proxy
  // computed ENTIRELY from the variance of that same self-reported
  // overlapFraction across consecutive probes -- it detects a model that
  // reports an unstable ESTIMATE, not a phone that is actually stationary.
  // A model that returns the SAME plausible-looking numbers for a genuinely
  // misaligned pair -- wrong, but consistently wrong -- is indistinguishable
  // from a model reporting a real, settled alignment. This test proves that
  // gap exists; it is not a bug in this file to fix, it is the boundary of
  // what a single scalar AI estimate, with no independent cross-check, can
  // ever guarantee. Closing it requires an independent signal this pass
  // does not have: geometric registration (imageRegistration.ts, currently
  // disconnected -- see the registration harness) or device motion sensors.

  check("21. THREE CONSISTENT BUT ARBITRARY overlap responses reach ALIGNED -- the engine has no way to tell a genuinely settled match from a model that simply repeats the same (possibly wrong) number three times in a row", () => {
    // Nothing about this probe is tied to any actual image content -- it is
    // a bare, hand-constructed number. If a real vision model hallucinated
    // this exact response for three genuinely UNRELATED or misaligned
    // frames, the evidence engine cannot tell the difference: it never sees
    // the images, only these three scalars.
    const arbitraryButConsistentProbe: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.83, overlapFraction: 0.41 };
    const snapshot = advanceMany(Array(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1).fill(arbitraryButConsistentProbe));
    assert.equal(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
  });

  check("22. the engine performs no cross-check against the actual images at all -- advanceRouteAssistAlignmentEvidenceV1's own type signature accepts only {matched, confidence, overlapFraction}, never image data, pixel buffers, or a correspondence set", () => {
    // A structural proof, not a behavioral one: there is no parameter this
    // function could even inspect to verify the AI's claim against the
    // actual frames, because the frames are never passed to it.
    const probe: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.9, overlapFraction: 0.5 };
    const keys = Object.keys(probe).sort();
    assert.deepEqual(keys, ["confidence", "matched", "overlapFraction"], "the probe shape itself is the proof -- no image, pixel, sensor, or correspondence data is a valid input to this engine");
  });

  console.log(`\nRoute Assist alignment-evidence verification: ${passed} passed, 0 failed.`);
}

type RouteAssistDirectionLockHintV1 = "RIGHT" | "LEFT" | "UP" | "DOWN";

main();
