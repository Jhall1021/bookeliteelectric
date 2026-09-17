"use client";

import { useEffect, useRef, useState } from "react";
import {
  advanceRouteAssistCaptureHoldV1,
  initialRouteAssistCaptureHoldStateV1,
  type RouteAssistCaptureHoldStateV1,
  type RouteAssistContinuationGuidanceStateV1,
} from "@/lib/visual-assist/route-assist/frameContinuation";
import { ghostEdgeCropRectV1, ghostEdgeDisplayEdgeV1, type RouteAssistNormalizedRectV1 } from "@/lib/visual-assist/route-assist/alignmentLock";
import type { RouteAssistRelativeDirectionV1 } from "@/lib/visual-assist/route-assist/frameContinuation";
import { loadRouteAssistImageV1 } from "@/lib/visual-assist/route-assist/projectiveRenderer";

/**
 * CAPTURE-UX ISOLATION PASS (product correction: the prior passes' final
 * stitched-workspace preview -- real geometric registration, WebGL
 * projective rendering, CSS-affine composition -- made it impossible to
 * tell, from a single real-phone failure, whether the problem was the
 * capture interaction itself or one of those later stages. This pass
 * deliberately REMOVES all of that from the loop (the underlying modules
 * -- imageRegistration.ts, stitchedWorkspace.ts, projectiveRenderer.ts's
 * WebGL drawer, alignmentLock.ts's sensor-fused lock -- are UNTOUCHED and
 * still exist; this file simply does not call them) so the ONLY thing
 * being proven here is: does the storyboard's capture interaction itself
 * work, on a real phone, every time?
 *
 * GOVERNING STORYBOARD INTERACTION, exactly:
 *   Photo 1 (full-screen, manual capture) -> review ("Does this show/
 *   cover the entire work area?") -> [Add another view] -> camera opens
 *   immediately with a FIXED, non-AI-inferred ghost strip (the rightmost
 *   ~25% of the LAST captured photo, shown untransformed on the LEFT ~25%
 *   of the live view) -> the homeowner manually pans right to line it up
 *   -> simple guidance states (Move right -> Almost there -> Hold steady
 *   -> Aligned) -> a MANUAL shutter button (never auto-capture, for this
 *   pass specifically, to separate alignment logic from camera-timing
 *   bugs) -> the new photo is appended to a PLAIN list and shown via
 *   ordinary <img> panels, never a canvas/WebGL/transformed composite.
 *
 * Every captured photo is accepted unconditionally into that plain list.
 * There is no workspace, no registration call, no marker, no route
 * evaluation anywhere in this file -- reconnecting those is explicitly
 * future work, once this capture interaction itself is proven reliable.
 *
 * Direction is HARDCODED to RIGHT for this pass ("make rightward
 * continuation the primary proven path"). ghostEdgeCropRectV1/
 * ghostEdgeDisplayEdgeV1 are already direction-parameterized (LEFT works
 * identically, mirrored) -- LEFT is intentionally not wired into this
 * pass's UI, so its own complexity (if any) cannot block the RIGHT proof.
 */

type Stage = "CAPTURE_FIRST" | "REVIEW" | "ALIGNMENT" | "COMPLETE";

type CapturedFrameV1 = { imageId: string; dataUrl: string; width: number; height: number };

type OverlapAssessmentResponseV1 = { matched: true; confidence: number; overlapFraction: number } | { matched: false; confidence: number; overlapFraction: number };

const EVIDENCE_DESCRIPTION = "a visible wall corner, transition, doorway, window edge, or other stable architectural feature where the previous captured area left off";

/** This pass's single proven continuation direction -- see the module doc comment. */
const CONTINUATION_DIRECTION: RouteAssistRelativeDirectionV1 = "RIGHT";

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
 * Pure presentation mapping, exported so it is directly unit-testable:
 * MOVE_BACK/KEEP_MOVING (overlap not yet good enough) both read as the
 * single "keep panning" prompt -- the storyboard names exactly one
 * direction message, not a developer-level distinction between "too
 * little overlap" and "too much." Once the window is IN_RANGE
 * (ALMOST_THERE), the very first probe that enters it reads as "Almost
 * there"; continuing to hold reads as "Hold steady" -- two readable steps
 * out of the SAME underlying hold-in-progress signal, using nothing but
 * the hold state's own consecutiveInRange counter. READY_TO_CAPTURE reads
 * as "Aligned".
 */
