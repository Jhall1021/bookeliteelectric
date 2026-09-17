import { evaluateRouteAssistContinuationWindowV1, type RouteAssistRelativeDirectionV1 } from "./frameContinuation";

/**
 * GOVERNING CAPTURE UX CORRECTION: the prior pass's guidance was visual-
 * overlap-only (MOVE_BACK/KEEP_MOVING/ALMOST_THERE/READY_TO_CAPTURE). The
 * product direction now names a richer, combined state machine --
 * SEARCHING -> CLOSE -> HOLD_STEADY -> ALIGNED -- fed by THREE classes of
 * evidence: visual overlap/feature matching (frameContinuation.ts's
 * UNCHANGED window classifier), device orientation/motion where available
 * (this module, purely assistive), and stability over time (the lock
 * counter below). frameContinuation.ts's own hold/window functions are
 * left completely untouched -- this module is a NEW, separate layer built
 * on top of them, not a replacement, so nothing that already depended on
 * the old functions needs to change.
 *
 * THE GOVERNING RULE: "human gets the views close, software finishes
 * exact alignment afterward." Nothing in this module ever decides final
 * geometry -- see imageRegistration.ts/stitchedWorkspace.ts, unchanged,
 * for that. Sensor signals here only ever ASSIST guidance text and gate
 * how quickly a lock is granted; they never override a confident visual
 * reading, and their total absence (denied permission, unsupported
 * platform) must never block capture -- every sensor-derived value is
 * nullable, and every function here treats null as "no opinion," not
 * "fail."
 */

// --- sensor signal derivation (assistive only) ------------------------------

/** One DeviceOrientationEvent-shaped sample. Kept as plain numbers (not the browser event type) so this module has no DOM dependency and is fully unit-testable. */
export type RouteAssistOrientationSampleV1 = { alpha: number; beta: number; gamma: number; atMs: number };

export type RouteAssistSensorSignalV1 = {
  /** null = no opinion (no expected direction yet, or no sensor data) -- NEVER treated as disagreement. */
  directionAgrees: boolean | null;
  /** null = no opinion. false gates progress to HOLD_STEADY/ALIGNED (a genuinely crooked phone is a real quality concern, independent of overlap) but never gates SEARCHING/CLOSE. */
  tiltOk: boolean | null;
  /** null = no opinion (not enough samples yet). false gates progress the same way tiltOk does. */
  stable: boolean | null;
};

const DEFAULT_MAX_TILT_DELTA_DEG = 25;
const DEFAULT_MAX_JITTER_DEG = 4;
const DEFAULT_MIN_HEADING_DELTA_FOR_DIRECTION_DEG = 8;

