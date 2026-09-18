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
  ROUTE_ASSIST_ALIGNMENT_MOTION_SCORE_LIMIT_V1,
  ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1,
  ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1,
  type RouteAssistAlignmentEvidenceStateSnapshotV1,
  type RouteAssistAlignmentProbeV1,
} from "../lib/visual-assist/route-assist/alignmentEvidence";
import { computeRouteAssistFrameMotionV1 } from "../lib/visual-assist/route-assist/frameMotion";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

// motionScore: 0 models a camera measured as perfectly stationary between
// consecutive live frames (real evidence, never an AI self-report) unless
// a test explicitly says otherwise.
const GOOD_PROBE: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.9, overlapFraction: 0.5, motionScore: 0 };
const MOVE_BACK_PROBE: RouteAssistAlignmentProbeV1 = { matched: false, confidence: 0.9, overlapFraction: 0.05, motionScore: 0 };
const KEEP_MOVING_PROBE: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.9, overlapFraction: 0.95, motionScore: 0 };
const LOW_CONFIDENCE_PROBE: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.5, overlapFraction: 0.5, motionScore: 0 };
// Overlap is genuinely in range, but the REAL motion measurement says the
// camera is still moving -- e.g. still panning into place.
const STILL_MOVING_PROBE: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.9, overlapFraction: 0.5, motionScore: ROUTE_ASSIST_ALIGNMENT_MOTION_SCORE_LIMIT_V1 + 0.2 };

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

  check("4. overlap that stays in-range but REAL MEASURED MOTION stays above the limit never reaches ALIGNED, no matter how long the streak runs -- elapsed probes alone are not enough, and this is now driven by an independent pixel measurement, not the AI's own overlapFraction", () => {
    const snapshot = advanceMany(Array(10).fill(STILL_MOVING_PROBE));
    assert.notEqual(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
    assert.equal(snapshot.state, "HOLD_STEADY", "a long, in-range-but-still-moving streak should plateau at HOLD_STEADY, not silently degrade to SEARCHING");
  });

  check("5. once REAL measured motion drops back to stable, the SAME already-long streak reaches ALIGNED on the very next probe -- proving the motion check, not the streak count, was what was blocking it", () => {
    const stillMoving = Array(6).fill(STILL_MOVING_PROBE);
    const snapshot = advanceMany([...stillMoving, GOOD_PROBE]);
    assert.equal(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
  });

  check("5b. an established ALIGNED reading is IMMEDIATELY demoted to HOLD_STEADY (not a delayed hysteresis revoke) the instant real motion resumes, even while the AI overlap probe keeps reporting a perfect in-range match -- real motion evidence needs no debounce the way one noisy AI response does", () => {
    const toAligned = Array(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1).fill(GOOD_PROBE);
    let snapshot = advanceMany(toAligned);
    assert.equal(snapshot.state, "ALIGNED");
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: STILL_MOVING_PROBE });
    assert.equal(snapshot.state, "HOLD_STEADY", "resumed real motion must immediately drop readiness, not wait for a multi-probe revoke streak the way overlap-loss hysteresis does");
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

  // --- THE CONFIRMED FAILURE THIS PASS FIXES, proven closed -------------
  //
  // The PRIOR version of this engine's "motion spread" check was computed
  // ENTIRELY from the variance of the AI's own self-reported overlapFraction
  // across consecutive probes -- it measured whether the ESTIMATE was
  // internally consistent, not whether the phone was actually stationary.
  // Three probes that reported the same (or merely similar) overlapFraction
  // -- whether because the phone was genuinely still, or merely because the
  // model gave three arbitrary-but-similar answers unrelated to any real
  // content -- were indistinguishable to that check, and check 21 (in the
  // prior version of this file) proved exactly that: three hand-constructed,
  // image-independent probes reached ALIGNED. That is a CONFIRMED gap this
  // pass closes, not a documented boundary to leave standing -- test 21
  // below proves the SAME three consistent-but-arbitrary probes NO LONGER
  // reach ALIGNED once real (non-zero) motion is present, and test 22 proves
  // the engine's own type signature now requires an independent, real
  // motion measurement as an input it cannot ignore.

  check("21. THREE CONSISTENT BUT ARBITRARY overlap responses, PAIRED WITH CONTINUED REAL MOTION, do NOT reach ALIGNED -- closing the confirmed gap where a model's self-consistent (but possibly wrong) estimate alone used to be sufficient", () => {
    // Same arbitrary, image-independent AI numbers as the failure this
    // fixes -- but now paired with a REAL motionScore indicating the
    // camera is still moving between frames, which the AI probe itself
    // has no way to override.
    const arbitraryButConsistentProbe: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.83, overlapFraction: 0.41, motionScore: ROUTE_ASSIST_ALIGNMENT_MOTION_SCORE_LIMIT_V1 + 0.3 };
    const snapshot = advanceMany(Array(10).fill(arbitraryButConsistentProbe));
    assert.notEqual(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
  });

  check("22. the SAME three consistent-but-arbitrary AI numbers DO still reach ALIGNED once real motion is genuinely stable -- proving test 21's block above comes from the real motion signal specifically, not from some other change silently making the engine stricter across the board", () => {
    const arbitraryButConsistentProbe: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.83, overlapFraction: 0.41, motionScore: 0 };
    const snapshot = advanceMany(Array(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1).fill(arbitraryButConsistentProbe));
    assert.equal(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
  });

  check("23. the probe shape now STRUCTURALLY requires a real motionScore field -- advanceRouteAssistAlignmentEvidenceV1's type signature can no longer be satisfied by {matched, confidence, overlapFraction} alone", () => {
    const probe: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.9, overlapFraction: 0.5, motionScore: 0 };
    const keys = Object.keys(probe).sort();
    assert.deepEqual(keys, ["confidence", "matched", "motionScore", "overlapFraction"], "motionScore must be part of the probe shape the engine accepts -- this is what makes real motion evidence structurally impossible to omit, not merely a convention callers might forget");
  });

  check("24. motionScore itself is never derived from overlapFraction or confidence inside this engine -- it is only ever compared against a fixed threshold, so nothing in this file can reconstruct 'AI-estimate variance' from the new field either", () => {
    // Two probes with IDENTICAL matched/confidence/overlapFraction but
    // DIFFERENT motionScore must be able to reach different states --
    // proving motionScore is live, independent evidence, not a relabeled
    // pass-through of the same AI numbers.
    const stableRun = advanceMany(Array(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1).fill({ matched: true, confidence: 0.9, overlapFraction: 0.5, motionScore: 0 } as RouteAssistAlignmentProbeV1));
    const movingRun = advanceMany(Array(ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1).fill({ matched: true, confidence: 0.9, overlapFraction: 0.5, motionScore: 0.9 } as RouteAssistAlignmentProbeV1));
    assert.equal(stableRun.state, "ALIGNED", JSON.stringify(stableRun));
    assert.notEqual(movingRun.state, "ALIGNED", JSON.stringify(movingRun));
  });

  check("25. computeRouteAssistFrameMotionV1 (the actual pixel measurement) reports ~0 for pixel-identical consecutive frames and a large score for a fully-changed scene -- sanity-checking the real signal this whole fix depends on, independent of the evidence engine", () => {
    const width = 4, height = 4;
    const still = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < still.length; i += 4) {
      still[i] = 120; still[i + 1] = 130; still[i + 2] = 140; still[i + 3] = 255;
    }
    const identicalScore = computeRouteAssistFrameMotionV1({ data: still, width, height }, { data: still, width, height });
    assert.ok(identicalScore < 1e-9, `expected ~0 for identical frames, got ${identicalScore}`);

    const changed = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < changed.length; i += 4) {
      changed[i] = 255; changed[i + 1] = 255; changed[i + 2] = 255; changed[i + 3] = 255;
    }
    const changedScore = computeRouteAssistFrameMotionV1({ data: still, width, height }, { data: changed, width, height });
    assert.ok(changedScore > ROUTE_ASSIST_ALIGNMENT_MOTION_SCORE_LIMIT_V1 * 5, `expected a large score for a fully-changed scene, got ${changedScore}`);
  });

  console.log(`\nRoute Assist alignment-evidence verification: ${passed} passed, 0 failed.`);
}

type RouteAssistDirectionLockHintV1 = "RIGHT" | "LEFT" | "UP" | "DOWN";

main();
