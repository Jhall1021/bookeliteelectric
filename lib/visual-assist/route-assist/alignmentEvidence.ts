import {
  evaluateRouteAssistContinuationWindowV1,
  ROUTE_ASSIST_FRAME_OVERLAP_CONFIDENCE_FLOOR_V1,
  ROUTE_ASSIST_MAX_OVERLAP_BEFORE_REDUNDANT_V1,
  type RouteAssistRelativeDirectionV1,
} from "./frameContinuation";

/**
 * EVIDENCE-BASED ALIGNMENT (real-phone correction, corrected multiple
 * times -- see below for the fullest, current fix). Prior corrections,
 * still true and unchanged in spirit:
 *
 *   1. A genuine STREAK of independent good observations is required
 *      before granting readiness -- elapsed time alone is never
 *      sufficient.
 *   2. Stability comes from frameMotion.ts's computeRouteAssistFrameMotionV1
 *      -- a real, independent, non-AI pixel measurement of how much the
 *      LIVE camera view actually changed between two consecutive probe
 *      frames -- never from the AI's own overlapFraction self-report
 *      (proven exploitable: three probes with identical, hand-constructed
 *      numbers used to reach ALIGNED with zero real motion evidence).
 *
 * THIS CORRECTION (real-phone feedback, 21 Sep 2026): "It mostly says
 * Hold steady. Ready to check briefly flashes and disappears. I have no
 * clear indication of when I should actually stop moving and hold
 * steady." Root cause, diagnosed before writing any fix:
 *
 *   1. HOLD_STEADY was reached the moment overlap position was
 *      acceptable for ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1 consecutive
 *      probes -- with NO motion check at all. The "in range" overlap
 *      window ([0.12, 0.88] overlapFraction) is WIDE, so a homeowner
 *      actively panning at a moderate, controlled speed could stay
 *      inside it for many consecutive probes while still genuinely
 *      moving -- "Hold steady" then dominates the whole approach, not
 *      because the phone needs to stop NOW, but because the label never
 *      distinguished "you're in the neighborhood" from "you've arrived,
 *      stop." It was a POSITION signal wearing a STOPPING instruction's
 *      name.
 *   2. ALIGNED (the actual stop-confirmation) used a SINGLE motion
 *      threshold with NO hysteresis: one probe at or below the limit
 *      granted it, and the very next probe even slightly above the SAME
 *      limit revoked it immediately, no grace period. Real handheld
 *      footage (measured directly from an actual phone recording, not
 *      synthetic animation -- see verify-route-assist-alignment-evidence
 *      -real-motion.ts) shows genuine micro-jitter routinely producing
 *      motionScore readings a little above a strict "stopped" threshold
 *      even while a person is sincerely holding still. A single shared
 *      threshold with no dead band makes that jitter cross back and
 *      forth across the SAME line constantly -- exactly "briefly flashes
 *      and disappears."
 *
 * THE FIX has two independent parts, matching the product direction's
 * own instruction to separate these concerns rather than making the
 * shutter easier to hit:
 *
 *   A. OVERLAP POSITION AND MOTION STABILITY ARE FULLY SEPARATE AXES.
 *      classifyRouteAssistOverlapSuitabilityV1 below decides ONLY
 *      whether the current framing is a suitable position to stop at --
 *      UNCERTAIN (no confident match), MOVE_BACK (too little overlap --
 *      moved too far), KEEP_MOVING (too much overlap and still far from
 *      the target window -- direction-specific "Move ___"), SLOW_DOWN
 *      (too much overlap but APPROACHING the target window -- ease off
 *      before overshooting), or suitable (matches the old IN_RANGE).
 *      Motion is NEVER consulted for this decision -- "low motion alone
 *      must not indicate suitable positioning." HOLD_STEADY ("Stop
 *      here -- hold steady") is reached ONLY once position is suitable;
 *      it is the explicit instruction to stop, not a lingering
 *      "roughly okay" status. ALIGNED ("Ready to check") is reached only
 *      once position stays suitable AND real motion has also settled --
 *      confirmation that the homeowner complied with the stop request.
 *      The instant overlap position stops being suitable, the state
 *      drops all the way back to the correct directional guidance
 *      (never stuck showing "Stop here" while the position itself has
 *      become wrong).
 *
 *   B. SEPARATE ENTRY/EXIT MOTION THRESHOLDS, WITH HYSTERESIS ON BOTH
 *      SIDES. Entering ALIGNED still requires motionScore at or below
 *      ROUTE_ASSIST_ALIGNMENT_MOTION_ENTRY_LIMIT_V1 (unchanged bar).
 *      Leaving it now requires motionScore to exceed the HIGHER
 *      ROUTE_ASSIST_ALIGNMENT_MOTION_EXIT_LIMIT_V1 for
 *      ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1 CONSECUTIVE probes -- a
 *      real dead band plus a brief streak, so ordinary handheld jitter
 *      that pokes slightly above the entry line does not immediately
 *      erase readiness. Sustained, meaningful movement still revokes it
 *      promptly (2 probes, ~1.8s) -- this is tolerance for jitter, not a
 *      latch: "Ready to check" is never permanent.
 *
 * The AI overlap probe (frameOverlapAiGateway.ts, via
 * frameContinuation.ts's evaluateRouteAssistContinuationWindowV1, both
 * UNCHANGED) still supplies the base overlap classification; this file
 * only adds a confidence pre-check (UNCERTAIN) and subdivides KEEP_MOVING
 * into KEEP_MOVING/SLOW_DOWN. ALIGNED remains a LIVE, fast, continuously-
 * revalidated indicator ("the fast evidence says try capturing now"), not
 * a final, geometrically-checked authorization -- that authorization is
 * UNCHANGED by this pass: it happens once, at the moment of the manual
 * shutter tap, against the exact frozen candidate frame, via
 * imageRegistration.ts's registerFrameV1 (see
 * RouteAssistGuidedContinuationPreviewClient.tsx's capture-validation
 * gate). This pass does not touch that gate or lower any geometric
 * acceptance threshold.
 */

