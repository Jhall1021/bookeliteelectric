"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "@/lib/visual-assist/route-assist/factModel";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "@/lib/visual-assist/route-assist/livePhotoFactAdapter";
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
  type RouteAssistStitchedWorkspaceAddFrameResultV1,
  type RouteAssistStitchedWorkspaceV1,
  type RouteAssistWorkspaceFrameRegistrationV1,
  type RouteAssistWorkspaceLegEvaluationV1,
  type RouteAssistWorkspaceMarkerV1,
} from "@/lib/visual-assist/route-assist/stitchedWorkspace";
import {
  advanceRouteAssistCaptureHoldV1,
  initialRouteAssistCaptureHoldStateV1,
  type RouteAssistCaptureHoldStateV1,
} from "@/lib/visual-assist/route-assist/frameContinuation";
import { landmarksToCorrespondencesV1, type RouteAssistLandmarkProposalV1 } from "@/lib/visual-assist/route-assist/frameRegistrationAiGateway";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";
import type { RouteAssistVisibleSceneSemanticsV1 } from "@/lib/visual-assist/route-assist/visualSceneSemantics";

type Stage = "CAPTURE_FIRST" | "REVIEW" | "GUIDED_CONTINUATION" | "PLACEMENT";

type CapturedFrameV1 = { imageId: string; dataUrl: string; width: number; height: number };

type OverlapAssessmentResponseV1 =
  | { matched: true; evidenceKind: string; confidence: number; overlapFraction: number; relativeDirection: string }
  | { matched: false; confidence: number; overlapFraction: number };

const EVIDENCE_DESCRIPTION = "a visible wall corner, transition, doorway, window edge, or other stable architectural feature where the previous captured area left off";

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

type ProbeGuidanceStateV1 = "MOVE_BACK" | "KEEP_MOVING" | "ALMOST_THERE" | "READY_TO_CAPTURE";

/**
 * A single camera capture control. mode="SIMPLE": one tap opens the
 * camera, one tap takes the photo (frame 1). mode="LIVE_PROBE": once open,
 * repeatedly grabs a LOW-RATE, DOWNSCALED probe frame (never full-
 * resolution video) and hands it to onProbeFrame, which runs the stop rule
 * AND the stable-hold requirement and reports whether THIS probe should
 * trigger capture. This governs only WHEN a full-quality photo is taken --
 * whether that photo can actually join the workspace is a completely
 * separate, later decision (real geometric registration), never made here.
 */
function RouteAssistCameraCaptureV1({
  label,
  mode,
  probeIntervalMs = 900,
  ghostImageUrl,
  guidance,
  onCaptured,
  onProbeFrame,
}: {
  label: string;
  mode: "SIMPLE" | "LIVE_PROBE";
  probeIntervalMs?: number;
  ghostImageUrl?: string | null;
  guidance?: { text: string; meterFraction: number | null; tone: "WARN" | "PROGRESS" | "GOOD"; direction: string | null } | null;
  onCaptured: (args: { dataUrl: string; width: number; height: number }) => void;
  onProbeFrame?: (downscaledDataUrl: string) => Promise<ProbeGuidanceStateV1>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const probingRef = useRef(false);
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
      setError("We couldn’t open the camera. Check camera permission and try again.");
    }
  }

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => setError("We couldn’t start the camera preview. Check camera permission and try again."));
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

  useEffect(() => {
    if (!open || mode !== "LIVE_PROBE" || !onProbeFrame) return;
    const interval = setInterval(async () => {
      if (probingRef.current) return;
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      probingRef.current = true;
      try {
        const downscaled = downscaledProbeFrame(video);
        if (!downscaled) return;
        const guidanceState = await onProbeFrame(downscaled);
        if (guidanceState === "READY_TO_CAPTURE") takePhoto();
      } finally {
        probingRef.current = false;
      }
    }, probeIntervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, probeIntervalMs]);

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="button" onClick={openCamera} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-workspace-open-camera">
          {label}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} playsInline muted className="w-full" />
        {mode === "LIVE_PROBE" && ghostImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ghostImageUrl} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-30" data-testid="route-assist-ghost-overlay" />
        )}
        {mode === "LIVE_PROBE" && guidance && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-black/60 p-3" data-testid="route-assist-live-guidance-overlay">
            <p className={`text-sm font-semibold ${guidance.tone === "GOOD" ? "text-emerald-300" : guidance.tone === "PROGRESS" ? "text-amber-200" : "text-white"}`}>{guidance.text}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div className={`h-full rounded-full ${guidance.tone === "GOOD" ? "bg-emerald-400" : "bg-amber-300"}`} style={{ width: `${Math.round((guidance.meterFraction ?? 0) * 100)}%` }} data-testid="route-assist-overlap-meter" />
            </div>
          </div>
        )}
      </div>
      {mode === "SIMPLE" && (
        <button type="button" onClick={takePhoto} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-workspace-take-photo">
          Take photo
        </button>
      )}
    </div>
  );
}

