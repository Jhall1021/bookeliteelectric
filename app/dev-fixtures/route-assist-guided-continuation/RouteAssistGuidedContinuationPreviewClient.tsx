"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "@/lib/visual-assist/route-assist/factModel";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "@/lib/visual-assist/route-assist/livePhotoFactAdapter";
import {
  advanceRouteAssistAlignmentLockV1,
  deriveRouteAssistSensorDirectionHintV1,
  deriveRouteAssistSensorSignalV1,
  ghostEdgeCropRectV1,
  ghostEdgeDisplayEdgeV1,
  initialRouteAssistAlignmentLockStateV1,
  resolveRouteAssistContinuationDirectionV1,
  type RouteAssistAlignmentLockStateV1,
  type RouteAssistAlignmentStateV1,
  type RouteAssistOrientationSampleV1,
} from "@/lib/visual-assist/route-assist/alignmentLock";
import {
  addRouteAssistStitchedWorkspaceFrameV1,
  deriveRouteAssistWorkspaceLegFrameContributionsV1,
  deriveRouteAssistWorkspaceLegIntentsV1,
  emptyRouteAssistStitchedWorkspaceV1,
  evaluateRouteAssistWorkspaceLegV1,
  frameLocalToWorkspaceV1,
  frameWorkspaceBoundsV1,
  markRouteAssistStitchedWorkspaceCompleteV1,
  nextRouteAssistWorkspaceMarkerLabelV1,
  placeRouteAssistWorkspaceMarkerV1,
  primarySupportingFrameForWorkspacePointV1,
  removeRouteAssistWorkspaceMarkerV1,
  setRouteAssistWorkspaceMarkerControllingSwitchV1,
  setRouteAssistWorkspaceMarkerTypeV1,
  workspaceOverallBoundsV1,
  workspaceToFrameLocalV1,
  type RouteAssistStitchedWorkspaceV1,
  type RouteAssistWorkspaceBoundsV1,
  type RouteAssistWorkspaceFrameRegistrationV1,
  type RouteAssistWorkspaceLegEvaluationV1,
  type RouteAssistWorkspaceMarkerV1,
} from "@/lib/visual-assist/route-assist/stitchedWorkspace";
import { ROUTE_ASSIST_RELATIVE_DIRECTIONS_V1, type RouteAssistRelativeDirectionV1 } from "@/lib/visual-assist/route-assist/frameContinuation";
import { isAffineRepresentableV1, type RouteAssistRegistrationResultV1, type RouteAssistTransformMatrixV1 } from "@/lib/visual-assist/route-assist/imageRegistration";
import { drawRouteAssistProjectiveFrameV1, loadRouteAssistImageV1 } from "@/lib/visual-assist/route-assist/projectiveRenderer";
import { landmarksToCorrespondencesV1, type RouteAssistLandmarkProposalV1 } from "@/lib/visual-assist/route-assist/frameRegistrationAiGateway";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";
import type { RouteAssistVisibleSceneSemanticsV1 } from "@/lib/visual-assist/route-assist/visualSceneSemantics";

/**
 * GOVERNING CAPTURE UX (product correction, this pass): Capture -> Ghost-
 * edge guide -> Alignment lock -> Capture -> Mini stitched preview ->
 * Repeat -> Final stitched workspace -> Device placement. Copy/visual
 * treatment (the "Match this ghost edge" / green "Aligned" badges,
 * direction arrow+text, "N views captured" progress caption) follows the
 * homeowner's reference storyboard ("Smart Panorama Capture"), while
 * keeping Route Assist's own OPEN-ENDED two-button completion question
 * ("Looks good -- continue" / "Add another view") rather than the
 * storyboard's fixed 3-photo demo -- Route Assist does not know the total
 * photo count in advance, so there is no "N of 3" total to show, only a
 * running count.
 *
 * "Human gets the views close, software finishes exact alignment
 * afterward": everything in this file that drives the LIVE camera screen
 * (ghost-edge strip, direction guidance, the alignment lock state
 * machine, device-orientation sensors) is a HUMAN alignment aid only. The
 * moment a full-quality photo is captured, this file hands off to the
 * UNCHANGED real geometric registration pipeline
 * (imageRegistration.ts/stitchedWorkspace.ts) for the actual accept/
 * reject decision -- nothing about the live guidance ever determines
 * final placement.
 */

type Stage = "CAPTURE_FIRST" | "REVIEW" | "ALIGNMENT" | "PLACEMENT";

type CapturedFrameV1 = { imageId: string; dataUrl: string; width: number; height: number };

type OverlapAssessmentResponseV1 =
  | { matched: true; evidenceKind: string; confidence: number; overlapFraction: number; relativeDirection?: string }
  | { matched: false; confidence: number; overlapFraction: number };

const EVIDENCE_DESCRIPTION = "a visible wall corner, transition, doorway, window edge, or other stable architectural feature where the previous captured area left off";

const REGISTRATION_FAILURE_MESSAGE = "We couldn't connect that view. Try again while keeping a little more of the previous area visible.";

const BASE_PX_PER_UNIT = 300;
const MAX_VIEWPORT_PX = 340;

type MarkerTypeChoice = { value: RouteAssistDestinationType; label: string };
const MARKER_TYPE_CHOICES: MarkerTypeChoice[] = [
  { value: "RECEPTACLE", label: "Outlet" },
  { value: "SWITCH", label: "Switch" },
  { value: "WALL_LIGHT", label: "Wall light" },
  { value: "CEILING_LIGHT", label: "Ceiling light" },
];
const LIGHT_TYPES: ReadonlySet<RouteAssistDestinationType> = new Set(["WALL_LIGHT", "CEILING_LIGHT"]);