export const ROUTE_ASSIST_ALIGNMENT_EVIDENCE_STATES_V1 = ["UNCERTAIN", "MOVE_BACK", "KEEP_MOVING", "SLOW_DOWN", "HOLD_STEADY", "ALIGNED"] as const;
export type RouteAssistAlignmentEvidenceStateV1 = (typeof ROUTE_ASSIST_ALIGNMENT_EVIDENCE_STATES_V1)[number];

/**
 * motionScore: frameMotion.ts's computeRouteAssistFrameMotionV1 output
 * for this probe tick (0 = no measurable change since the previous live
 * frame; higher = more measured change) -- REAL pixel evidence, not an
 * AI self-report. A caller with no prior frame to compare against (the
 * very first probe of an attempt) must pass 1 (maximal), never 0 --
 * "cannot yet confirm stationary" must never be treated as "confirmed
 * stationary".
 */
export type RouteAssistAlignmentProbeV1 = { matched: boolean; confidence: number; overlapFraction: number; motionScore: number };

/** Consecutive suitable-overlap-position probes required before ALIGNED becomes reachable at all -- strictly ensures HOLD_STEADY is shown at least once before ALIGNED, exactly as previously audited ("Hold steady is observed strictly before Aligned"). */
export const ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1 = 2;
/** overlapFraction above ROUTE_ASSIST_MAX_OVERLAP_BEFORE_REDUNDANT_V1 but within this margin of it counts as "approaching the target window -- slow down" (SLOW_DOWN) rather than "still far" (KEEP_MOVING). */
export const ROUTE_ASSIST_ALIGNMENT_SLOW_DOWN_MARGIN_V1 = 0.1;
/** Maximum real motionScore (frameMotion.ts) for a probe to count as "settled enough to ENTER Ready to check." */
export const ROUTE_ASSIST_ALIGNMENT_MOTION_ENTRY_LIMIT_V1 = 0.02;
/** Real motionScore must EXCEED this (higher than the entry limit -- a genuine dead band, not the same line) to count toward revoking an established Ready to check. Ordinary handheld jitter above the entry limit but at/below this line does not erase readiness. */
export const ROUTE_ASSIST_ALIGNMENT_MOTION_EXIT_LIMIT_V1 = 0.045;
/** HYSTERESIS: consecutive probes that fail overlap suitability, OR exceed the motion exit limit, required to revoke an established ALIGNED -- a single noisy probe does not flicker the state back down. */
export const ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1 = 2;