export function routeAssistAlignmentGuidanceLabelV1(guidance: RouteAssistContinuationGuidanceStateV1, holdState: RouteAssistCaptureHoldStateV1): string {
  switch (guidance) {
    case "MOVE_BACK":
    case "KEEP_MOVING":
      return "Move right →";
    case "ALMOST_THERE":
      return holdState.consecutiveInRange > 1 ? "Hold steady" : "Almost there";
    case "READY_TO_CAPTURE":
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
 * Photo 2+: camera-first alignment mode, matching the storyboard exactly.
 * The ghost strip is a FIXED prop (computed once, immediately, by the
 * parent -- never recomputed or repositioned here, never AI-derived).
 * Guidance text/state is display-only; capture is ALWAYS a manual button
 * tap, never automatic, for this pass.
 */
function RouteAssistGhostAlignmentCameraV1({
  ghostStripUrl,
  guidanceLabel,
  captureEnabled,
  onProbeFrame,
  onCaptured,
}: {
  ghostStripUrl: string | null;
  guidanceLabel: string;
  captureEnabled: boolean;
  probeIntervalMs?: number;
  onProbeFrame: (downscaledDataUrl: string) => void;
  onCaptured: (args: { dataUrl: string; width: number; height: number }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const probingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

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
    }, 900);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayEdge = ghostEdgeDisplayEdgeV1(CONTINUATION_DIRECTION);
  const ghostRect = ghostEdgeCropRectV1(displayEdge);
  const aligned = guidanceLabel === "✓ Aligned";

  return (
    <div className="flex flex-col gap-3" data-testid="route-assist-alignment-panel">
      <div className="relative overflow-hidden rounded-xl bg-black" data-testid="route-assist-alignment-camera">
        <video ref={videoRef} playsInline muted className="w-full" style={{ minHeight: 360 }} />
        {error && (
          <p className="absolute inset-x-0 top-0 bg-red-600/90 p-2 text-center text-xs text-white" data-testid="route-assist-camera-error">
            {error}
          </p>
        )}
        {ghostStripUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ghostStripUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute object-contain opacity-45"
            style={{ left: `${ghostRect.x * 100}%`, top: `${ghostRect.y * 100}%`, width: `${ghostRect.width * 100}%`, height: `${ghostRect.height * 100}%` }}
            data-testid="route-assist-ghost-edge-strip"
          />
        )}
        {ghostStripUrl && (
          <div
            className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold ${aligned ? "bg-emerald-500 text-white" : "bg-black/70 text-white"}`}
            data-testid="route-assist-alignment-badge"
          >
            Match this edge
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-black/60 p-3">
          <p className={`text-sm font-semibold ${aligned ? "text-emerald-300" : "text-white"}`} data-testid="route-assist-alignment-reason">
            {guidanceLabel}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={takePhoto}
        disabled={!captureEnabled}
        className="rounded-xl bg-electric px-5 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        data-testid="route-assist-alignment-shutter"
      >
        {captureEnabled ? "Capture" : "Line up the ghost edge to capture"}
      </button>
    </div>
  );
}

/** An ordinary, untransformed photo panel -- no canvas, no WebGL, no CSS transform. Used everywhere a captured photo is shown in this pass. */
function RouteAssistPlainPhotoPanelV1({ frame, label }: { frame: CapturedFrameV1; label: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={`route-assist-photo-panel-${frame.imageId}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frame.dataUrl} alt="" className="w-full rounded-xl border border-slate-200 object-contain" data-testid={`route-assist-photo-image-${frame.imageId}`} />
      <p className="text-center text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function RouteAssistGuidedContinuationPreviewClient() {
  const [stage, setStage] = useState<Stage>("CAPTURE_FIRST");
  const [frames, setFrames] = useState<CapturedFrameV1[]>([]);
  const [ghostStripUrl, setGhostStripUrl] = useState<string | null>(null);
  const [alignmentGuidance, setAlignmentGuidance] = useState<RouteAssistContinuationGuidanceStateV1>("MOVE_BACK");
  const [alignmentHold, setAlignmentHold] = useState<RouteAssistCaptureHoldStateV1>(initialRouteAssistCaptureHoldStateV1());
  const holdStateRef = useRef<RouteAssistCaptureHoldStateV1>(initialRouteAssistCaptureHoldStateV1());

  function handleFirstPhoto(args: { dataUrl: string; width: number; height: number }) {
    const imageId = `frame-${Date.now()}`;
    setFrames([{ imageId, dataUrl: args.dataUrl, width: args.width, height: args.height }]);
    setStage("REVIEW");
  }

  function finishCapture() {
    setStage("COMPLETE");
  }

  /**
   * "The ghost strip must appear immediately. Do NOT wait for AI to infer
   * a direction first." Direction is hardcoded (CONTINUATION_DIRECTION);
   * the ghost is a plain local crop, computed once here and never
   * recomputed for the rest of this alignment attempt.
   */
  async function startAlignment() {
    const previousFrame = frames[frames.length - 1];
    if (!previousFrame) return;
    holdStateRef.current = initialRouteAssistCaptureHoldStateV1();
    setAlignmentGuidance("MOVE_BACK");
    setAlignmentHold(initialRouteAssistCaptureHoldStateV1());
    setStage("ALIGNMENT");
    try {
      const rect = ghostEdgeCropRectV1(CONTINUATION_DIRECTION);
      const url = await cropRouteAssistGhostStripV1(previousFrame.dataUrl, rect, previousFrame.width, previousFrame.height);
      setGhostStripUrl(url);
    } catch {
      setGhostStripUrl(null);
    }
  }

  /**
   * Live guidance only -- MOVE_BACK/KEEP_MOVING/ALMOST_THERE/
   * READY_TO_CAPTURE, exactly frameContinuation.ts's UNCHANGED window/
   * hold classifier. Never triggers capture itself (see
   * handleShutterCaptured) -- this pass captures only on a manual tap.
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
        holdStateRef.current = initialRouteAssistCaptureHoldStateV1();
        setAlignmentGuidance("MOVE_BACK");
        setAlignmentHold(holdStateRef.current);
        return;
      }
      const assessment = body.assessment;
      const advance = advanceRouteAssistCaptureHoldV1({
        previous: holdStateRef.current,
        probe: { matched: assessment.matched, confidence: assessment.confidence, overlapFraction: assessment.matched ? assessment.overlapFraction : 0 },
        nowMs: Date.now(),
      });
      holdStateRef.current = advance.holdState;
      setAlignmentGuidance(advance.guidance);
      setAlignmentHold(advance.holdState);
    } catch {
      holdStateRef.current = initialRouteAssistCaptureHoldStateV1();
      setAlignmentGuidance("MOVE_BACK");
      setAlignmentHold(holdStateRef.current);
    }
  }

  /** Unconditional accept -- no registration call, no workspace, for this capture-isolation pass. See the module doc comment. */
  function handleShutterCaptured(args: { dataUrl: string; width: number; height: number }) {
    const imageId = `frame-${Date.now()}`;
    setFrames((existing) => [...existing, { imageId, dataUrl: args.dataUrl, width: args.width, height: args.height }]);
    setStage("REVIEW");
  }

  const guidanceLabel = routeAssistAlignmentGuidanceLabelV1(alignmentGuidance, alignmentHold);
  const captureEnabled = alignmentGuidance === "READY_TO_CAPTURE";

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
            <div className={frames.length > 1 ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"} data-testid="route-assist-photo-grid">
              {frames.map((frame, index) => (
                <RouteAssistPlainPhotoPanelV1 key={frame.imageId} frame={frame} label={`Photo ${index + 1}`} />
              ))}
            </div>
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
            guidanceLabel={guidanceLabel}
            captureEnabled={captureEnabled}
            onProbeFrame={handleAlignmentProbeFrame}
            onCaptured={handleShutterCaptured}
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
