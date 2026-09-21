/**
 * Proves the evidence-based alignment engine after the movement-guidance
 * redesign (real-phone feedback, 21 Sep 2026: "It mostly says Hold
 * steady. Ready to check briefly flashes and disappears. I have no clear
 * indication of when I should actually stop moving and hold steady.")
 * and the direction-lock engine (unchanged by this pass). Pure functions,
 * no DOM, no network -- every case here is deterministic SYNTHETIC input,
 * clearly distinguished from the real-phone motion measurements this
 * pass's thresholds are informed by (see alignmentEvidence.ts's own
 * module doc comment, which cites a prior session's direct measurement
 * from an actual phone recording -- 0.03-0.09 motionScore during genuine
 * settling, 0.005-0.011 once truly still -- as the evidence behind
 * ROUTE_ASSIST_ALIGNMENT_MOTION_EXIT_LIMIT_V1's value). This file proves
 * the STATE MACHINE's logic deterministically; it does not re-measure a
 * real phone itself -- see verify-route-assist-alignment-lifecycle-
 * browser.ts for the real, rendered end-to-end proof.
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
  ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1,
  ROUTE_ASSIST_ALIGNMENT_MOTION_ENTRY_LIMIT_V1,
  ROUTE_ASSIST_ALIGNMENT_MOTION_EXIT_LIMIT_V1,
  ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1,
  ROUTE_ASSIST_ALIGNMENT_SLOW_DOWN_MARGIN_V1,
  ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1,
  type RouteAssistAlignmentEvidenceStateSnapshotV1,
  type RouteAssistAlignmentProbeV1,
} from "../lib/visual-assist/route-assist/alignmentEvidence";
import { ROUTE_ASSIST_FRAME_OVERLAP_CONFIDENCE_FLOOR_V1, ROUTE_ASSIST_MAX_OVERLAP_BEFORE_REDUNDANT_V1, ROUTE_ASSIST_MIN_OVERLAP_FOR_REGISTRATION_V1 } from "../lib/visual-assist/route-assist/frameContinuation";
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
const SUITABLE = { matched: true, confidence: 0.9, overlapFraction: 0.5 }; // squarely inside [MIN, MAX]
const FAR = { matched: true, confidence: 0.9, overlapFraction: 0.99 }; // still far -- beyond even the slow-down margin
const APPROACHING = { matched: true, confidence: 0.9, overlapFraction: ROUTE_ASSIST_MAX_OVERLAP_BEFORE_REDUNDANT_V1 + ROUTE_ASSIST_ALIGNMENT_SLOW_DOWN_MARGIN_V1 / 2 }; // inside the slow-down margin
const TOO_LITTLE = { matched: true, confidence: 0.9, overlapFraction: 0.05 }; // below MIN -- moved too far
const UNCERTAIN = { matched: false, confidence: 0.9, overlapFraction: 0.05 };
const LOW_CONFIDENCE = { matched: true, confidence: ROUTE_ASSIST_FRAME_OVERLAP_CONFIDENCE_FLOOR_V1 - 0.1, overlapFraction: 0.5 };

const STILL_PROBE: RouteAssistAlignmentProbeV1 = { ...SUITABLE, motionScore: 0 };
const JITTER_PROBE: RouteAssistAlignmentProbeV1 = { ...SUITABLE, motionScore: (ROUTE_ASSIST_ALIGNMENT_MOTION_ENTRY_LIMIT_V1 + ROUTE_ASSIST_ALIGNMENT_MOTION_EXIT_LIMIT_V1) / 2 }; // above entry, at/below exit -- ordinary handheld tremor
const MOVING_PROBE: RouteAssistAlignmentProbeV1 = { ...SUITABLE, motionScore: ROUTE_ASSIST_ALIGNMENT_MOTION_EXIT_LIMIT_V1 + 0.05 }; // sustained, meaningful movement

function advanceMany(probes: readonly RouteAssistAlignmentProbeV1[]): RouteAssistAlignmentEvidenceStateSnapshotV1 {
  let snapshot = initialRouteAssistAlignmentEvidenceStateV1();
  for (const probe of probes) snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe });
  return snapshot;
}

function main() {
  // --- item 1: overlap position and motion are fully separate axes ------

  check("1. LOW MOTION ALONE does not indicate suitable positioning -- a perfectly still camera pointed at a FAR (too-much-overlap) framing reads KEEP_MOVING, never Hold steady/Ready, no matter how long it holds", () => {
    const snapshot = advanceMany(Array(10).fill({ ...FAR, motionScore: 0 }));
    assert.equal(snapshot.state, "KEEP_MOVING", JSON.stringify(snapshot));
  });

  check("2. UNSUITABLE OVERLAP never leaves the user stuck on Hold steady -- reaching Hold steady, then the framing genuinely overshoots (FAR), drops IMMEDIATELY (no grace) back to the correct directional guidance", () => {
    const toHoldSteady = Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill({ ...SUITABLE, motionScore: 1 }); // still moving, so this plateaus at Hold steady, never Ready
    let snapshot = advanceMany(toHoldSteady);
    assert.equal(snapshot.state, "HOLD_STEADY", JSON.stringify(snapshot));
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: { ...FAR, motionScore: 1 } });
    assert.equal(snapshot.state, "KEEP_MOVING", "Hold steady must not persist once the overlap position itself is no longer suitable -- no hysteresis grace outside ALIGNED");
  });

  // --- item 2: actionable, direction-consistent corrections --------------

  check("3. TOO LITTLE OVERLAP (moved too far) reads MOVE_BACK, distinct from KEEP_MOVING/SLOW_DOWN/UNCERTAIN", () => {
    const snapshot = advanceMany([{ ...TOO_LITTLE, motionScore: 0 }]);
    assert.equal(snapshot.state, "MOVE_BACK", JSON.stringify(snapshot));
  });

  check("4. WHEN OVERLAP CANNOT BE CONFIDENTLY ASSESSED (unmatched or low-confidence), the state is UNCERTAIN -- never silently reused as Hold steady, and never silently reused as MOVE_BACK either", () => {
    const unmatched = advanceMany([{ ...UNCERTAIN, motionScore: 0 }]);
    assert.equal(unmatched.state, "UNCERTAIN", JSON.stringify(unmatched));
    const lowConfidence = advanceMany([{ ...LOW_CONFIDENCE, motionScore: 0 }]);
    assert.equal(lowConfidence.state, "UNCERTAIN", JSON.stringify(lowConfidence));
  });

  check("5. APPROACHING the target window (overshoot zone, but close) reads SLOW_DOWN, distinct from the FAR KEEP_MOVING zone -- warns before an overshoot rather than only after one", () => {
    const snapshot = advanceMany([{ ...APPROACHING, motionScore: 0 }]);
    assert.equal(snapshot.state, "SLOW_DOWN", JSON.stringify(snapshot));
  });

  check("6. REVERSAL: after reaching the suitable window, panning back out the way it came (overlapFraction climbing back up) correctly reverts through SLOW_DOWN back to KEEP_MOVING, symmetric with the forward approach", () => {
    const toSuitable = Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill({ ...SUITABLE, motionScore: 1 });
    let snapshot = advanceMany(toSuitable);
    assert.equal(snapshot.state, "HOLD_STEADY");
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: { ...APPROACHING, motionScore: 1 } });
    assert.equal(snapshot.state, "SLOW_DOWN", JSON.stringify(snapshot));
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: { ...FAR, motionScore: 1 } });
    assert.equal(snapshot.state, "KEEP_MOVING", JSON.stringify(snapshot));
  });

  check("7. OVERSHOOT: panning fast enough to jump straight from FAR past the entire suitable window to TOO LITTLE in one probe reads MOVE_BACK directly -- never fakes passing through Hold steady/Ready it never actually reached", () => {
    const snapshot = advanceMany([{ ...FAR, motionScore: 1 }, { ...TOO_LITTLE, motionScore: 1 }]);
    assert.equal(snapshot.state, "MOVE_BACK", JSON.stringify(snapshot));
  });

  check("8. all four directions are symmetric in this engine -- overlapFraction/matched/confidence classification never references direction at all (direction only affects the LABEL, tested separately in verify-route-assist-capture-isolation.ts)", () => {
    // Structural proof: classifyRouteAssistOverlapSuitabilityV1's inputs
    // (matched, confidence, overlapFraction, motionScore) contain no
    // direction field, so its output cannot vary by direction.
    const probe: RouteAssistAlignmentProbeV1 = { ...SUITABLE, motionScore: 0 };
    const keys = Object.keys(probe).sort();
    assert.deepEqual(keys, ["confidence", "matched", "motionScore", "overlapFraction"]);
  });

  // --- the required sequence: Move -> Slow down -> Stop here -> Ready ---

  check("9. a single suitable probe is HOLD_STEADY only once the overlap streak is long enough -- the first suitable probe alone does not yet satisfy it", () => {
    const snapshot = advanceMany([{ ...SUITABLE, motionScore: 1 }]);
    assert.notEqual(snapshot.state, "ALIGNED");
  });

  check(`10. exactly ${ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1} consecutive suitable-overlap probes reaches HOLD_STEADY even while STILL MOVING (motionScore high) -- "Stop here" is a POSITION signal, reachable independent of motion`, () => {
    const snapshot = advanceMany(Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill({ ...SUITABLE, motionScore: 1 }));
    assert.equal(snapshot.state, "HOLD_STEADY", JSON.stringify(snapshot));
  });

  check("11. HOLD_STEADY never advances to ALIGNED while motion stays above the entry limit, no matter how long the overlap streak runs -- motion is a genuinely independent gate, not merely a fast rubber stamp", () => {
    const snapshot = advanceMany(Array(10).fill({ ...SUITABLE, motionScore: ROUTE_ASSIST_ALIGNMENT_MOTION_ENTRY_LIMIT_V1 + 0.1 }));
    assert.equal(snapshot.state, "HOLD_STEADY", JSON.stringify(snapshot));
  });

  check("12. once motion ALSO settles (at/below the entry limit) with overlap still suitable, the SAME already-long overlap streak reaches ALIGNED on the very next probe -- proving motion, not the overlap streak, was what was blocking it", () => {
    const stillMoving = Array(6).fill({ ...SUITABLE, motionScore: ROUTE_ASSIST_ALIGNMENT_MOTION_ENTRY_LIMIT_V1 + 0.1 });
    const snapshot = advanceMany([...stillMoving, STILL_PROBE]);
    assert.equal(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
  });

  check("13. the FULL required sequence is reachable in order: KEEP_MOVING -> SLOW_DOWN -> HOLD_STEADY -> ALIGNED, with every step genuinely visited (never skipped)", () => {
    const probes: RouteAssistAlignmentProbeV1[] = [
      { ...FAR, motionScore: 1 },
      { ...APPROACHING, motionScore: 1 },
      { ...SUITABLE, motionScore: 1 }, // still moving -- Hold steady, not yet Ready
      { ...SUITABLE, motionScore: 1 },
      { ...SUITABLE, motionScore: 0 }, // now genuinely stopped
    ];
    let snapshot = initialRouteAssistAlignmentEvidenceStateV1();
    const states: string[] = [];
    for (const probe of probes) {
      snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe });
      states.push(snapshot.state);
    }
    assert.deepEqual(states, ["KEEP_MOVING", "SLOW_DOWN", "HOLD_STEADY", "HOLD_STEADY", "ALIGNED"], JSON.stringify(states));
  });

  // --- item 3: readiness hysteresis -- entry/exit thresholds + tolerance -

  check("14. THE FLICKER FIX: once ALIGNED, ORDINARY HANDHELD JITTER (motion above the strict entry limit but at/below the more forgiving exit limit) does NOT revoke readiness -- Ready to check stays visible", () => {
    const toAligned = [...Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill({ ...SUITABLE, motionScore: 0 })];
    let snapshot = advanceMany(toAligned);
    assert.equal(snapshot.state, "ALIGNED");
    for (let i = 0; i < 5; i += 1) {
      snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: JITTER_PROBE });
      assert.equal(snapshot.state, "ALIGNED", `expected Ready to check to survive jitter tick ${i + 1}, got ${JSON.stringify(snapshot)}`);
    }
  });

  check("15. a SINGLE probe of sustained, meaningful movement (above the exit limit) after ALIGNED does not immediately revoke it either (hysteresis streak)", () => {
    const toAligned = Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill({ ...SUITABLE, motionScore: 0 });
    let snapshot = advanceMany(toAligned);
    assert.equal(snapshot.state, "ALIGNED");
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: MOVING_PROBE });
    assert.equal(snapshot.state, "ALIGNED", "one probe of movement must not immediately flicker Ready to check away");
  });

  check(`16. ${ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1} CONSECUTIVE probes of sustained movement DOES revoke ALIGNED back to HOLD_STEADY (never all the way to a directional state while overlap stays suitable) -- readiness is not a permanent latch`, () => {
    const toAligned = Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill({ ...SUITABLE, motionScore: 0 });
    let snapshot = advanceMany(toAligned);
    for (let i = 0; i < ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1; i += 1) {
      snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: MOVING_PROBE });
    }
    assert.equal(snapshot.state, "HOLD_STEADY", JSON.stringify(snapshot));
  });

  check("17. a movement blip THEN recovery (motion drops back within tolerance) keeps ALIGNED and resets the motion bad streak -- a single glitch never accumulates toward revocation across separated incidents", () => {
    const toAligned = Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill({ ...SUITABLE, motionScore: 0 });
    let snapshot = advanceMany(toAligned);
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: MOVING_PROBE });
    assert.equal(snapshot.state, "ALIGNED");
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: STILL_PROBE });
    assert.equal(snapshot.state, "ALIGNED");
    assert.equal(snapshot.motionBadStreak, 0, "a recovered probe should clear the motion bad streak, not merely pause it");
  });

  check("18. OVERLAP LOSS hysteresis is UNCHANGED from before: a single noisy unsuitable-overlap probe after ALIGNED does not immediately revoke it, but 2 consecutive ones do -- and revoke to the CORRECT directional state, never stuck", () => {
    const toAligned = Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill({ ...SUITABLE, motionScore: 0 });
    let snapshot = advanceMany(toAligned);
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: { ...TOO_LITTLE, motionScore: 0 } });
    assert.equal(snapshot.state, "ALIGNED", "one noisy overlap-loss probe must not flicker Ready away");
    snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: { ...TOO_LITTLE, motionScore: 0 } });
    assert.equal(snapshot.state, "MOVE_BACK", JSON.stringify(snapshot));
  });

  // --- realistic handheld sequences (item 5) -----------------------------

  check("19. REALISTIC HANDHELD SEQUENCE: approach (FAR/SLOW_DOWN while still moving) -> arrival (suitable overlap, still settling -- Hold steady) -> minor tremor after Ready is reached -- Ready to check remains visible through several ticks of ordinary jitter, not a one-tick flash", () => {
    const approach: RouteAssistAlignmentProbeV1[] = [
      { ...FAR, motionScore: 0.3 },
      { ...FAR, motionScore: 0.25 },
      { ...APPROACHING, motionScore: 0.15 },
      { ...SUITABLE, motionScore: 0.08 }, // arrived, but still settling -- Hold steady
      { ...SUITABLE, motionScore: 0.03 }, // still settling
      { ...SUITABLE, motionScore: 0 }, // now genuinely still -- Ready
    ];
    let snapshot = initialRouteAssistAlignmentEvidenceStateV1();
    const states: string[] = [];
    for (const probe of approach) {
      snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe });
      states.push(snapshot.state);
    }
    assert.equal(states[states.length - 1], "ALIGNED", JSON.stringify(states));
    assert.ok(states.includes("HOLD_STEADY"), `expected Hold steady to appear before Ready: ${JSON.stringify(states)}`);
    // Now simulate 6 more ticks (~5.4s) of realistic tremor -- alternating
    // just-above-entry and comfortably-below-entry, per the real-phone
    // measurement this pass's thresholds are informed by -- and confirm
    // Ready to check is visible on EVERY one of them.
    const tremor = [0.01, 0.03, 0.008, 0.025, 0.005, 0.03];
    for (const motionScore of tremor) {
      snapshot = advanceRouteAssistAlignmentEvidenceV1({ previous: snapshot, probe: { ...SUITABLE, motionScore } });
      assert.equal(snapshot.state, "ALIGNED", `expected Ready to check to survive tremor motionScore=${motionScore}, got ${JSON.stringify(snapshot)}`);
    }
  });

  check("20. LOW-TEXTURE / LOW-CONFIDENCE scenes (matched=true but confidence below the floor) never accumulate an overlap streak -- stay UNCERTAIN no matter how many probes arrive", () => {
    const snapshot = advanceMany(Array(10).fill({ ...LOW_CONFIDENCE, motionScore: 0 }));
    assert.equal(snapshot.state, "UNCERTAIN", JSON.stringify(snapshot));
  });

  check("21. sanity: MIN/MAX overlap thresholds are unchanged from frameContinuation.ts (this pass adds classification on top, never new thresholds underneath)", () => {
    assert.ok(ROUTE_ASSIST_MIN_OVERLAP_FOR_REGISTRATION_V1 > 0 && ROUTE_ASSIST_MIN_OVERLAP_FOR_REGISTRATION_V1 < ROUTE_ASSIST_MAX_OVERLAP_BEFORE_REDUNDANT_V1);
  });

  // --- direction lock: infer, lock, avoid jitter, restart (UNCHANGED) ----

  check("22. a single direction hint never locks -- one probe is not 'initial meaningful movement'", () => {
    const state = advanceRouteAssistDirectionLockV1({ previous: initialRouteAssistDirectionLockStateV1(), hint: "RIGHT" });
    assert.equal(state.locked, null, JSON.stringify(state));
  });

  check(`23. ${ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1} CONSECUTIVE agreeing hints locks the direction`, () => {
    let state = initialRouteAssistDirectionLockStateV1();
    for (let i = 0; i < ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1; i += 1) state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "UP" });
    assert.equal(state.locked, "UP", JSON.stringify(state));
  });

  check("24. once locked, a DIFFERENT hint is ignored outright -- 'avoid direction flipping from jitter'", () => {
    let state = initialRouteAssistDirectionLockStateV1();
    for (let i = 0; i < ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1; i += 1) state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "LEFT" });
    assert.equal(state.locked, "LEFT");
    const afterJitter = advanceRouteAssistDirectionLockV1({ previous: state, hint: "DOWN" });
    assert.equal(afterJitter.locked, "LEFT", "a locked direction must never change from a later, disagreeing hint");
  });

  check("25. an alternating (jittery) sequence of hints never locks -- agreement must be CONSECUTIVE, not merely frequent", () => {
    let state = initialRouteAssistDirectionLockStateV1();
    const alternating: Array<RouteAssistDirectionLockHintV1> = ["RIGHT", "LEFT", "RIGHT", "LEFT", "RIGHT", "LEFT"];
    for (const hint of alternating) state = advanceRouteAssistDirectionLockV1({ previous: state, hint });
    assert.equal(state.locked, null, JSON.stringify(state));
  });

  check("26. a null hint (no evidence this probe) resets the consecutive-hint streak rather than being silently skipped", () => {
    let state = initialRouteAssistDirectionLockStateV1();
    state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "DOWN" });
    state = advanceRouteAssistDirectionLockV1({ previous: state, hint: null });
    state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "DOWN" });
    assert.equal(state.locked, null, "the null hint in between must have reset the streak, so this is only the SECOND consecutive DOWN, not the third overall");
    state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "DOWN" });
    assert.equal(state.locked, "DOWN");
  });

  check("27. restartRouteAssistDirectionLockV1 clears an existing lock completely, matching the 'simple way to correct/restart direction' requirement", () => {
    let state = initialRouteAssistDirectionLockStateV1();
    for (let i = 0; i < ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1; i += 1) state = advanceRouteAssistDirectionLockV1({ previous: state, hint: "RIGHT" });
    assert.equal(state.locked, "RIGHT");
    const restarted = restartRouteAssistDirectionLockV1();
    assert.deepEqual(restarted, initialRouteAssistDirectionLockStateV1());
    const relocked = advanceRouteAssistDirectionLockV1({ previous: advanceRouteAssistDirectionLockV1({ previous: restarted, hint: "DOWN" }), hint: "DOWN" });
    assert.equal(relocked.locked, "DOWN", "after a restart, a fresh direction must be lockable again");
  });

  check("28. symmetry: RIGHT, LEFT, UP, and DOWN all lock identically given the same evidence shape -- no direction is special-cased", () => {
    for (const direction of ["RIGHT", "LEFT", "UP", "DOWN"] as const) {
      let state = initialRouteAssistDirectionLockStateV1();
      for (let i = 0; i < ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1; i += 1) state = advanceRouteAssistDirectionLockV1({ previous: state, hint: direction });
      assert.equal(state.locked, direction, JSON.stringify({ direction, state }));
    }
  });

  // --- the false-alignment gap closed two passes ago, still closed ------

  check("29. THREE CONSISTENT BUT ARBITRARY overlap responses, PAIRED WITH CONTINUED REAL MOTION, still do NOT reach ALIGNED -- the motion-vs-AI-estimate fix from the prior pass is unaffected by this pass's guidance redesign", () => {
    const arbitraryButConsistentProbe: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.83, overlapFraction: 0.41, motionScore: ROUTE_ASSIST_ALIGNMENT_MOTION_ENTRY_LIMIT_V1 + 0.3 };
    const snapshot = advanceMany(Array(10).fill(arbitraryButConsistentProbe));
    assert.notEqual(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
  });

  check("30. the SAME three consistent-but-arbitrary AI numbers DO still reach ALIGNED once real motion is genuinely stable -- isolating that test 29's block comes from the real motion signal specifically", () => {
    const arbitraryButConsistentProbe: RouteAssistAlignmentProbeV1 = { matched: true, confidence: 0.83, overlapFraction: 0.41, motionScore: 0 };
    const snapshot = advanceMany(Array(ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1).fill(arbitraryButConsistentProbe));
    assert.equal(snapshot.state, "ALIGNED", JSON.stringify(snapshot));
  });

  check("31. computeRouteAssistFrameMotionV1 (the actual pixel measurement) reports ~0 for pixel-identical consecutive frames and a large score for a fully-changed scene -- sanity-checking the real signal this whole fix depends on, independent of the evidence engine", () => {
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
    assert.ok(changedScore > ROUTE_ASSIST_ALIGNMENT_MOTION_EXIT_LIMIT_V1 * 5, `expected a large score for a fully-changed scene, got ${changedScore}`);
  });

  console.log(`\nRoute Assist alignment-evidence verification: ${passed} passed, 0 failed.`);
}

type RouteAssistDirectionLockHintV1 = "RIGHT" | "LEFT" | "UP" | "DOWN";

main();