export type RouteAssistAlignmentEvidenceStateSnapshotV1 = {
  state: RouteAssistAlignmentEvidenceStateV1;
  /** Consecutive suitable-overlap-position probes seen so far (resets to 0 the instant a probe's position is unsuitable, before any hysteresis grace is considered). */
  overlapStreak: number;
  /** Consecutive UNSUITABLE-POSITION probes seen while still within ALIGNED's hysteresis grace period. Irrelevant, and always 0, outside the ALIGNED state. */
  overlapBadStreak: number;
  /** Consecutive probes, while ALIGNED, whose motionScore exceeded the EXIT limit. Irrelevant, and always 0, outside the ALIGNED state. */
  motionBadStreak: number;
  reason: string;
};

export function initialRouteAssistAlignmentEvidenceStateV1(): RouteAssistAlignmentEvidenceStateSnapshotV1 {
  return { state: "UNCERTAIN", overlapStreak: 0, overlapBadStreak: 0, motionBadStreak: 0, reason: "Can't confirm overlap yet." };
}

type RouteAssistOverlapSuitabilityV1 = { suitable: true } | { suitable: false; state: "UNCERTAIN" | "MOVE_BACK" | "KEEP_MOVING" | "SLOW_DOWN"; reason: string };

/**
 * Decides ONLY whether the current framing is a suitable position to ask
 * the homeowner to stop at -- motion is never consulted here ("low
 * motion alone must not indicate suitable positioning"). Reuses
 * frameContinuation.ts's own MOVE_BACK/KEEP_MOVING/IN_RANGE thresholds
 * unchanged; adds a confidence pre-check (UNCERTAIN, distinguishing "we
 * genuinely cannot assess this" from "we assessed it and it's wrong")
 * and subdivides KEEP_MOVING into itself (still far) and SLOW_DOWN
 * (approaching the target window) so the live guidance can warn before
 * an overshoot rather than only after one.
 */
function classifyRouteAssistOverlapSuitabilityV1(probe: RouteAssistAlignmentProbeV1): RouteAssistOverlapSuitabilityV1 {
  if (!probe.matched || probe.confidence < ROUTE_ASSIST_FRAME_OVERLAP_CONFIDENCE_FLOOR_V1) {
    return { suitable: false, state: "UNCERTAIN", reason: "Can't confirm overlap yet — keep part of the previous view visible." };
  }
  const window = evaluateRouteAssistContinuationWindowV1(probe);
  if (window.state === "MOVE_BACK") {
    return { suitable: false, state: "MOVE_BACK", reason: "Move back slightly." };
  }
  if (window.state === "KEEP_MOVING") {
    const approaching = probe.overlapFraction <= ROUTE_ASSIST_MAX_OVERLAP_BEFORE_REDUNDANT_V1 + ROUTE_ASSIST_ALIGNMENT_SLOW_DOWN_MARGIN_V1;
    return approaching ? { suitable: false, state: "SLOW_DOWN", reason: "Slow down." } : { suitable: false, state: "KEEP_MOVING", reason: "Keep moving." };
  }
  return { suitable: true };
}

/**
 * Advances the evidence state machine by exactly one probe. Pure and
 * deterministic -- the caller supplies the probe (including its already-
 * measured motionScore) and gets back the next snapshot; there is no
 * hidden timer, wall-clock dependency, or pixel access anywhere in this
 * file.
 */