/**
 * Renders the CURRENT registered workspace as one connected composite --
 * the SAME component for the capture-review preview and for later device
 * placement (never a separate thumbnail/fake preview/frame-tabs model).
 * Each frame is rendered at its OWN full uncropped extent using its real
 * registered transform (an affine approximation derived from 3 of its 4
 * transformed corners -- exact for translation/similarity/affine, a close
 * approximation for the rare homography case, which is what "basic
 * blending is enough for the proof" and a visually acceptable seam allow).
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

  function cssTransformFor(frame: RouteAssistWorkspaceFrameRegistrationV1): { left: number; top: number; transform: string } {
    const p00 = frameLocalToWorkspaceV1(frame, { x: 0, y: 0 });
    const p10 = frameLocalToWorkspaceV1(frame, { x: 1, y: 0 });
    const p01 = frameLocalToWorkspaceV1(frame, { x: 0, y: 1 });
    const a = p10.wx - p00.wx;
    const b = p10.wy - p00.wy;
    const c = p01.wx - p00.wx;
    const d = p01.wy - p00.wy;
    return { left: (p00.wx - bounds.minX) * pxPerUnit, top: (p00.wy - bounds.minY) * pxPerUnit, transform: `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)` };
  }

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
            const placement = cssTransformFor(frame);
            return (
              <div key={frame.imageId} className="absolute" style={{ left: 0, top: 0, transformOrigin: "0 0" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={source?.dataUrl}
                  alt=""
                  className="absolute object-contain"
                  style={{ left: placement.left, top: placement.top, width: pxPerUnit, height: pxPerUnit, transformOrigin: "0 0", transform: placement.transform, zIndex: frame.order }}
                />
                {debug && (
                  <div
                    className="absolute border-2 border-lime-400"
                    style={{ left: placement.left, top: placement.top, width: pxPerUnit, height: pxPerUnit, transformOrigin: "0 0", transform: placement.transform, zIndex: 2000 }}
                  >
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-lime-300">
                      #{frame.order} {frame.registration.source === "GEOMETRIC_REGISTRATION" ? frame.registration.transformType : "FIRST"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {markers?.map((marker) => (
            <button
              key={marker.id}
              type="button"
              onPointerDown={(event) => { event.stopPropagation(); onSelectMarker?.(marker.id); }}
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
                : `${frame.registration.transformType}, ${frame.registration.inlierCount}/${frame.registration.candidateCount} inliers, mean error ${frame.registration.meanReprojectionError.toFixed(4)}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Stitched-workspace dev preview (product correction: capture-review must
 * SHOW the current workspace before ever asking whether capture is
 * complete, and placement geometry must come from real image registration,
 * not capture order / a semantic overlap-fraction guess).
 *
 *   1. CAPTURE_FIRST: take frame 1 (no registration needed -- it defines
 *      the workspace).
 *   2. REVIEW: "Here's the area we captured" -- the SAME
 *      RouteAssistWorkspaceCanvasV1 used later for placement, showing the
 *      full current composite, pannable/zoomable, before asking "Does
 *      this show the entire work area?" Never asked without this preview.
 *   3. GUIDED_CONTINUATION (only on "Add another view"): the unchanged
 *      live guidance/stable-hold loop decides WHEN a full-quality photo is
 *      taken. Once taken, a SEPARATE step calls the landmark-proposal AI
 *      (frameRegistrationAiGateway.ts) and runs the actual geometric
 *      registration (stitchedWorkspace.ts's addRouteAssistStitchedWorkspaceFrameV1
 *      -> imageRegistration.ts). Success updates the workspace and returns
 *      to REVIEW; REJECTED keeps the prior workspace completely unchanged,
 *      shows a homeowner-friendly retry message, and returns to REVIEW.
 *   4. PLACEMENT (only after "Looks good -- continue"): the SAME canvas,
 *      now with tap-to-place devices in workspace coordinates.
 *
 * A debug toggle (this dev fixture only) overlays frame outlines and
 * registration quality on the same canvas -- never shown by default.
 */