function angleDeltaDeg(a: number, b: number): number {
  let delta = a - b;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

/**
 * A best-effort heuristic, not a device-perfect one: real DeviceOrientation
 * axis conventions vary by device/OS/screen-orientation, and this module
 * deliberately does not chase that -- it is ASSISTIVE, so an occasionally
 * wrong hint only costs a slightly less helpful guidance message, never a
 * blocked capture or a wrong final geometry (see the module doc comment).
 * alpha (compass heading) is treated as the primary LEFT/RIGHT pan signal;
 * beta (front-back tilt) as the primary UP/DOWN signal, used only when the
 * heading signal is not clearly larger.
 */
export function deriveRouteAssistSensorDirectionHintV1(args: {
  referenceSample: RouteAssistOrientationSampleV1;
  currentSample: RouteAssistOrientationSampleV1;
  minHeadingDeltaDeg?: number;
}): RouteAssistRelativeDirectionV1 | null {
  const minDelta = args.minHeadingDeltaDeg ?? DEFAULT_MIN_HEADING_DELTA_FOR_DIRECTION_DEG;
  const headingDelta = angleDeltaDeg(args.currentSample.alpha, args.referenceSample.alpha);
  const pitchDelta = angleDeltaDeg(args.currentSample.beta, args.referenceSample.beta);
  if (Math.abs(headingDelta) >= Math.abs(pitchDelta) && Math.abs(headingDelta) >= minDelta) {
    return headingDelta > 0 ? "RIGHT" : "LEFT";
  }
  if (Math.abs(pitchDelta) >= minDelta) {
    return pitchDelta > 0 ? "DOWN" : "UP";
  }
  return null;
}

/**
 * Derives the assistive sensor signal from a reference sample (taken when
 * guided continuation started), the current sample, a short recent window
 * (for stability), and the currently-expected direction (if any is already
 * known -- see resolveRouteAssistContinuationDirectionV1). Returns null
 * outright when insufficient sensor data exists at all -- the caller must
 * then proceed on visual evidence alone, never blocking.
 */
export function deriveRouteAssistSensorSignalV1(args: {
  referenceSample: RouteAssistOrientationSampleV1 | null;
  currentSample: RouteAssistOrientationSampleV1 | null;
  recentSamples: readonly RouteAssistOrientationSampleV1[];
  expectedDirection: RouteAssistRelativeDirectionV1 | null;
  maxTiltDeltaDeg?: number;
  maxJitterDeg?: number;
}): RouteAssistSensorSignalV1 | null {
  if (!args.referenceSample || !args.currentSample) return null;
  const maxTilt = args.maxTiltDeltaDeg ?? DEFAULT_MAX_TILT_DELTA_DEG;
  const maxJitter = args.maxJitterDeg ?? DEFAULT_MAX_JITTER_DEG;

  // Gamma (roll) is the axis most specific to "holding the phone crooked"
  // independent of any panning intent -- used as the tilt-quality gate.
  const rollDelta = Math.abs(angleDeltaDeg(args.currentSample.gamma, args.referenceSample.gamma));
  const tiltOk = rollDelta <= maxTilt;

  let stable: boolean | null = null;
  if (args.recentSamples.length >= 2) {
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    stable =
      spread(args.recentSamples.map((s) => s.alpha)) <= maxJitter &&
      spread(args.recentSamples.map((s) => s.beta)) <= maxJitter &&
      spread(args.recentSamples.map((s) => s.gamma)) <= maxJitter;
  }

  let directionAgrees: boolean | null = null;
  if (args.expectedDirection) {
    const hint = deriveRouteAssistSensorDirectionHintV1({ referenceSample: args.referenceSample, currentSample: args.currentSample });
    if (hint) directionAgrees = hint === args.expectedDirection;
  }

  return { directionAgrees, tiltOk, stable };
}

/**
 * DIRECTION RESOLUTION: visual/geometric evidence (an actual matched
 * structural feature, positioned in both frames) always wins when present
 * -- "contradictory sensor movement does not override strong visual
 * geometry blindly." The sensor hint is used ONLY as a fallback while
 * visual evidence has not yet resolved a direction (e.g. early probes,
 * still below the confidence floor) -- exactly "infer once motion becomes
 * clear" from the product direction, applied to whichever signal actually
 * has an opinion first.
 */
export function resolveRouteAssistContinuationDirectionV1(args: { visualDirection: RouteAssistRelativeDirectionV1 | null; sensorHint: RouteAssistRelativeDirectionV1 | null }): RouteAssistRelativeDirectionV1 | null {
  return args.visualDirection ?? args.sensorHint;
}

// --- alignment probe classification + lock state machine -------------------

export const ROUTE_ASSIST_ALIGNMENT_STATES_V1 = ["SEARCHING", "CLOSE", "HOLD_STEADY", "ALIGNED"] as const;
export type RouteAssistAlignmentStateV1 = (typeof ROUTE_ASSIST_ALIGNMENT_STATES_V1)[number];

export type RouteAssistAlignmentProbeV1 = {
  matched: boolean;
  confidence: number;
  overlapFraction: number;
  /** null/undefined when sensors are unavailable -- classification below must (and does) fall back to visual-only in that case. */
  sensor?: RouteAssistSensorSignalV1 | null;
};

export type RouteAssistAlignmentClassificationV1 = { tier: "SEARCHING" | "CLOSE" | "READY"; reason: string };

/**
 * Fuses visual overlap (frameContinuation.ts's UNCHANGED window
 * classifier) with the assistive sensor signal into one per-probe
 * classification. MOVE_BACK/KEEP_MOVING from the visual window always
 * means SEARCHING (the sensor has no opinion that could rescue an
 * insufficient overlap reading -- it is not geometric authority). Once
 * the visual window is IN_RANGE, a poor tilt or instability reading holds
 * the state at CLOSE rather than letting it progress -- these are
 * legitimate, INDEPENDENT quality concerns about the current probe (a
 * crooked or shaking phone produces a worse candidate photo regardless of
 * overlap), not a geometric veto. directionAgrees is deliberately NEVER
 * consulted here -- see resolveRouteAssistContinuationDirectionV1's own
 * doc comment for why sensor direction is advisory-only.
 */
export function classifyRouteAssistAlignmentProbeV1(probe: RouteAssistAlignmentProbeV1): RouteAssistAlignmentClassificationV1 {
  const window = evaluateRouteAssistContinuationWindowV1({ matched: probe.matched, confidence: probe.confidence, overlapFraction: probe.overlapFraction });
  if (window.state === "MOVE_BACK") return { tier: "SEARCHING", reason: "Move back slightly." };
  if (window.state === "KEEP_MOVING") return { tier: "SEARCHING", reason: "Keep moving." };
  if (probe.sensor?.tiltOk === false) return { tier: "CLOSE", reason: "Straighten the phone." };
  if (probe.sensor?.stable === false) return { tier: "CLOSE", reason: "Hold steady." };
  return { tier: "READY", reason: "Almost there." };
}

export const ROUTE_ASSIST_ALIGNMENT_LOCK_MIN_CONSECUTIVE_READY_V1 = 2;
export const ROUTE_ASSIST_ALIGNMENT_LOCK_MIN_DURATION_MS_V1 = 900;

export type RouteAssistAlignmentLockStateV1 = { consecutiveReady: number; holdStartedAtMs: number | null };

export function initialRouteAssistAlignmentLockStateV1(): RouteAssistAlignmentLockStateV1 {
  return { consecutiveReady: 0, holdStartedAtMs: null };
}

export type RouteAssistAlignmentAdvanceResultV1 = {
  lockState: RouteAssistAlignmentLockStateV1;
  state: RouteAssistAlignmentStateV1;
  reason: string;
  shouldCapture: boolean;
};

/**
 * The lock state machine: SEARCHING/CLOSE reset the hold outright (never
 * merely pause it -- "if alignment is lost during hold, cancel the lock
 * and return to guidance"). A READY-tier probe accumulates toward
 * HOLD_STEADY -> ALIGNED using the same dual consecutive-count-or-elapsed-
 * time rule as the prior pass's hold logic (whichever is satisfied first),
 * and shouldCapture becomes true on the exact probe that reaches ALIGNED
 * -- capture never fires on a single isolated reading.
 */
export function advanceRouteAssistAlignmentLockV1(args: { previous: RouteAssistAlignmentLockStateV1; probe: RouteAssistAlignmentProbeV1; nowMs: number }): RouteAssistAlignmentAdvanceResultV1 {
  const classification = classifyRouteAssistAlignmentProbeV1(args.probe);
  if (classification.tier === "SEARCHING") {
    return { lockState: initialRouteAssistAlignmentLockStateV1(), state: "SEARCHING", reason: classification.reason, shouldCapture: false };
  }
  if (classification.tier === "CLOSE") {
    return { lockState: initialRouteAssistAlignmentLockStateV1(), state: "CLOSE", reason: classification.reason, shouldCapture: false };
  }
  const consecutiveReady = args.previous.consecutiveReady + 1;
  const holdStartedAtMs = args.previous.holdStartedAtMs ?? args.nowMs;
  const elapsedMs = args.nowMs - holdStartedAtMs;
  const stable = consecutiveReady >= ROUTE_ASSIST_ALIGNMENT_LOCK_MIN_CONSECUTIVE_READY_V1 || elapsedMs >= ROUTE_ASSIST_ALIGNMENT_LOCK_MIN_DURATION_MS_V1;
  if (!stable) return { lockState: { consecutiveReady, holdStartedAtMs }, state: "HOLD_STEADY", reason: "Hold steady.", shouldCapture: false };
  return { lockState: { consecutiveReady, holdStartedAtMs }, state: "ALIGNED", reason: "Aligned.", shouldCapture: true };
}

// --- ghost-edge geometry -----------------------------------------------------

export type RouteAssistNormalizedRectV1 = { x: number; y: number; width: number; height: number };

/**
 * POLISH CORRECTION (real-phone feedback): a full quarter of the photo,
 * at the prior pass's higher opacity, read as a second image layered
 * over the camera rather than a narrow reference aid. Narrowed to within
 * the product direction's tighter 18-22% target band -- still wide
 * enough to recognize a doorway edge, wall/ceiling line, window, trim,
 * or fixed fixture, but unmistakably a strip, not a photo.
 */
export const ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1 = 0.2;

/**
 * The source crop rectangle (in the PREVIOUS accepted frame's own
 * normalized [0,1] local space) for the ghost-edge alignment strip --
 * never the whole image, never warped/stretched, always taken from
 * whichever edge lies in the direction of travel. Used by the client to
 * crop (never resize-distort) a canvas region from the previous photo.
 */
export function ghostEdgeCropRectV1(direction: RouteAssistRelativeDirectionV1, stripFraction: number = ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1): RouteAssistNormalizedRectV1 {
  switch (direction) {
    case "RIGHT":
      return { x: 1 - stripFraction, y: 0, width: stripFraction, height: 1 };
    case "LEFT":
      return { x: 0, y: 0, width: stripFraction, height: 1 };
    case "UP":
      return { x: 0, y: 0, width: 1, height: stripFraction };
    case "DOWN":
      return { x: 0, y: 1 - stripFraction, width: 1, height: stripFraction };
  }
}

/**
 * GHOST-EDGE DISPLAY SIDE: the strip's SOURCE content comes from the far
 * edge of the previous photo in the direction of travel (above), but it is
 * shown on the NEAR/opposite edge of the LIVE camera view -- panning RIGHT
 * means the new frame's LEFT portion is what overlaps the previous frame's
 * RIGHT edge, so the ghost of that right edge belongs on the live view's
 * LEFT side for the homeowner to match against. This is the exact layout
 * the storyboard reference shows (a "Move right" instruction paired with
 * the ghost strip on the left portion of the screen). Reusing
 * ghostEdgeCropRectV1 with this OPPOSITE direction gives the on-screen
 * placement rectangle for the same strip image, at the same fraction.
 */
export function ghostEdgeDisplayEdgeV1(direction: RouteAssistRelativeDirectionV1): RouteAssistRelativeDirectionV1 {
  switch (direction) {
    case "RIGHT":
      return "LEFT";
    case "LEFT":
      return "RIGHT";
    case "UP":
      return "DOWN";
    case "DOWN":
      return "UP";
  }
}