const DIRECTION_ARROW: Record<RouteAssistRelativeDirectionV1, string> = { RIGHT: "→", LEFT: "←", UP: "↑", DOWN: "↓" };
const DIRECTION_COPY: Record<RouteAssistRelativeDirectionV1, string> = { RIGHT: "Move right", LEFT: "Move left", UP: "Tilt up", DOWN: "Tilt down" };

function isRelativeDirectionV1(value: unknown): value is RouteAssistRelativeDirectionV1 {
  return typeof value === "string" && (ROUTE_ASSIST_RELATIVE_DIRECTIONS_V1 as readonly string[]).includes(value);
}

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

/** Crops (never resizes-distorts) a normalized [0,1] rectangle out of a captured photo -- used for the ghost-edge strip. Never the whole image. */
async function cropRouteAssistGhostStripV1(sourceDataUrl: string, rect: { x: number; y: number; width: number; height: number }, sourceWidth: number, sourceHeight: number): Promise<string> {
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
 * Photo 1: normal near-full-screen camera, manual shutter, NO ghost
 * overlay and no alignment UI of any kind -- there is nothing to align
 * against yet.
 */
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
 * Photo 2+: camera-first alignment mode. Opens automatically (the main
 * alignment screen is always camera-first, never a shrunk-camera-beside-
 * prior-photos layout). Shows ONLY a narrow ghost-edge strip once a
 * direction has resolved -- never the whole prior photo -- with badge/
 * direction copy styled after the reference storyboard. Auto-captures the
 * instant the alignment lock reports ALIGNED; the live guidance never
 * decides final placement itself (see the module doc comment).
 */
function RouteAssistAlignmentCameraV1({
  ghostStripUrl,
  ghostDisplayEdge,
  alignmentState,
  alignmentReason,
  resolvedDirection,
  probeIntervalMs = 700,
  onProbeFrame,
  onCaptured,
}: {
  ghostStripUrl: string | null;
  ghostDisplayEdge: RouteAssistRelativeDirectionV1 | null;
  alignmentState: RouteAssistAlignmentStateV1;
  alignmentReason: string;
  resolvedDirection: RouteAssistRelativeDirectionV1 | null;
  probeIntervalMs?: number;
  onProbeFrame: (downscaledDataUrl: string) => Promise<boolean>;
  onCaptured: (args: { dataUrl: string; width: number; height: number }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const probingRef = useRef(false);
  const capturedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    capturedRef.current = false;
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
    if (capturedRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    capturedRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    onCaptured({ dataUrl, width: canvas.width, height: canvas.height });
  }

  useEffect(() => {
    const interval = setInterval(async () => {
      if (probingRef.current || capturedRef.current) return;
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      probingRef.current = true;
      try {
        const downscaled = downscaledProbeFrame(video);
        if (!downscaled) return;
        const shouldCapture = await onProbeFrame(downscaled);
        if (shouldCapture) takePhoto();
      } finally {
        probingRef.current = false;
      }
    }, probeIntervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeIntervalMs]);

  const aligned = alignmentState === "ALIGNED";
  const ghostRect = ghostDisplayEdge ? ghostEdgeCropRectV1(ghostDisplayEdge) : null;

  return (
    <div className="relative overflow-hidden rounded-xl bg-black" data-testid="route-assist-alignment-camera">
      <video ref={videoRef} playsInline muted className="w-full" style={{ minHeight: 360 }} />
      {error && (
        <p className="absolute inset-x-0 top-0 bg-red-600/90 p-2 text-center text-xs text-white" data-testid="route-assist-camera-error">
          {error}
        </p>
      )}
      {ghostStripUrl && ghostRect && (
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
          {aligned ? "✓ Aligned" : "Match this ghost edge"}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-black/60 p-3">
        {resolvedDirection && !aligned && (
          <p className="text-sm font-semibold text-white" data-testid="route-assist-direction-hint">
            {DIRECTION_ARROW[resolvedDirection]} {DIRECTION_COPY[resolvedDirection]}
          </p>
        )}
        <p
          className={`text-sm font-semibold ${aligned ? "text-emerald-300" : alignmentState === "HOLD_STEADY" ? "text-amber-200" : "text-white"}`}
          data-testid="route-assist-alignment-reason"
        >
          {alignmentReason}
        </p>
      </div>
    </div>
  );
}

/**
 * RENDERING-CORRECTNESS: a frame's composed transformToWorkspace may or
 * may not be exactly representable as a 2D CSS affine matrix() -- see
 * isAffineRepresentableV1's own doc comment on why that must be checked
 * on the COMPOSED matrix, never on a single step's transformType. Affine-
 * representable frames render via the existing exact CSS path; anything
 * else (a HOMOGRAPHY step anywhere in this frame's ancestry) renders via
 * the true projective WebGL renderer below.
 */
function RouteAssistFrameLayerV1({
  frame,
  source,
  bounds,
  pxPerUnit,
  debug,
}: {
  frame: RouteAssistWorkspaceFrameRegistrationV1;
  source?: CapturedFrameV1;
  bounds: RouteAssistWorkspaceBoundsV1;
  pxPerUnit: number;
  debug?: boolean;
}) {
  const frameBounds = frameWorkspaceBoundsV1(frame);
  const left = (frameBounds.minX - bounds.minX) * pxPerUnit;
  const top = (frameBounds.minY - bounds.minY) * pxPerUnit;
  const widthPx = Math.max(1, (frameBounds.maxX - frameBounds.minX) * pxPerUnit);
  const heightPx = Math.max(1, (frameBounds.maxY - frameBounds.minY) * pxPerUnit);
  const registrationLabel = frame.registration.source === "GEOMETRIC_REGISTRATION" ? frame.registration.transformType : "FIRST";

  if (isAffineRepresentableV1(frame.transformToWorkspace)) {
    const p00 = frameLocalToWorkspaceV1(frame, { x: 0, y: 0 });
    const p10 = frameLocalToWorkspaceV1(frame, { x: 1, y: 0 });
    const p01 = frameLocalToWorkspaceV1(frame, { x: 0, y: 1 });
    const a = p10.wx - p00.wx;
    const b = p10.wy - p00.wy;
    const c = p01.wx - p00.wx;
    const d = p01.wy - p00.wy;
    const placementLeft = (p00.wx - bounds.minX) * pxPerUnit;
    const placementTop = (p00.wy - bounds.minY) * pxPerUnit;
    return (
      <div className="absolute" style={{ left: 0, top: 0, transformOrigin: "0 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source?.dataUrl}
          alt=""
          className="absolute object-contain"
          style={{ left: placementLeft, top: placementTop, width: pxPerUnit, height: pxPerUnit, transformOrigin: "0 0", transform: `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`, zIndex: frame.order }}
          data-testid={`route-assist-frame-css-${frame.imageId}`}
        />
        {debug && (
          <div
            className="absolute border-2 border-lime-400"
            style={{ left: placementLeft, top: placementTop, width: pxPerUnit, height: pxPerUnit, transformOrigin: "0 0", transform: `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`, zIndex: 2000 }}
          >
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-lime-300">
              #{frame.order} {registrationLabel} (CSS affine)
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <RouteAssistProjectiveFrameV1
      frameImageId={frame.imageId}
      sourceDataUrl={source?.dataUrl}
      transformFromWorkspace={frame.transformFromWorkspace}
      bounds={frameBounds}
      left={left}
      top={top}
      widthPx={widthPx}
      heightPx={heightPx}
      order={frame.order}
      registrationLabel={registrationLabel}
      debug={debug}
    />
  );
}

/**
 * TRUE PROJECTIVE RENDERER for a HOMOGRAPHY-composed frame -- draws via
 * WebGL (projectiveRenderer.ts), never a CSS affine approximation. If
 * WebGL itself is genuinely unavailable, falls back to an un-warped
 * object-contain <img> as a last resort so the frame is never a black
 * screen -- exactness is only guaranteed when WebGL is available, which is
 * effectively every real phone browser this feature targets.
 */
function RouteAssistProjectiveFrameV1({
  frameImageId,
  sourceDataUrl,
  transformFromWorkspace,
  bounds,
  left,
  top,
  widthPx,
  heightPx,
  order,
  registrationLabel,
  debug,
}: {
  frameImageId: string;
  sourceDataUrl?: string;
  transformFromWorkspace: RouteAssistTransformMatrixV1;
  bounds: RouteAssistWorkspaceBoundsV1;
  left: number;
  top: number;
  widthPx: number;
  heightPx: number;
  order: number;
  registrationLabel: string;
  debug?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    if (!sourceDataUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const image = await loadRouteAssistImageV1(sourceDataUrl);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ok = drawRouteAssistProjectiveFrameV1({ canvas, image, transformFromWorkspace, bounds, widthPx, heightPx });
        setRenderFailed(!ok);
      } catch {
        if (!cancelled) setRenderFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceDataUrl, transformFromWorkspace, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, widthPx, heightPx]);

  return (
    <div className="absolute" style={{ left: 0, top: 0 }}>
      <canvas ref={canvasRef} className="absolute" style={{ left, top, width: widthPx, height: heightPx, zIndex: order }} data-testid={`route-assist-frame-projective-${frameImageId}`} />
      {renderFailed && sourceDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sourceDataUrl} alt="" className="absolute object-contain opacity-90" style={{ left, top, width: widthPx, height: heightPx, zIndex: order }} data-testid={`route-assist-frame-fallback-${frameImageId}`} />
      )}
      {debug && (
        <div className="absolute border-2 border-fuchsia-400" style={{ left, top, width: widthPx, height: heightPx, zIndex: 2000 }}>
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-fuchsia-300">
            #{order} {registrationLabel} (WebGL projective)
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Renders the CURRENT registered workspace as one connected composite --
 * the SAME component for the capture-review/mini-progress preview and for
 * later device placement (never a separate thumbnail/frame-tabs model).
 * markers/onPlaceMarker are omitted entirely during capture-review.
 */
function RouteAssistWorkspaceCanvasV1({
  workspace,
  frames,
  markers,
  selectedMarkerId,
  debug,
  onPlaceMarker,
  onSelectMarker,
}: {
  workspace: RouteAssistStitchedWorkspaceV1;
  frames: CapturedFrameV1[];
  markers?: RouteAssistWorkspaceMarkerV1[];
  selectedMarkerId?: string | null;
  debug?: boolean;
  onPlaceMarker?: (point: { wx: number; wy: number }) => void;
  onSelectMarker?: (markerId: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const overallBounds = workspaceOverallBoundsV1(workspace);
  if (!overallBounds) return null;
  const bounds = overallBounds; // a plain `const` capture so the nested function declarations below (hoisted, so TS can't narrow the original nullable binding through them) see a non-null type.
  const pxPerUnit = BASE_PX_PER_UNIT * zoom;

  function placeMarkerAtEvent(event: React.PointerEvent<HTMLDivElement>) {
    if (!onPlaceMarker) return;
    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left + container.scrollLeft;
    const localY = event.clientY - rect.top + container.scrollTop;
    onPlaceMarker({ wx: localX / pxPerUnit + bounds.minX, wy: localY / pxPerUnit + bounds.minY });
  }

  return (
    <div className="flex flex-col gap-2">
      <div onPointerDown={placeMarkerAtEvent} className="relative w-full overflow-auto rounded-xl bg-black" style={{ maxHeight: MAX_VIEWPORT_PX }} data-testid="route-assist-workspace-canvas">
        <div className="relative" style={{ width: (bounds.maxX - bounds.minX) * pxPerUnit, height: (bounds.maxY - bounds.minY) * pxPerUnit }}>
          {workspace.frames.map((frame) => {
            const source = frames.find((candidate) => candidate.imageId === frame.imageId);
            return <RouteAssistFrameLayerV1 key={frame.imageId} frame={frame} source={source} bounds={bounds} pxPerUnit={pxPerUnit} debug={debug} />;
          })}
          {markers?.map((marker) => (
            <button
              key={marker.id}
              type="button"
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelectMarker?.(marker.id);
              }}
              data-testid={`route-assist-marker-${marker.label}`}
              className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${marker.role === "SOURCE" ? "bg-blue-600" : "bg-emerald-600"} ${marker.id === selectedMarkerId ? "ring-2 ring-offset-2 ring-blue-300" : ""}`}
              style={{ left: (marker.wx - bounds.minX) * pxPerUnit, top: (marker.wy - bounds.minY) * pxPerUnit, zIndex: 3000 }}
            >
              {marker.label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-500">
        Zoom
        <input type="range" min={0.5} max={2} step={0.1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="flex-1" data-testid="route-assist-workspace-zoom" />
      </label>
      {debug && (
        <ul className="flex flex-col gap-1 rounded-xl border border-lime-300 bg-black/5 p-2 text-[11px] text-slate-700" data-testid="route-assist-debug-panel">
          {workspace.frames.map((frame) => (
            <li key={frame.imageId}>
              #{frame.order} {frame.imageId} —{" "}
              {frame.registration.source === "FIRST_FRAME"
                ? "reference frame"
                : `${frame.registration.transformType}, ${frame.registration.inlierCount}/${frame.registration.candidateCount} inliers, mean error ${frame.registration.meanReprojectionError.toFixed(4)}, ${isAffineRepresentableV1(frame.transformToWorkspace) ? "CSS affine" : "WebGL projective"}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Last capture attempt's registration diagnostics -- dev-only, hidden from normal homeowner UI (see the debug panel below). */
type RouteAssistCaptureDebugInfoV1 =
  | { outcome: "REGISTERED"; registration: RouteAssistRegistrationResultV1 & { outcome: "REGISTERED" }; candidateLandmarks: RouteAssistLandmarkProposalV1[] }
  | { outcome: "REJECTED"; reason: string; registration: RouteAssistRegistrationResultV1 | null; candidateLandmarks: RouteAssistLandmarkProposalV1[] }
  | { outcome: "PROPOSAL_FAILED" | "ERROR"; reason: string };

function RouteAssistCaptureDebugPanelV1({ info }: { info: RouteAssistCaptureDebugInfoV1 | null }) {
  if (!info) return null;
  return (
    <div className="rounded-xl border border-fuchsia-300 bg-black/5 p-2 text-[11px] text-slate-700" data-testid="route-assist-capture-debug-panel">
      <p className="font-semibold text-fuchsia-700">Last capture attempt</p>
      {info.outcome === "REGISTERED" && (
        <ul className="mt-1 flex flex-col gap-0.5">
          <li>outcome: REGISTERED</li>
          <li>transform type: {info.registration.transformType}</li>
          <li>candidate matches: {info.registration.candidateCount}</li>
          <li>inlier count: {info.registration.inlierCount}</li>
          <li>inlier ratio: {(info.registration.inlierCount / Math.max(1, info.registration.candidateCount)).toFixed(2)}</li>
          <li>mean reprojection error: {info.registration.meanReprojectionError.toFixed(4)}</li>
          <li>final transform: [{info.registration.matrix.map((value) => value.toFixed(3)).join(", ")}]</li>
        </ul>
      )}
      {info.outcome === "REJECTED" && (
        <ul className="mt-1 flex flex-col gap-0.5">
          <li>outcome: REJECTED</li>
          <li>reason: {info.reason}</li>
          <li>candidate landmark pairs: {info.candidateLandmarks.length}</li>
          {info.registration?.outcome === "REJECTED" && (
            <>
              <li>best inlier count reached: {info.registration.bestInlierCount}</li>
              <li>best reprojection error reached: {info.registration.bestReprojectionError?.toFixed(4) ?? "n/a"}</li>
            </>
          )}
        </ul>
      )}
      {(info.outcome === "PROPOSAL_FAILED" || info.outcome === "ERROR") && (
        <ul className="mt-1 flex flex-col gap-0.5">
          <li>outcome: {info.outcome}</li>
          <li>reason: {info.reason}</li>
        </ul>
      )}
    </div>
  );
}

export default function RouteAssistGuidedContinuationPreviewClient() {
  const [stage, setStage] = useState<Stage>("CAPTURE_FIRST");
  const [workspace, setWorkspace] = useState<RouteAssistStitchedWorkspaceV1>(emptyRouteAssistStitchedWorkspaceV1());
  const [frames, setFrames] = useState<CapturedFrameV1[]>([]);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [progressCaption, setProgressCaption] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<RouteAssistCaptureDebugInfoV1 | null>(null);

  // Alignment-lock UI state (ALIGNMENT stage only).
  const [alignmentState, setAlignmentState] = useState<RouteAssistAlignmentStateV1>("SEARCHING");
  const [alignmentReason, setAlignmentReason] = useState<string>("Move toward the rest of the work area.");
  const [resolvedDirection, setResolvedDirection] = useState<RouteAssistRelativeDirectionV1 | null>(null);
  const [ghostStripUrl, setGhostStripUrl] = useState<string | null>(null);
  const [sensorStatus, setSensorStatus] = useState<"UNREQUESTED" | "GRANTED" | "UNAVAILABLE">("UNREQUESTED");

  const lockStateRef = useRef<RouteAssistAlignmentLockStateV1>(initialRouteAssistAlignmentLockStateV1());
  const resolvedDirectionRef = useRef<RouteAssistRelativeDirectionV1 | null>(null);
  const orientationReferenceRef = useRef<RouteAssistOrientationSampleV1 | null>(null);
  const orientationCurrentRef = useRef<RouteAssistOrientationSampleV1 | null>(null);
  const orientationRecentRef = useRef<RouteAssistOrientationSampleV1[]>([]);
  const orientationListenerAttachedRef = useRef(false);
  const handleOrientationEventRef = useRef((event: DeviceOrientationEvent) => {
    if (event.alpha == null || event.beta == null || event.gamma == null) return;
    const sample: RouteAssistOrientationSampleV1 = { alpha: event.alpha, beta: event.beta, gamma: event.gamma, atMs: Date.now() };
    if (!orientationReferenceRef.current) orientationReferenceRef.current = sample;
    orientationCurrentRef.current = sample;
    orientationRecentRef.current = [...orientationRecentRef.current, sample].slice(-6);
  });

  useEffect(
    () => () => {
      if (orientationListenerAttachedRef.current && typeof window !== "undefined") {
        window.removeEventListener("deviceorientation", handleOrientationEventRef.current);
      }
    },
    [],
  );

  const [markers, setMarkers] = useState<RouteAssistWorkspaceMarkerV1[]>([]);
  const [pendingMarkerType, setPendingMarkerType] = useState<RouteAssistDestinationType>("RECEPTACLE");
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const [evaluating, setEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [legResults, setLegResults] = useState<Record<string, RouteAssistWorkspaceLegEvaluationV1>>({});

  function handleFirstPhoto(args: { dataUrl: string; width: number; height: number }) {
    const imageId = `frame-${Date.now()}`;
    const added = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId, aspectRatio: args.width / args.height });
    if (added.outcome !== "ADDED") return; // frame 1 never needs registration; this cannot actually happen
    setWorkspace(added.workspace);
    setFrames([{ imageId, dataUrl: args.dataUrl, width: args.width, height: args.height }]);
    setReviewNotice(null);
    setProgressCaption(null);
    setStage("REVIEW");
  }

  function finishCapture() {
    const result = markRouteAssistStitchedWorkspaceCompleteV1(workspace);
    if (result.outcome !== "MARKED_COMPLETE") return;
    setWorkspace(result.workspace);
    setStage("PLACEMENT");
  }

  /** Contextual permission request -- only ever called from here, i.e. the moment the homeowner chooses "Add another view." Never requested upfront or on mount. */
  async function ensureRouteAssistOrientationSensorV1() {
    if (orientationListenerAttachedRef.current || typeof window === "undefined") return;
    const OrientationEventCtor = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (!OrientationEventCtor) {
      setSensorStatus("UNAVAILABLE");
      return;
    }
    if (typeof OrientationEventCtor.requestPermission === "function") {
      try {
        const result = await OrientationEventCtor.requestPermission();
        if (result !== "granted") {
          setSensorStatus("UNAVAILABLE");
          return;
        }
      } catch {
        setSensorStatus("UNAVAILABLE");
        return;
      }
    }
    window.addEventListener("deviceorientation", handleOrientationEventRef.current);
    orientationListenerAttachedRef.current = true;
    setSensorStatus("GRANTED");
  }

  function startAlignment() {
    lockStateRef.current = initialRouteAssistAlignmentLockStateV1();
    resolvedDirectionRef.current = null;
    orientationReferenceRef.current = null;
    orientationCurrentRef.current = null;
    orientationRecentRef.current = [];
    setResolvedDirection(null);
    setGhostStripUrl(null);
    setAlignmentState("SEARCHING");
    setAlignmentReason("Move toward the rest of the work area.");
    setReviewNotice(null);
    setProgressCaption(null);
    setStage("ALIGNMENT");
    void ensureRouteAssistOrientationSensorV1();
  }

  // Ghost strip: crop the previous accepted photo's far edge (in the
  // resolved travel direction) the instant direction resolves -- never
  // the whole prior photo, never shown before direction is known.
  useEffect(() => {
    if (!resolvedDirection) {
      setGhostStripUrl(null);
      return;
    }
    const previousFrame = frames[frames.length - 1];
    if (!previousFrame) {
      setGhostStripUrl(null);
      return;
    }
    let cancelled = false;
    const rect = ghostEdgeCropRectV1(resolvedDirection);
    cropRouteAssistGhostStripV1(previousFrame.dataUrl, rect, previousFrame.width, previousFrame.height)
      .then((url) => {
        if (!cancelled) setGhostStripUrl(url);
      })
      .catch(() => {
        if (!cancelled) setGhostStripUrl(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedDirection]);

  /**
   * Fuses THIS probe's visual overlap/direction reading (the SAME per-
   * probe overlap AI call the prior pass used, unchanged) with the
   * assistive sensor signal into one alignment-lock advance. Returns
   * whether THIS probe should trigger capture -- the camera component
   * never decides that on its own.
   */
  async function handleAlignmentProbeFrame(downscaledDataUrl: string): Promise<boolean> {
    const previousFrame = frames[frames.length - 1];
    if (!previousFrame) return false;
    try {
      const response = await fetch("/api/dev-fixtures/route-assist-frame-overlap-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDataUrl: previousFrame.dataUrl, toDataUrl: downscaledDataUrl, evidenceDescription: EVIDENCE_DESCRIPTION }),
      });
      const body = (await response.json().catch(() => null)) as { assessment?: OverlapAssessmentResponseV1; error?: string; detail?: string } | null;
      if (!response.ok || !body?.assessment) {
        lockStateRef.current = initialRouteAssistAlignmentLockStateV1();
        setAlignmentState("SEARCHING");
        setAlignmentReason(body?.detail || body?.error || "We're having trouble reading the camera. Try again.");
        return false;
      }
      const assessment = body.assessment;
      const visualDirection = assessment.matched && isRelativeDirectionV1(assessment.relativeDirection) ? assessment.relativeDirection : null;

      const referenceSample = orientationReferenceRef.current;
      const currentSample = orientationCurrentRef.current;
      const sensorHint = referenceSample && currentSample ? deriveRouteAssistSensorDirectionHintV1({ referenceSample, currentSample }) : null;

      if (!resolvedDirectionRef.current) {
        const candidate = resolveRouteAssistContinuationDirectionV1({ visualDirection, sensorHint });
        if (candidate) {
          resolvedDirectionRef.current = candidate;
          setResolvedDirection(candidate);
        }
      }

      const sensorSignal = deriveRouteAssistSensorSignalV1({
        referenceSample,
        currentSample,
        recentSamples: orientationRecentRef.current,
        expectedDirection: resolvedDirectionRef.current,
      });

      const probe = {
        matched: assessment.matched,
        confidence: assessment.confidence,
        overlapFraction: assessment.matched ? assessment.overlapFraction : 0,
        sensor: sensorSignal,
      };
      const advance = advanceRouteAssistAlignmentLockV1({ previous: lockStateRef.current, probe, nowMs: Date.now() });
      lockStateRef.current = advance.lockState;
      setAlignmentState(advance.state);
      setAlignmentReason(advance.reason);
      return advance.shouldCapture;
    } catch (error) {
      lockStateRef.current = initialRouteAssistAlignmentLockStateV1();
      setAlignmentState("SEARCHING");
      setAlignmentReason(error instanceof Error ? error.message : "We couldn't reach the camera guidance service.");
      return false;
    }
  }

  /**
   * REGISTRATION REMAINS AUTHORITATIVE: the live alignment lock only
   * decided WHEN to take this photo. Whether it actually joins the
   * workspace is decided here, entirely by the unchanged real geometric
   * registration pipeline -- landmark proposal, then registerFrameV1's
   * robust consensus fit. A REJECTED/errored outcome leaves the existing
   * valid workspace completely untouched and returns to REVIEW with the
   * exact homeowner-facing retry copy the product direction specifies.
   */
  async function handleAlignmentCaptured(args: { dataUrl: string; width: number; height: number }) {
    const previousFrame = frames[frames.length - 1];
    if (!previousFrame) return;
    setRegistering(true);
    try {
      const response = await fetch("/api/dev-fixtures/route-assist-frame-registration-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDataUrl: previousFrame.dataUrl, toDataUrl: args.dataUrl }),
      });
      const body = (await response.json().catch(() => null)) as { landmarks?: RouteAssistLandmarkProposalV1[]; error?: string; detail?: string } | null;
      if (!response.ok || !body?.landmarks) {
        setDebugInfo({ outcome: "PROPOSAL_FAILED", reason: body?.detail || body?.error || "landmark proposal request failed" });
        setReviewNotice(REGISTRATION_FAILURE_MESSAGE);
        setStage("REVIEW");
        return;
      }
      const imageId = `frame-${Date.now()}`;
      const correspondences = landmarksToCorrespondencesV1(body.landmarks);
      const result = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId, aspectRatio: args.width / args.height, correspondencesFromPrevious: correspondences });
      if (result.outcome !== "ADDED") {
        setDebugInfo({ outcome: "REJECTED", reason: result.problem, registration: result.registration, candidateLandmarks: body.landmarks });
        setReviewNotice(REGISTRATION_FAILURE_MESSAGE);
        setStage("REVIEW");
        return;
      }
      setWorkspace(result.workspace);
      setFrames((existing) => {
        const next = [...existing, { imageId, dataUrl: args.dataUrl, width: args.width, height: args.height }];
        setProgressCaption(`${next.length} views captured`);
        return next;
      });
      setDebugInfo({ outcome: "REGISTERED", registration: result.registration, candidateLandmarks: body.landmarks });
      setReviewNotice(null);
      setStage("REVIEW");
    } catch (error) {
      setDebugInfo({ outcome: "ERROR", reason: error instanceof Error ? error.message : "unknown error" });
      setReviewNotice(REGISTRATION_FAILURE_MESSAGE);
      setStage("REVIEW");
    } finally {
      setRegistering(false);
    }
  }

  function placeMarker(point: { wx: number; wy: number }) {
    const next = placeRouteAssistWorkspaceMarkerV1(markers, point, pendingMarkerType);
    setMarkers(next);
    setSelectedMarkerId(next[next.length - 1].id);
  }

  function removeMarker(markerId: string) {
    setMarkers((prev) => removeRouteAssistWorkspaceMarkerV1(prev, markerId));
    setSelectedMarkerId(null);
  }

  async function evaluateRoute() {
    const legIntents = deriveRouteAssistWorkspaceLegIntentsV1(markers);
    if (legIntents.length === 0) return;
    setEvaluating(true);
    setEvaluationError(null);
    try {
      let store: RouteAssistFactStoreV1 = emptyRouteAssistFactStoreV1();
      const at = new Date().toISOString();
      for (const marker of markers) {
        const primaryFrame = primarySupportingFrameForWorkspacePointV1(workspace, marker);
        const local = primaryFrame ? workspaceToFrameLocalV1(primaryFrame, marker) : { x: 0.5, y: 0.5 };
        const result = writeRouteAssistFactV1(store, {
          type: marker.role === "SOURCE" ? "SOURCE_ANCHOR" : "DESTINATION_ANCHOR",
          scopeId: marker.label,
          value: { kind: "ANCHOR", point: { x: local.x, y: local.y, imageId: primaryFrame?.imageId ?? "" }, markerType: marker.markerType },
          evidenceImageIds: [],
          provenance: { source: "HOMEOWNER_PLACEMENT", at },
        });
        if (result.outcome === "WRITTEN") store = result.store;
      }

      const problems: string[] = [];
      const markerByLabel = new Map(markers.map((marker) => [marker.label, marker]));

      for (const intent of legIntents) {
        const sourceMarker = markerByLabel.get(intent.sourceLabel);
        const destinationMarker = markerByLabel.get(intent.destinationLabel);
        if (!sourceMarker || !destinationMarker) continue;
        const contributions = deriveRouteAssistWorkspaceLegFrameContributionsV1({ workspace, legScopeId: intent.legScopeId, sourceMarker, destinationMarker });
        for (const contribution of contributions) {
          const frame = frames.find((candidate) => candidate.imageId === contribution.imageId);
          if (!frame) continue;
          const response = await fetch("/api/dev-fixtures/route-assist-workspace-interpret", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageId: frame.imageId,
              dataUrl: frame.dataUrl,
              sourceAnchor: contribution.sourceLocal,
              destinationAnchor: contribution.destinationLocal,
              sourceLabel: intent.sourceLabel,
              destinationLabel: intent.destinationLabel,
              destinationType: destinationMarker.markerType,
              legScopeId: contribution.legScopeId,
            }),
          });
          const body = (await response.json().catch(() => null)) as { semantics?: RouteAssistVisibleSceneSemanticsV1; error?: string } | null;
          if (!response.ok || !body?.semantics) {
            problems.push(body?.error ?? `Route Assist could not interpret frame ${frame.imageId} for leg ${intent.legScopeId}.`);
            continue;
          }
          const application = applyRouteAssistLiveVisibleSceneFactsV1({
            store,
            semantics: body.semantics,
            legScopeId: contribution.legScopeId,
            sourcePointId: intent.sourceLabel,
            destinationPointId: intent.destinationLabel,
            imageId: frame.imageId,
            sourceAnchor: contribution.sourceLocal,
            destinationAnchor: contribution.destinationLocal,
            providerKey: "price2book.route-assist.stitched-workspace-preview.v1",
          });
          store = application.store;
          for (const problem of application.problems) {
            if (!problem.startsWith("ANCHOR_OBJECT_MATCH:")) problems.push(problem);
          }
        }

        setLegResults((prev) => ({
          ...prev,
          [intent.destinationLabel]: evaluateRouteAssistWorkspaceLegV1({
            workspace,
            store,
            legScopeId: intent.legScopeId,
            sourceScopeId: intent.sourceLabel,
            destinationScopeId: intent.destinationLabel,
            sourceMarker,
            destinationMarker,
          }),
        }));
      }
      if (problems.length) setEvaluationError(problems.join("; "));
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : "Route Assist could not evaluate the placed route.");
    } finally {
      setEvaluating(false);
    }
  }

  const selectedMarker = markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const { role: nextRole, label: nextLabel } = nextRouteAssistWorkspaceMarkerLabelV1(markers);
  const switchMarkers = markers.filter((marker) => marker.markerType === "SWITCH");
  const legIntents = deriveRouteAssistWorkspaceLegIntentsV1(markers);
  const ghostDisplayEdge = useMemo(() => (resolvedDirection ? ghostEdgeDisplayEdgeV1(resolvedDirection) : null), [resolvedDirection]);

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-electric">Price2Book</p>
            <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist</h1>
          </div>
          <label className="flex items-center gap-1 text-[11px] text-slate-400">
            <input type="checkbox" checked={debugMode} onChange={(event) => setDebugMode(event.target.checked)} data-testid="route-assist-debug-toggle" />
            debug
          </label>
        </header>

        {stage === "CAPTURE_FIRST" && (
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="route-assist-capture-stage">
            <p className="text-sm text-slate-700">Take one wide photo showing as much of the work area as possible.</p>
            <RouteAssistFirstCaptureV1 onCaptured={handleFirstPhoto} />
          </div>
        )}

        {stage === "REVIEW" && (
          <div className="flex flex-col gap-4" data-testid="route-assist-review-stage">
            <h2 className="text-lg font-semibold text-navy">Here's the area we captured</h2>
            <RouteAssistWorkspaceCanvasV1 workspace={workspace} frames={frames} debug={debugMode} />
            {progressCaption && (
              <p className="text-sm font-medium text-electric" data-testid="route-assist-progress-caption">
                {progressCaption}
              </p>
            )}
            {reviewNotice && (
              <p className="text-sm text-amber-700" data-testid="route-assist-review-notice">
                {reviewNotice}
              </p>
            )}
            <p className="text-sm text-slate-700" data-testid="route-assist-review-question">
              Does this show the entire work area?
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={finishCapture} className="flex-1 rounded-xl bg-electric px-4 py-3 text-sm font-semibold text-white" data-testid="route-assist-review-looks-good">
                Looks good — continue
              </button>
              <button type="button" onClick={startAlignment} className="flex-1 rounded-xl border border-electric px-4 py-3 text-sm font-semibold text-electric" data-testid="route-assist-review-add-view">
                Add another view
              </button>
            </div>
            {debugMode && <RouteAssistCaptureDebugPanelV1 info={debugInfo} />}
          </div>
        )}

        {stage === "ALIGNMENT" && (
          <div className="flex flex-col gap-3" data-testid="route-assist-alignment-panel">
            {!resolvedDirection && (
              <p className="text-sm text-slate-700" data-testid="route-assist-alignment-generic-guidance">
                Slowly pan toward the rest of the work area. We'll show a ghost edge to match once we can tell which way you're moving.
              </p>
            )}
            <RouteAssistAlignmentCameraV1
              ghostStripUrl={ghostStripUrl}
              ghostDisplayEdge={ghostDisplayEdge}
              alignmentState={alignmentState}
              alignmentReason={alignmentReason}
              resolvedDirection={resolvedDirection}
              onProbeFrame={handleAlignmentProbeFrame}
              onCaptured={handleAlignmentCaptured}
            />
            {registering && (
              <p className="text-sm text-slate-500" data-testid="route-assist-registering">
                Lining up the new photo…
              </p>
            )}
            {debugMode && (
              <p className="text-[11px] text-slate-400" data-testid="route-assist-sensor-status">
                sensors: {sensorStatus.toLowerCase()}
              </p>
            )}
          </div>
        )}

        {stage === "PLACEMENT" && (
          <div className="flex flex-col gap-4" data-testid="route-assist-placement-stage">
            <p className="text-xs text-slate-500">Tap the captured area to place a device.</p>

            <div className="flex flex-wrap gap-2">
              {MARKER_TYPE_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => (selectedMarker ? setMarkers((prev) => setRouteAssistWorkspaceMarkerTypeV1(prev, selectedMarker.id, choice.value)) : setPendingMarkerType(choice.value))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${(selectedMarker ? selectedMarker.markerType : pendingMarkerType) === choice.value ? "border-electric bg-electric/10 text-electric" : "border-slate-200 text-slate-600"}`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Tap the workspace to place {nextRole === "SOURCE" ? "the existing source (A)" : `the next device (${nextLabel})`}.
            </p>

            <RouteAssistWorkspaceCanvasV1
              workspace={workspace}
              frames={frames}
              markers={markers}
              selectedMarkerId={selectedMarkerId}
              debug={debugMode}
              onPlaceMarker={placeMarker}
              onSelectMarker={setSelectedMarkerId}
            />

            {selectedMarker && (
              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{selectedMarker.label} — {selectedMarker.markerType}</span>
                  <button type="button" onClick={() => removeMarker(selectedMarker.id)} className="text-red-600">Remove</button>
                </div>
                {LIGHT_TYPES.has(selectedMarker.markerType) && (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    Controlled by:
                    <select
                      value={selectedMarker.controlledBySwitchLabel ?? ""}
                      onChange={(event) => setMarkers((prev) => setRouteAssistWorkspaceMarkerControllingSwitchV1(prev, selectedMarker.id, event.target.value || null))}
                      className="rounded border border-slate-200 px-2 py-1"
                    >
                      <option value="">None (direct from source)</option>
                      {switchMarkers.filter((sw) => sw.label !== selectedMarker.label).map((sw) => (
                        <option key={sw.label} value={sw.label}>{sw.label} (switch)</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            <ul className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600" data-testid="route-assist-route-intent">
              <li className="font-semibold text-navy">Route intent</li>
              {legIntents.length === 0 && <li>Place a source and at least one destination.</li>}
              {legIntents.map((intent) => (
                <li key={intent.destinationLabel}>
                  {intent.sourceLabel} → {intent.destinationLabel}
                  {intent.isDownstreamOfSwitch ? " (downstream of switch)" : ""}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={evaluateRoute}
              disabled={evaluating || legIntents.length === 0}
              className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              data-testid="route-assist-evaluate-route"
            >
              {evaluating ? "Evaluating…" : "Evaluate route"}
            </button>

            {evaluationError && <p className="text-sm text-red-600" data-testid="route-assist-evaluation-error">{evaluationError}</p>}

            <ul className="flex flex-col gap-2 text-sm" data-testid="route-assist-leg-results">
              {Object.entries(legResults).map(([label, evaluation]) => (
                <li key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="font-semibold text-navy">→ {label}</p>
                  {evaluation.outcome === "EVALUATED" ? (
                    <>
                      <p>{evaluation.result.escalation} <span className="text-xs text-slate-400">({evaluation.supportPathKind})</span></p>
                      <p className="text-xs text-slate-500">{evaluation.result.reason}</p>
                    </>
                  ) : (
                    <p>{evaluation.outcome}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