export default function RouteAssistGuidedContinuationPreviewClient() {
  const [stage, setStage] = useState<Stage>("CAPTURE_FIRST");
  const [workspace, setWorkspace] = useState<RouteAssistStitchedWorkspaceV1>(emptyRouteAssistStitchedWorkspaceV1());
  const [frames, setFrames] = useState<CapturedFrameV1[]>([]);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [liveGuidanceText, setLiveGuidanceText] = useState<string | null>(null);
  const [liveGuidanceTone, setLiveGuidanceTone] = useState<"WARN" | "PROGRESS" | "GOOD">("WARN");
  const [liveGuidanceMeter, setLiveGuidanceMeter] = useState<number | null>(null);
  const [registering, setRegistering] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const lastAssessmentRef = useRef<OverlapAssessmentResponseV1 | null>(null);
  const holdStateRef = useRef<RouteAssistCaptureHoldStateV1>(initialRouteAssistCaptureHoldStateV1());

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
    setStage("REVIEW");
  }

  function finishCapture() {
    const result = markRouteAssistStitchedWorkspaceCompleteV1(workspace);
    if (result.outcome !== "MARKED_COMPLETE") return;
    setWorkspace(result.workspace);
    setStage("PLACEMENT");
  }

  function startGuidedContinuation() {
    holdStateRef.current = initialRouteAssistCaptureHoldStateV1();
    lastAssessmentRef.current = null;
    setLiveGuidanceText(null);
    setReviewNotice(null);
    setStage("GUIDED_CONTINUATION");
  }

  async function handleProbeFrame(downscaledDataUrl: string): Promise<ProbeGuidanceStateV1> {
    const previousFrame = frames[frames.length - 1];
    if (!previousFrame) return "MOVE_BACK";
    try {
      const response = await fetch("/api/dev-fixtures/route-assist-frame-overlap-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDataUrl: previousFrame.dataUrl, toDataUrl: downscaledDataUrl, evidenceDescription: EVIDENCE_DESCRIPTION }),
      });
      const body = (await response.json().catch(() => null)) as { assessment?: OverlapAssessmentResponseV1; error?: string; detail?: string } | null;
      if (!response.ok || !body?.assessment) {
        setLiveGuidanceText(body?.detail || body?.error || "We’re having trouble reading the camera. Try again.");
        setLiveGuidanceTone("WARN");
        return "MOVE_BACK";
      }
      lastAssessmentRef.current = body.assessment;
      const advance = advanceRouteAssistCaptureHoldV1({ previous: holdStateRef.current, probe: body.assessment, nowMs: Date.now() });
      holdStateRef.current = advance.holdState;
      setLiveGuidanceText(advance.guidance === "MOVE_BACK" ? "Move back slightly." : advance.guidance === "KEEP_MOVING" ? "Keep moving." : advance.guidance === "ALMOST_THERE" ? "Almost there — hold steady." : "Perfect — hold still.");
      setLiveGuidanceTone(advance.guidance === "READY_TO_CAPTURE" ? "GOOD" : advance.guidance === "ALMOST_THERE" ? "PROGRESS" : "WARN");
      setLiveGuidanceMeter(advance.guidance === "MOVE_BACK" ? 0 : Math.min(1, body.assessment.overlapFraction / 0.88));
      return advance.guidance;
    } catch (error) {
      setLiveGuidanceText(error instanceof Error ? error.message : "We couldn’t reach the camera guidance service.");
      setLiveGuidanceTone("WARN");
      return "MOVE_BACK";
    }
  }

  async function handleContinuationCaptured(args: { dataUrl: string; width: number; height: number }) {
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
        setReviewNotice("We couldn’t line up that photo with the previous view. Move back slightly and try again.");
        setStage("REVIEW");
        return;
      }
      const imageId = `frame-${Date.now()}`;
      const correspondences = landmarksToCorrespondencesV1(body.landmarks);
      const result: RouteAssistStitchedWorkspaceAddFrameResultV1 = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId, aspectRatio: args.width / args.height, correspondencesFromPrevious: correspondences });
      if (result.outcome !== "ADDED") {
        setReviewNotice("We couldn’t line up that photo with the previous view. Move back slightly and try again.");
        setStage("REVIEW");
        return;
      }
      setWorkspace(result.workspace);
      setFrames((existing) => [...existing, { imageId, dataUrl: args.dataUrl, width: args.width, height: args.height }]);
      setReviewNotice(null);
      setStage("REVIEW");
    } catch (error) {
      setReviewNotice("We couldn’t line up that photo with the previous view. Move back slightly and try again.");
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
  const previousFrameForGhost = frames[frames.length - 1];
  const liveGuidance = useMemo(
    () => (liveGuidanceText ? { text: liveGuidanceText, meterFraction: liveGuidanceMeter, tone: liveGuidanceTone, direction: null } : null),
    [liveGuidanceText, liveGuidanceMeter, liveGuidanceTone],
  );

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
            <RouteAssistCameraCaptureV1 label="Take first photo" mode="SIMPLE" onCaptured={handleFirstPhoto} />
          </div>
        )}

        {stage === "REVIEW" && (
          <div className="flex flex-col gap-4" data-testid="route-assist-review-stage">
            <h2 className="text-lg font-semibold text-navy">Here’s the area we captured</h2>
            <RouteAssistWorkspaceCanvasV1 workspace={workspace} frames={frames} debug={debugMode} />
            {reviewNotice && <p className="text-sm text-amber-700" data-testid="route-assist-review-notice">{reviewNotice}</p>}
            <p className="text-sm text-slate-700" data-testid="route-assist-review-question">Does this show the entire work area?</p>
            <div className="flex gap-2">
              <button type="button" onClick={finishCapture} className="flex-1 rounded-xl bg-electric px-4 py-3 text-sm font-semibold text-white" data-testid="route-assist-review-looks-good">
                Looks good — continue
              </button>
              <button type="button" onClick={startGuidedContinuation} className="flex-1 rounded-xl border border-electric px-4 py-3 text-sm font-semibold text-electric" data-testid="route-assist-review-add-view">
                Add another view
              </button>
            </div>
          </div>
        )}

        {stage === "GUIDED_CONTINUATION" && (
          <div className="flex flex-col gap-3" data-testid="route-assist-guided-continuation-panel">
            <p className="text-sm text-slate-700">
              Slowly move toward the rest of the work area. Keep <span className="font-semibold">{EVIDENCE_DESCRIPTION}</span> visible. We’ll tell you when to stop.
            </p>
            <RouteAssistCameraCaptureV1
              label="Open camera"
              mode="LIVE_PROBE"
              ghostImageUrl={previousFrameForGhost?.dataUrl}
              guidance={liveGuidance}
              onCaptured={handleContinuationCaptured}
              onProbeFrame={handleProbeFrame}
            />
            {registering && <p className="text-sm text-slate-500" data-testid="route-assist-registering">Lining up the new photo…</p>}
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
