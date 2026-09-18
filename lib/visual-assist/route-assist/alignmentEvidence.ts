import { evaluateRouteAssistContinuationWindowV1, type RouteAssistRelativeDirectionV1 } from "./frameContinuation";

/**
 * EVIDENCE-BASED ALIGNMENT (real-phone correction): a real capture showed
 * "Move right" jump to "Almost there" and then to "Aligned" in under one
 * probe interval, with no visible "Hold steady" step, and "Aligned"
 * staying green while the homeowner kept moving the phone. Both are real
 * bugs in the PRIOR hold logic this pass replaces (never in
 * frameContinuation.ts itself, which is left completely unchanged and
 * still supplies the base per-probe overlap window classification):
 *
 *   1. The prior hold rule declared "stable" (and therefore ALIGNED) the
 *      moment EITHER 2 consecutive in-range probes OR 900ms had elapsed
 *      arrived, whichever came first. With probes ~900ms apart, 2
 *      consecutive probes IS ~900ms -- so both branches of that "or"
 *      resolve at essentially the same moment, collapsing what was
 *      supposed to be three distinguishable steps (freshly in-range ->
 *      holding -> stable) into two. There was never a reachable moment
 *      where the count was "past its first probe but not yet stable" --
 *      MIN_CONSECUTIVE_PROBES=2 means the very next probe that continues
 *      to be in range immediately satisfies stability. And critically,
 *      "elapsed time" was ACCEPTED ON ITS OWN as sufficient evidence,
 *      which the product direction explicitly forbids.
 *   2. Once ALIGNED, nothing kept checking whether the framing was still
 *      good -- the label was driven by a single boolean latch
 *      (captureEnabled) that only a fresh out-of-range PROBE could clear,
 *      and a probe only arrives every ~900ms. Worse, the underlying AI
 *      overlap judgment answers "is there still SOME shared content with
 *      the reference", not "has this SPECIFIC good framing held steady"
 *      -- a phone that is still panning can keep reporting a confident
 *      match with a slowly drifting overlapFraction the whole time.
 *
 * THE FIX: require a genuine STREAK of independent good observations
 * (never elapsed time alone) before granting ALIGNED, and require the
 * recent overlapFraction readings to be internally CONSISTENT (low
 * spread) as a cheap, evidence-based proxy for "the phone has actually
 * stopped moving" -- a continuously drifting overlapFraction is exactly
 * what "framing keeps changing" looks like in the one signal already
 * available every probe, with no new AI call or sensor needed. ALIGNED
 * is continuously revalidated on every subsequent probe (not latched),
 * and revocation uses its OWN short hysteresis streak so one noisy probe
 * cannot flicker the state back and forth.
 */

export const ROUTE_ASSIST_ALIGNMENT_EVIDENCE_STATES_V1 = ["SEARCHING", "ALMOST_THERE", "HOLD_STEADY", "ALIGNED"] as const;
export type RouteAssistAlignmentEvidenceStateV1 = (typeof ROUTE_ASSIST_ALIGNMENT_EVIDENCE_STATES_V1)[number];

export type RouteAssistAlignmentProbeV1 = { matched: boolean; confidence: number; overlapFraction: number };

/** Consecutive in-range probes required before granting HOLD_STEADY -- the first probe to enter range is ALMOST_THERE, never immediately stable. */
export const ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1 = 2;
/** Consecutive in-range probes required before ALIGNED becomes possible at all -- strictly more than the HOLD_STEADY streak, so that step is always reachable and visible. */
export const ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1 = 3;
/** Max spread (max-min) allowed across the recent overlapFraction window for the framing to count as genuinely settled, not merely still-in-range. */
export const ROUTE_ASSIST_ALIGNMENT_MOTION_SPREAD_LIMIT_V1 = 0.08;
/** How many recent overlapFraction readings the spread is measured across. */
export const ROUTE_ASSIST_ALIGNMENT_MOTION_WINDOW_V1 = 4;
/** HYSTERESIS: consecutive out-of-range probes required to revoke ALIGNED -- a single noisy probe does not flicker the state back to SEARCHING. */
export const ROUTE_ASSIST_ALIGNMENT_REVOKE_STREAK_V1 = 2;

export type RouteAssistAlignmentEvidenceStateSnapshotV1 = {
  state: RouteAssistAlignmentEvidenceStateV1;
  /** Consecutive in-range probes seen so far (resets to 0 the instant a probe is out of range, before hysteresis grace is even considered). */
  goodStreak: number;
  /** Consecutive out-of-range probes seen while still within ALIGNED's hysteresis grace period. Irrelevant, and always 0, outside the ALIGNED state. */
  badStreak: number;
  /** A short rolling window of recent overlapFraction readings, most recent last -- the evidence behind the motion-stability check. */
  recentOverlapFractions: number[];
  reason: string;
};

export function initialRouteAssistAlignmentEvidenceStateV1(): RouteAssistAlignmentEvidenceStateSnapshotV1 {
  return { state: "SEARCHING", goodStreak: 0, badStreak: 0, recentOverlapFractions: [], reason: "Searching for overlap." };
}

function motionSpread(recent: readonly number[]): number {
  if (recent.length < 2) return Infinity; // not enough evidence yet to call the framing settled
  return Math.max(...recent) - Math.min(...recent);
}

/**
 * Advances the evidence state machine by exactly one probe. Pure and
 * deterministic -- the caller supplies the probe and gets back the next
 * snapshot; there is no hidden timer or wall-clock dependency anywhere in
 * this file, which is itself part of the fix ("elapsed time... alone
 * must not produce Aligned").
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
        // streak either, and its overlapFraction is deliberately NOT
        // folded into the motion window: it is being treated as a
        // discarded outlier, not real evidence, so a probe that recovers
        // right after is judged against the framing's actual recent
        // history, not against this one glitch. A second consecutive
        // miss still revokes below.
        return { state: "ALIGNED", goodStreak: previous.goodStreak, badStreak, recentOverlapFractions: previous.recentOverlapFractions, reason: "Aligned." };
      }
    }
    return { state: "SEARCHING", goodStreak: 0, badStreak: 0, recentOverlapFractions: [], reason: window.reason };
  }

  const recentOverlapFractions = [...previous.recentOverlapFractions, probe.overlapFraction].slice(-ROUTE_ASSIST_ALIGNMENT_MOTION_WINDOW_V1);
  const goodStreak = previous.goodStreak + 1;
  const stableMotion = motionSpread(recentOverlapFractions) <= ROUTE_ASSIST_ALIGNMENT_MOTION_SPREAD_LIMIT_V1;

  if (goodStreak >= ROUTE_ASSIST_ALIGNMENT_ALIGNED_STREAK_V1 && stableMotion) {
    return { state: "ALIGNED", goodStreak, badStreak: 0, recentOverlapFractions, reason: "Aligned." };
  }
  if (goodStreak >= ROUTE_ASSIST_ALIGNMENT_HOLD_STREAK_V1) {
    // Reachable EITHER because the streak is not yet long enough for
    // ALIGNED, or because it is long enough but the framing is still
    // visibly drifting (stableMotion is false) -- both are legitimate
    // reasons to stay at "hold steady" rather than jumping to "aligned".
    return { state: "HOLD_STEADY", goodStreak, badStreak: 0, recentOverlapFractions, reason: "Hold steady." };
  }
  return { state: "ALMOST_THERE", goodStreak, badStreak: 0, recentOverlapFractions, reason: "Almost there." };
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
