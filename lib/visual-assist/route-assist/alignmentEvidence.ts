import { evaluateRouteAssistContinuationWindowV1, type RouteAssistRelativeDirectionV1 } from "./frameContinuation";

/**
 * EVIDENCE-BASED ALIGNMENT (real-phone correction, later CORRECTED AGAIN
 * -- see below): a real capture showed "Move right" jump to "Almost
 * there" and then to "Aligned" in under one probe interval, with no
 * visible "Hold steady" step, and "Aligned" staying green while the
 * homeowner kept moving the phone. The FIRST fix (require a streak of
 * independently good observations, never elapsed time alone, before
 * granting ALIGNED) is still correct and unchanged below. Its SECOND fix
 * -- using the spread (max-min) of the AI's own recent overlapFraction
 * self-reports as a "motion stability" proxy -- was itself a CONFIRMED
 * false-alignment gap, not a benign known limitation:
 *
 *   overlapFraction variance measures whether the AI's ESTIMATE is
 *   internally consistent across probes, not whether the CAMERA is
 *   physically stationary. Three probes that report the same (or merely
 *   similar) overlapFraction -- whether because the phone is genuinely
 *   still, or merely because the model gave three arbitrary-but-similar
 *   answers unrelated to any real content -- were indistinguishable to
 *   that check. Proven directly: verify-route-assist-alignment-
 *   evidence.ts's check 21 fed three identical, made-up-consistent
 *   probes and reached ALIGNED with zero image evidence involved.
 *
 * THE ACTUAL FIX: stability now comes from frameMotion.ts's
 * computeRouteAssistFrameMotionV1 -- a real, independent, non-AI pixel
 * measurement of how much the LIVE camera view actually changed between
 * two consecutive probe frames. This module has no access to pixels
 * itself and never will -- it stays pure and DOM-free; the caller (the
 * client component) computes motionScore locally from the same
 * downscaled frames it already grabs for the probe loop and passes it in
 * as part of the probe. A camera that is truly held still scores near 0
 * regardless of what the AI says about overlap; a camera that is still
 * panning, rolling, or drifting scores materially higher, and that alone
 * is now enough to withhold (or revoke) readiness even when the AI probe
 * keeps reporting a confident match -- "invalidate readiness when
 * meaningful movement resumes" no longer depends on the AI noticing
 * anything.
 *
 * The AI overlap probe (frameOverlapAiGateway.ts, via
 * frameContinuation.ts's evaluateRouteAssistContinuationWindowV1, both
 * unchanged) still supplies "is there overlap, and is it in the useful
 * range" plus the direction hint below -- guidance and framing, never an
 * independent authorization of ALIGNED on its own. ALIGNED itself remains
 * a LIVE, fast, continuously-revalidated indicator ("the fast evidence
 * says try capturing now"); it is not a final, geometrically-checked
 * authorization by itself -- that authorization happens once, at the
 * moment of the manual shutter tap, against the exact frozen candidate
 * frame (see RouteAssistGuidedContinuationPreviewClient.tsx's capture-
 * validation gate, which calls the real image-registration pipeline,
 * imageRegistration.ts's registerFrameV1, before a frame is ever saved).
 */

export const ROUTE_ASSIST_ALIGNMENT_EVIDENCE_STATES_V1 = ["SEARCHING", "ALMOST_THERE", "HOLD_STEADY", "ALIGNED"] as const;
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

/** Consecutive in-range-and-motion-stable probes required before granting HOLD_STEADY -- the first qualifying probe is ALMOST_THERE, never immediately stable. */
export const ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1 = 2;
/** Consecutive in-range-and-motion-stable probes required before ALIGNED becomes possible at all -- strictly more than the HOLD_STEADY streak, so that step is always reachable and visible. */
export const ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1 = 3;
/** Maximum real motionScore (frameMotion.ts) for a probe to count as "camera physically stationary" -- calibrated conservatively pending real-device tuning; may need adjustment once exercised on an actual phone. */
export const ROUTE_ASSIST_ALIGNMENT_MOTION_SCORE_LIMIT_V1 = 0.02;
/** HYSTERESIS: consecutive probes that fail overlap-range OR real-motion-stability required to revoke ALIGNED -- a single noisy probe does not flicker the state back to SEARCHING. */
export const ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1 = 2;

