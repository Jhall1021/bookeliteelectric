"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  advanceRouteAssistAlignmentEvidenceV1,
  advanceRouteAssistDirectionLockV1,
  initialRouteAssistAlignmentEvidenceStateV1,
  initialRouteAssistDirectionLockStateV1,
  restartRouteAssistDirectionLockV1,
  type RouteAssistAlignmentEvidenceStateSnapshotV1,
  type RouteAssistAlignmentEvidenceStateV1,
  type RouteAssistDirectionLockStateV1,
} from "@/lib/visual-assist/route-assist/alignmentEvidence";
import { ghostEdgeCropRectV1, ghostEdgeDisplayEdgeV1, type RouteAssistNormalizedRectV1 } from "@/lib/visual-assist/route-assist/alignmentLock";
import type { RouteAssistRelativeDirectionV1 } from "@/lib/visual-assist/route-assist/frameContinuation";
import { loadRouteAssistImageV1 } from "@/lib/visual-assist/route-assist/projectiveRenderer";

/**
 * CAPTURE-UX ISOLATION PASS, continued (the underlying modules --
 * imageRegistration.ts, stitchedWorkspace.ts, projectiveRenderer.ts's
 * WebGL drawer -- remain UNTOUCHED and uncalled; this file still proves
 * only the capture interaction itself, not geometric stitching).
 *
 * THIS PASS'S REAL-PHONE CORRECTIONS:
 *
 *   1. GHOST MAPPING: the ghost strip used object-fit "contain", which
 *      LETTERBOXES (shrinks and centers with empty margins) whenever the
 *      strip's own crop aspect ratio doesn't exactly match the live
 *      camera container's rendered aspect ratio -- a live video stream's
 *      native resolution is not guaranteed to match a previously captured
 *      photo's, since neither getUserMedia call constrains it. Any
 *      letterbox margin shifts where the strip's real content sits
 *      inside its band, which is exactly "features remain offset when
 *      Aligned appears". Switched to object-fit "cover": the strip always
 *      fills its band edge-to-edge (cropping a little of its own margin
 *      if aspect ratios differ, never stretching/warping), so the
 *      content that IS shown sits at the band's true position.
 *
 *   2. FOUR DIRECTIONS, SYMMETRICALLY: direction is no longer hardcoded.
 *      It is INFERRED from the SAME per-probe overlap call's existing
 *      relativeDirection hint (frameOverlapAiGateway.ts, unchanged) and
 *      LOCKED once 2 consecutive matched probes agree
 *      (alignmentEvidence.ts's direction-lock engine) -- "initial
 *      meaningful movement", not a single guess. Locked direction never
 *      changes itself; a homeowner who started panning the wrong way taps
 *      "Restart direction" to try again. Because direction is unknown
 *      until locked, the ghost strip cannot appear immediately anymore --
 *      a brief (typically 1-2 probe) generic "pan to continue" moment
 *      comes first. This is a deliberate, documented trade of the
 *      previous pass's "ghost appears instantly" for actually supporting
 *      all four directions without guessing.
 *
 *   3. EVIDENCE-BASED ALIGNMENT: replaced the borrowed hold logic that
 *      let "elapsed time" alone satisfy stability (which the product
 *      direction now explicitly forbids) and collapsed "hold steady" into
 *      an unreachable state (its 2-consecutive-probe stability threshold
 *      was indistinguishable from its own entry condition). See
 *      alignmentEvidence.ts's own module doc comment for the full
 *      diagnosis. ALIGNED is now continuously revalidated every probe
 *      (never a one-way latch) and uses its own short hysteresis so one
 *      noisy probe cannot flicker the state.
 *
 * Every captured photo is still accepted unconditionally into a plain
 * list -- no workspace, no registration call, no marker, no route
 * evaluation anywhere in this file. Whether an accepted pair would
 * actually satisfy the real geometric registration layer
 * (imageRegistration.ts) is DELIBERATELY NOT CHECKED here and is reported
 * as unverified, per this pass's own scope ("focus on trustworthy
 * guidance and direction handling", not stitching).
 */

type Stage = "CAPTURE_FIRST" | "REVIEW" | "ALIGNMENT" | "COMPLETE";

type CapturedFrameV1 = { imageId: string; dataUrl: string; width: number; height: number };