export function advanceRouteAssistAlignmentEvidenceV1(args: {
  previous: RouteAssistAlignmentEvidenceStateSnapshotV1;
  probe: RouteAssistAlignmentProbeV1;
}): RouteAssistAlignmentEvidenceStateSnapshotV1 {
  const { previous, probe } = args;
  const overlap = classifyRouteAssistOverlapSuitabilityV1(probe);

  if (!overlap.suitable) {
    if (previous.state === "ALIGNED") {
      const overlapBadStreak = previous.overlapBadStreak + 1;
      if (overlapBadStreak < ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1) {
        // HYSTERESIS: one noisy unsuitable-position probe does not revoke
        // an established ALIGNED reading -- but it does NOT extend the
        // overlap streak either. A second consecutive miss still revokes
        // below, dropping all the way to the correct directional
        // guidance -- never stuck showing "Stop here" once the position
        // itself has genuinely become unsuitable.
        return { state: "ALIGNED", overlapStreak: previous.overlapStreak, overlapBadStreak, motionBadStreak: 0, reason: "Ready to check." };
      }
    }
    return { state: overlap.state, overlapStreak: 0, overlapBadStreak: 0, motionBadStreak: 0, reason: overlap.reason };
  }

  const overlapStreak = previous.overlapStreak + 1;
  const motionStable = probe.motionScore <= ROUTE_ASSIST_ALIGNMENT_MOTION_ENTRY_LIMIT_V1;
  const motionExceededExit = probe.motionScore > ROUTE_ASSIST_ALIGNMENT_MOTION_EXIT_LIMIT_V1;

  if (previous.state === "ALIGNED") {
    if (motionExceededExit) {
      const motionBadStreak = previous.motionBadStreak + 1;
      if (motionBadStreak < ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1) {
        // HYSTERESIS: motion briefly above the (higher) exit limit does
        // not immediately erase readiness -- ordinary handheld jitter.
        return { state: "ALIGNED", overlapStreak, overlapBadStreak: 0, motionBadStreak, reason: "Ready to check." };
      }
      return { state: "HOLD_STEADY", overlapStreak, overlapBadStreak: 0, motionBadStreak: 0, reason: "Stop here — hold steady." };
    }
    // Motion is within tolerance (at or below the exit limit, even if
    // above the stricter entry limit) -- stays Ready, resets the bad streak.
    return { state: "ALIGNED", overlapStreak, overlapBadStreak: 0, motionBadStreak: 0, reason: "Ready to check." };
  }

  if (overlapStreak >= ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1 && motionStable) {
    return { state: "ALIGNED", overlapStreak, overlapBadStreak: 0, motionBadStreak: 0, reason: "Ready to check." };
  }
  return { state: "HOLD_STEADY", overlapStreak, overlapBadStreak: 0, motionBadStreak: 0, reason: "Stop here — hold steady." };
}

// --- direction inference + lock ---------------------------------------------

/**
 * DIRECTION INFERENCE (real-phone correction: direction was hardcoded to
 * RIGHT for the whole prior pass; supporting all four continuation
 * directions symmetrically means direction now has to come from
 * observation). The evidence is the SAME per-probe overlap call's own
 * `relativeDirection` hint (frameOverlapAiGateway.ts already derives this
 * from where the matched evidence sits in each frame -- unchanged,
 * nothing new to call). A single hint is not "initial meaningful
 * movement" -- it locks only once the SAME direction has been reported by
 * ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1 CONSECUTIVE matched
 * probes, which is what turns "the model's momentary guess" into
 * "the homeowner is consistently panning this way." Once locked, every
 * later hint is ignored outright -- "avoid direction flipping from
 * jitter" -- and the only way to change it is an explicit restart.
 */
export const ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1 = 2;

export type RouteAssistDirectionLockStateV1 = {
  locked: RouteAssistRelativeDirectionV1 | null;
  lastHint: RouteAssistRelativeDirectionV1 | null;
  consecutiveHintCount: number;
};

export function initialRouteAssistDirectionLockStateV1(): RouteAssistDirectionLockStateV1 {
  return { locked: null, lastHint: null, consecutiveHintCount: 0 };
}

/** Identical to the initial state -- named separately so a caller's "restart direction" action reads as its own deliberate operation, not a reuse of an unrelated-looking helper. */
export function restartRouteAssistDirectionLockV1(): RouteAssistDirectionLockStateV1 {
  return initialRouteAssistDirectionLockStateV1();
}

/**
 * Advances the direction lock by one probe's hint. `hint` is null for any
 * probe that carries no usable direction evidence (unmatched, or a
 * non-directional overlap) -- a null hint resets the consecutive-hint
 * streak (never averaged in, never treated as "agreeing" with anything)
 * so a single ambiguous probe cannot quietly extend a run of real
 * agreement it was not actually part of.
 */
export function advanceRouteAssistDirectionLockV1(args: { previous: RouteAssistDirectionLockStateV1; hint: RouteAssistRelativeDirectionV1 | null }): RouteAssistDirectionLockStateV1 {
  const { previous, hint } = args;
  if (previous.locked) return previous; // LOCKED FOR THE ATTEMPT -- no further hint, agreeing or not, changes it.
  if (!hint) return { locked: null, lastHint: null, consecutiveHintCount: 0 };
  const consecutiveHintCount = hint === previous.lastHint ? previous.consecutiveHintCount + 1 : 1;
  const locked = consecutiveHintCount >= ROUTE_ASSIST_DIRECTION_LOCK_MIN_CONSECUTIVE_HINTS_V1 ? hint : null;
  return { locked, lastHint: hint, consecutiveHintCount };
}