export type RouteAssistAlignmentEvidenceStateSnapshotV1 = {
  state: RouteAssistAlignmentEvidenceStateV1;
  /** Consecutive in-range-and-motion-stable probes seen so far (resets to 0 the instant a probe fails either check, before hysteresis grace is even considered). */
  goodStreak: number;
  /** Consecutive failing probes seen while still within ALIGNED's hysteresis grace period. Irrelevant, and always 0, outside the ALIGNED state. */
  badStreak: number;
  reason: string;
};

export function initialRouteAssistAlignmentEvidenceStateV1(): RouteAssistAlignmentEvidenceStateSnapshotV1 {
  return { state: "SEARCHING", goodStreak: 0, badStreak: 0, reason: "Searching for overlap." };
}

/**
 * Advances the evidence state machine by exactly one probe. Pure and
 * deterministic -- the caller supplies the probe (including its already-
 * measured motionScore) and gets back the next snapshot; there is no
 * hidden timer, wall-clock dependency, or pixel access anywhere in this
 * file, which is itself part of the fix ("elapsed time... alone must not
 * produce Aligned", and "do not describe overlapFraction variance as
 * motion measurement").
 */
export function advanceRouteAssistAlignmentEvidenceV1(args: {
  previous: RouteAssistAlignmentEvidenceStateSnapshotV1;
  probe: RouteAssistAlignmentProbeV1;
}): RouteAssistAlignmentEvidenceStateSnapshotV1 {
  const { previous, probe } = args;
  const window = evaluateRouteAssistContinuationWindowV1(probe);

  if (window.state !== "IN_RANGE") {
    if (previous.state === "ALIGNED") {
      const badStreak = previous.badStreak + 1;
      if (badStreak < ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1) {
        // HYSTERESIS: one noisy out-of-range probe does not revoke an
        // established ALIGNED reading -- but it does NOT extend the good
        // streak either. A second consecutive miss still revokes below.
        return { state: "ALIGNED", goodStreak: previous.goodStreak, badStreak, reason: "Aligned." };
      }
    }
    return { state: "SEARCHING", goodStreak: 0, badStreak: 0, reason: window.reason };
  }

  const goodStreak = previous.goodStreak + 1;
  // motionStable gates ONLY the ALIGNED transition, never the base
  // goodStreak count itself -- overlap that is genuinely in range but
  // still settling into place (the camera still finishing its pan) is a
  // legitimate reason to plateau at HOLD_STEADY, not to reset progress to
  // zero. But real, MEASURED motion (never an AI self-report) is what
  // decides whether that plateau can advance to ALIGNED, and -- because
  // this check runs on every probe, including probes where overlap
  // stayed in range while previously ALIGNED -- resumed motion drops an
  // established ALIGNED straight back to HOLD_STEADY immediately, with
  // no hysteresis grace: real motion evidence needs no debouncing the way
  // one noisy AI response does.
  const motionStable = probe.motionScore <= ROUTE_ASSIST_ALIGNMENT_MOTION_SCORE_LIMIT_V1;

  if (goodStreak >= ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1 && motionStable) {
    return { state: "ALIGNED", goodStreak, badStreak: 0, reason: "Aligned." };
  }
  if (goodStreak >= ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1) {
    return { state: "HOLD_STEADY", goodStreak, badStreak: 0, reason: "Hold steady." };
  }
  return { state: "ALMOST_THERE", goodStreak, badStreak: 0, reason: "Almost there." };
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