type OverlapAssessmentResponseV1 =
  | { matched: true; confidence: number; overlapFraction: number; relativeDirection: RouteAssistRelativeDirectionV1 | null }
  | { matched: false; confidence: number; overlapFraction: number };

const EVIDENCE_DESCRIPTION = "a visible wall corner, transition, doorway, window edge, or other stable architectural feature where the previous captured area left off";

const PROBE_INTERVAL_MS = 900;

/**
 * POLISH CORRECTION (real-phone feedback): the ghost strip read as a
 * second image layered over the camera -- a double exposure -- rather
 * than a narrow reference aid. Set as an explicit inline opacity (not a
 * Tailwind utility class -- this project's default Tailwind config has
 * no "opacity-45" step on its scale, so the prior className's opacity
 * utility was silently dropped and the strip was almost certainly
 * rendering at FULL opacity the entire time, which is the real root
 * cause of "feels like a double exposure"). Still visible enough to
 * recognize a doorway edge, wall/ceiling line, window, trim, or fixed
 * fixture -- not so faint it becomes useless.
 */
const GHOST_STRIP_OPACITY = 0.35;

/**
 * PROVENANCE-GUARD FIX (ADR-015): the ghost/live divider's alternating
 * stripes must come through the semantic token layer, not a hardcoded
 * hex literal -- same rule, and same "rgb(var(--t-…))" pattern, as the
 * other route-assist components (RouteAssistSweepRouteReview.tsx,
 * RouteAssistSurfaceRacewayPreview.tsx). `surface` (#FFFFFF) and
 * `inkStrong` ("the darkest ink, for footers and HIGH-CONTRAST blocks")
 * already exist in lib/theme/tokens.ts and are exactly the semantic
 * fit a high-contrast decorative divider needs -- no new token required.
 */
const DIVIDER_LIGHT = "rgb(var(--t-surface))";
const DIVIDER_DARK = "rgb(var(--t-ink-strong))";

const DIRECTION_COPY: Record<RouteAssistRelativeDirectionV1, string> = {
  RIGHT: "Move right →",
  LEFT: "Move left ←",
  UP: "Move up ↑",
  DOWN: "Move down ↓",
};

function downscaledProbeFrame(video: HTMLVideoElement, maxWidth = 320): string {
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.6);
}

/** A RAW crop -- draws a sub-rectangle of the source photo onto a canvas at 1:1 scale of that sub-rectangle's own pixel size. No rotation, no scaling beyond the crop itself, no warp. */
async function cropRouteAssistGhostStripV1(sourceDataUrl: string, rect: RouteAssistNormalizedRectV1, sourceWidth: number, sourceHeight: number): Promise<string> {
  const image = await loadRouteAssistImageV1(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width * sourceWidth));
  canvas.height = Math.max(1, Math.round(rect.height * sourceHeight));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(image, rect.x * sourceWidth, rect.y * sourceHeight, rect.width * sourceWidth, rect.height * sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Pure presentation mapping, exported so it is directly unit-testable.
 * Before a direction is locked there is nothing to show a ghost against,
 * so every pre-lock state reads as the same generic prompt regardless of
 * the (not-yet-visible) evidence state. Once locked, SEARCHING reads as
 * the direction-specific "Move ___" prompt; ALMOST_THERE/HOLD_STEADY read
 * as themselves; ALIGNED reads as "✓ Aligned".
 */
export function routeAssistAlignmentGuidanceLabelV1(state: RouteAssistAlignmentEvidenceStateV1, lockedDirection: RouteAssistRelativeDirectionV1 | null): string {
  if (!lockedDirection) return "Pan slowly to continue capturing the work area.";
  switch (state) {
    case "SEARCHING":
      return DIRECTION_COPY[lockedDirection];
    case "ALMOST_THERE":
      return "Almost there";
    case "HOLD_STEADY":
      return "Hold steady";
    case "ALIGNED":
      return "✓ Aligned";
  }
}

/** Photo 1: full-screen camera, manual shutter, no ghost/alignment UI of any kind. */
function RouteAssistFirstCaptureV1({ onCaptured }: { onCaptured: (args: { dataUrl: string; width: number; height: number }) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setOpen(true);
    } catch {
      setError("We couldn't open the camera. Check camera permission and try again.");
    }
  }

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => setError("We couldn't start the camera preview. Check camera permission and try again."));
    return () => {
      if (streamRef.current === stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (video) video.srcObject = null;
    };
  }, [open]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setOpen(false);
    onCaptured({ dataUrl, width: canvas.width, height: canvas.height });
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="button" onClick={openCamera} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-workspace-open-camera">
          Take first photo
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="route-assist-first-capture-camera">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} playsInline muted className="w-full" style={{ minHeight: 360 }} />
      </div>
      <button type="button" onClick={takePhoto} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-workspace-take-photo">
        Take photo
      </button>
    </div>
  );
}

/**
 * Photo 2+: camera-first alignment mode. The ghost strip (once locked)
 * and guidance label are FIXED props computed by the parent -- never
 * recomputed or repositioned here. Capture is ALWAYS a manual button tap,
 * re-verified against the LATEST eligibility at the moment of the tap
 * (isCaptureEligibleNow), never solely trusting the `disabled` attribute
 * a stale render might have left in place ("recheck eligibility at
 * manual capture").
 */
function RouteAssistGhostAlignmentCameraV1({
  ghostStripUrl,
  lockedDirection,
  guidanceLabel,
  captureEnabled,
  isCaptureEligibleNow,
  onProbeFrame,
  onCaptured,
  onRestartDirection,
}: {
  ghostStripUrl: string | null;
  lockedDirection: RouteAssistRelativeDirectionV1 | null;
  guidanceLabel: string;
  captureEnabled: boolean;
  isCaptureEligibleNow: () => boolean;
  onProbeFrame: (downscaledDataUrl: string) => void;
  onCaptured: (args: { dataUrl: string; width: number; height: number }) => void;
  onRestartDirection: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const probingRef = useRef(false);
  const wasCaptureEnabledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [justAligned, setJustAligned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => setError("We couldn't start the camera preview. Check camera permission and try again."));
        }
      } catch {
        if (!cancelled) setError("We couldn't open the camera. Check camera permission and try again.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  /** A single, brief scale pulse the instant the shutter first becomes enabled -- not a continuous/looping animation. */
  useEffect(() => {
    const wasEnabled = wasCaptureEnabledRef.current;
    wasCaptureEnabledRef.current = captureEnabled;
    if (captureEnabled && !wasEnabled) {
      setJustAligned(true);
      const timeout = setTimeout(() => setJustAligned(false), 350);
      return () => clearTimeout(timeout);
    }
  }, [captureEnabled]);

  function takePhoto() {
    if (!isCaptureEligibleNow()) return; // RECHECK AT CAPTURE -- never trust only the button's own disabled attribute from a possibly-stale render.
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    onCaptured({ dataUrl, width: canvas.width, height: canvas.height });
  }

  useEffect(() => {
    const interval = setInterval(async () => {
      if (probingRef.current) return;
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      probingRef.current = true;
      try {
        const downscaled = downscaledProbeFrame(video);
        if (downscaled) onProbeFrame(downscaled);
      } finally {
        probingRef.current = false;
      }
    }, PROBE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aligned = captureEnabled;
  const displayEdge = lockedDirection ? ghostEdgeDisplayEdgeV1(lockedDirection) : null;
  const ghostRect = displayEdge ? ghostEdgeCropRectV1(displayEdge) : null;

  // DIVIDER: orientation follows the LOCKED continuation direction --
  // vertical for LEFT/RIGHT, horizontal for UP/DOWN -- positioned exactly
  // at the ghost strip's own boundary, never inside it or offset from it.
  const dividerIsVertical = displayEdge === "LEFT" || displayEdge === "RIGHT";
  const dividerFraction = ghostRect
    ? displayEdge === "LEFT"
      ? ghostRect.width
      : displayEdge === "RIGHT"
        ? 1 - ghostRect.width
        : displayEdge === "UP"
          ? ghostRect.height
          : 1 - ghostRect.height
    : 0;
  const dividerStyle: CSSProperties = dividerIsVertical
    ? { left: `${dividerFraction * 100}%`, top: 0, bottom: 0, width: 3, transform: "translateX(-1.5px)", backgroundImage: `repeating-linear-gradient(to bottom, ${DIVIDER_LIGHT} 0px 8px, ${DIVIDER_DARK} 8px 16px)` }
    : { top: `${dividerFraction * 100}%`, left: 0, right: 0, height: 3, transform: "translateY(-1.5px)", backgroundImage: `repeating-linear-gradient(to right, ${DIVIDER_LIGHT} 0px 8px, ${DIVIDER_DARK} 8px 16px)` };

  return (
    <div className="flex flex-col gap-3" data-testid="route-assist-alignment-panel">
      <div className="relative overflow-hidden rounded-xl bg-black" data-testid="route-assist-alignment-camera">
        <video ref={videoRef} playsInline muted className="w-full" style={{ minHeight: 360 }} />
        {error && (
          <p className="absolute inset-x-0 top-0 bg-red-600/90 p-2 text-center text-xs text-white" data-testid="route-assist-camera-error">
            {error}
          </p>
        )}
        {ghostStripUrl && ghostRect && (
          // GHOST-MAPPING FIX: object-fit "cover" (not "contain") -- the
          // strip always fills its band edge-to-edge, so its content sits
          // at the band's true position regardless of any aspect-ratio
          // difference between this captured photo and the live video
          // stream's own native resolution. Never stretched (cover only
          // crops, never distorts) and never the whole prior photo.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ghostStripUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute object-cover"
            style={{ left: `${ghostRect.x * 100}%`, top: `${ghostRect.y * 100}%`, width: `${ghostRect.width * 100}%`, height: `${ghostRect.height * 100}%`, opacity: GHOST_STRIP_OPACITY }}
            data-testid="route-assist-ghost-edge-strip"
          />
        )}
        {ghostStripUrl && <div className="pointer-events-none absolute opacity-80" style={dividerStyle} data-testid="route-assist-ghost-divider" />}
        {ghostStripUrl && (
          <div
            className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold ${aligned ? "bg-emerald-500 text-white" : "bg-black/70 text-white"}`}
            data-testid="route-assist-alignment-badge"
          >
            {aligned ? "✓ Aligned" : "Match this edge"}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-black/60 p-3">
          <p className={`text-sm font-semibold transition-opacity ${aligned ? "text-emerald-300" : "text-white opacity-90"}`} data-testid="route-assist-alignment-reason">
            {guidanceLabel}
          </p>
        </div>
      </div>
      <button type="button" onClick={onRestartDirection} className="self-center text-xs font-medium text-slate-500 underline" data-testid="route-assist-restart-direction">
        ↺ Not the right direction? Restart
      </button>
      <button
        type="button"
        onClick={takePhoto}
        disabled={!captureEnabled}
        className={`rounded-xl px-5 py-4 text-base font-semibold transition-transform duration-300 ${captureEnabled ? "bg-electric text-white" : "cursor-not-allowed bg-slate-300 text-slate-500"} ${justAligned ? "scale-105" : "scale-100"}`}
        data-testid="route-assist-alignment-shutter"
      >
        {captureEnabled ? "Capture" : "Line up the ghost edge to capture"}
      </button>
    </div>
  );
}

/**
 * An ordinary, untransformed photo panel -- no canvas, no WebGL, no CSS
 * transform. Used everywhere a captured photo is shown in this pass.
 * layout="grid" fills the width of a side-by-side grid cell (height
 * follows naturally, preserving aspect ratio exactly); layout="filmstrip"
 * fixes a comfortable READABLE height and lets width follow the photo's
 * own aspect ratio, for a horizontally-scrolling row of 3+ photos --
 * either way, no cropping that would hide captured content.
 */
function RouteAssistPlainPhotoPanelV1({ frame, label, layout }: { frame: CapturedFrameV1; label: string; layout: "grid" | "filmstrip" }) {
  return (
    <div className={layout === "filmstrip" ? "flex flex-shrink-0 flex-col gap-1" : "flex flex-col gap-1"} data-testid={`route-assist-photo-panel-${frame.imageId}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frame.dataUrl}
        alt=""
        className={layout === "filmstrip" ? "rounded-xl border border-slate-200 object-contain" : "w-full rounded-xl border border-slate-200 object-contain"}
        style={layout === "filmstrip" ? { height: 240, width: "auto" } : undefined}
        data-testid={`route-assist-photo-image-${frame.imageId}`}
      />
      <p className="text-center text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function RouteAssistGuidedContinuationPreviewClient() {
  const [stage, setStage] = useState<Stage>("CAPTURE_FIRST");
  const [frames, setFrames] = useState<CapturedFrameV1[]>([]);
  const [ghostStripUrl, setGhostStripUrl] = useState<string | null>(null);
  const [lockedDirection, setLockedDirection] = useState<RouteAssistRelativeDirectionV1 | null>(null);
  const [alignmentState, setAlignmentState] = useState<RouteAssistAlignmentEvidenceStateV1>("SEARCHING");

  const directionLockRef = useRef<RouteAssistDirectionLockStateV1>(initialRouteAssistDirectionLockStateV1());
  const evidenceRef = useRef<RouteAssistAlignmentEvidenceStateSnapshotV1>(initialRouteAssistAlignmentEvidenceStateV1());
  const alignmentStateRef = useRef<RouteAssistAlignmentEvidenceStateV1>("SEARCHING");

  function handleFirstPhoto(args: { dataUrl: string; width: number; height: number }) {
    const imageId = `frame-${Date.now()}`;
    setFrames([{ imageId, dataUrl: args.dataUrl, width: args.width, height: args.height }]);
    setStage("REVIEW");
  }

  function finishCapture() {
    setStage("COMPLETE");
  }

  /** Shared reset for both "start a fresh alignment attempt" and "restart direction" -- direction unlocked, evidence cleared, ghost cleared. */
  function resetAlignmentAttempt() {
    directionLockRef.current = initialRouteAssistDirectionLockStateV1();
    evidenceRef.current = initialRouteAssistAlignmentEvidenceStateV1();
    alignmentStateRef.current = "SEARCHING";
    setLockedDirection(null);
    setAlignmentState("SEARCHING");
    setGhostStripUrl(null);
  }

  /**
   * "The ghost strip must appear immediately" is no longer possible once
   * direction is inferred rather than assumed -- there is nothing to crop
   * an edge FROM until we know which edge. This deliberately opens
   * directly into a generic "pan to continue" moment; the ghost appears
   * the instant direction locks (see handleAlignmentProbeFrame).
   */
  function startAlignment() {
    resetAlignmentAttempt();
    setStage("ALIGNMENT");
  }

  /** "Restart direction" -- the homeowner's own correction path if the locked (or still-inferring) direction was wrong. Stays on the alignment screen. */
  function restartDirection() {
    resetAlignmentAttempt();
  }

  async function computeGhostStrip(direction: RouteAssistRelativeDirectionV1, previousFrame: CapturedFrameV1) {
    try {
      const rect = ghostEdgeCropRectV1(direction);
      const url = await cropRouteAssistGhostStripV1(previousFrame.dataUrl, rect, previousFrame.width, previousFrame.height);
      setGhostStripUrl(url);
    } catch {
      setGhostStripUrl(null);
    }
  }

  /**
   * Every probe first feeds direction inference (until locked), then --
   * once locked -- feeds the evidence-based alignment engine. Never
   * triggers capture itself; this pass captures only on a manual tap,
   * re-verified at the moment of that tap (see isCaptureEligibleNow).
   */
  async function handleAlignmentProbeFrame(downscaledDataUrl: string): Promise<void> {
    const previousFrame = frames[frames.length - 1];
    if (!previousFrame) return;
    try {
      const response = await fetch("/api/dev-fixtures/route-assist-frame-overlap-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDataUrl: previousFrame.dataUrl, toDataUrl: downscaledDataUrl, evidenceDescription: EVIDENCE_DESCRIPTION }),
      });
      const body = (await response.json().catch(() => null)) as { assessment?: OverlapAssessmentResponseV1 } | null;
      if (!response.ok || !body?.assessment) {
        evidenceRef.current = initialRouteAssistAlignmentEvidenceStateV1();
        alignmentStateRef.current = "SEARCHING";
        setAlignmentState("SEARCHING");
        return;
      }
      const assessment = body.assessment;
      const probe = { matched: assessment.matched, confidence: assessment.confidence, overlapFraction: assessment.matched ? assessment.overlapFraction : 0 };

      if (!directionLockRef.current.locked) {
        const hint = assessment.matched ? assessment.relativeDirection : null;
        const nextLock = advanceRouteAssistDirectionLockV1({ previous: directionLockRef.current, hint });
        directionLockRef.current = nextLock;
        if (nextLock.locked) {
          setLockedDirection(nextLock.locked);
          const advanced = advanceRouteAssistAlignmentEvidenceV1({ previous: initialRouteAssistAlignmentEvidenceStateV1(), probe });
          evidenceRef.current = advanced;
          alignmentStateRef.current = advanced.state;
          setAlignmentState(advanced.state);
          void computeGhostStrip(nextLock.locked, previousFrame);
        }
        return;
      }

      const advanced = advanceRouteAssistAlignmentEvidenceV1({ previous: evidenceRef.current, probe });
      evidenceRef.current = advanced;
      alignmentStateRef.current = advanced.state;
      setAlignmentState(advanced.state);
    } catch {
      evidenceRef.current = initialRouteAssistAlignmentEvidenceStateV1();
      alignmentStateRef.current = "SEARCHING";
      setAlignmentState("SEARCHING");
    }
  }

  /** RECHECK AT CAPTURE: read straight from the ref, not a possibly-stale prop closure -- the freshest known evidence state at the exact moment of the tap. */
  function isCaptureEligibleNow(): boolean {
    return alignmentStateRef.current === "ALIGNED" && directionLockRef.current.locked !== null;
  }

  /** Unconditional accept -- no registration call, no workspace, for this capture-isolation pass. See the module doc comment. */
  function handleShutterCaptured(args: { dataUrl: string; width: number; height: number }) {
    const imageId = `frame-${Date.now()}`;
    setFrames((existing) => [...existing, { imageId, dataUrl: args.dataUrl, width: args.width, height: args.height }]);
    setStage("REVIEW");
  }

  const guidanceLabel = routeAssistAlignmentGuidanceLabelV1(alignmentState, lockedDirection);
  const captureEnabled = alignmentState === "ALIGNED" && lockedDirection !== null;

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-electric">Price2Book</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist</h1>
        </header>

        {stage === "CAPTURE_FIRST" && (
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="route-assist-capture-stage">
            <p className="text-sm text-slate-700">Take one wide photo showing as much of the work area as possible.</p>
            <RouteAssistFirstCaptureV1 onCaptured={handleFirstPhoto} />
          </div>
        )}

        {stage === "REVIEW" && (
          <div className="flex flex-col gap-4" data-testid="route-assist-review-stage">
            <h2 className="text-lg font-semibold text-navy">{frames.length === 1 ? "Here's the area we captured" : `${frames.length} views captured`}</h2>
            {frames.length <= 2 ? (
              <div className={frames.length === 1 ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2"} data-testid="route-assist-photo-grid">
                {frames.map((frame, index) => (
                  <RouteAssistPlainPhotoPanelV1 key={frame.imageId} frame={frame} label={`Photo ${index + 1}`} layout="grid" />
                ))}
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1" data-testid="route-assist-photo-grid">
                {frames.map((frame, index) => (
                  <RouteAssistPlainPhotoPanelV1 key={frame.imageId} frame={frame} label={`Photo ${index + 1}`} layout="filmstrip" />
                ))}
              </div>
            )}
            <p className="text-sm text-slate-700" data-testid="route-assist-review-question">
              {frames.length === 1 ? "Does this show the entire work area?" : "Does this cover the entire work area?"}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={finishCapture} className="flex-1 rounded-xl bg-electric px-4 py-3 text-sm font-semibold text-white" data-testid="route-assist-review-looks-good">
                Looks good — continue
              </button>
              <button type="button" onClick={startAlignment} className="flex-1 rounded-xl border border-electric px-4 py-3 text-sm font-semibold text-electric" data-testid="route-assist-review-add-view">
                Add another view
              </button>
            </div>
          </div>
        )}

        {stage === "ALIGNMENT" && (
          <RouteAssistGhostAlignmentCameraV1
            ghostStripUrl={ghostStripUrl}
            lockedDirection={lockedDirection}
            guidanceLabel={guidanceLabel}
            captureEnabled={captureEnabled}
            isCaptureEligibleNow={isCaptureEligibleNow}
            onProbeFrame={handleAlignmentProbeFrame}
            onCaptured={handleShutterCaptured}
            onRestartDirection={restartDirection}
          />
        )}

        {stage === "COMPLETE" && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4" data-testid="route-assist-complete-stage">
            <h2 className="text-lg font-semibold text-navy">Capture complete</h2>
            <p className="text-sm text-slate-700">
              {frames.length} photo{frames.length === 1 ? "" : "s"} captured. Device placement and the final stitched workspace are not part of this proof.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
