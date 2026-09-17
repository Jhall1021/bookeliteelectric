"use client";

import { useEffect, useRef, useState } from "react";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "@/lib/visual-assist/route-assist/factModel";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "@/lib/visual-assist/route-assist/livePhotoFactAdapter";
import {
  addRouteAssistStitchedWorkspaceFrameV1,
  deriveRouteAssistWorkspaceLegFrameContributionsV1,
  deriveRouteAssistWorkspaceLegIntentsV1,
  emptyRouteAssistStitchedWorkspaceV1,
  evaluateRouteAssistWorkspaceLegV1,
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
  type RouteAssistWorkspaceLegEvaluationV1,
  type RouteAssistWorkspaceMarkerV1,
} from "@/lib/visual-assist/route-assist/stitchedWorkspace";
import { evaluateRouteAssistContinuationGuidanceV1, type RouteAssistFrameOverlapEvidenceKindV1 } from "@/lib/visual-assist/route-assist/frameContinuation";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";
import type { RouteAssistVisibleSceneSemanticsV1 } from "@/lib/visual-assist/route-assist/visualSceneSemantics";

type Stage = "CAPTURE" | "WORKSPACE";
type CaptureStep = "AWAITING_FIRST_PHOTO" | "ASK_COMPLETE" | "GUIDED_CONTINUATION";

type CapturedFrameV1 = { imageId: string; dataUrl: string; width: number; height: number; order: number };

type OverlapAssessmentResponseV1 =
  | { matched: true; evidenceKind: RouteAssistFrameOverlapEvidenceKindV1; confidence: number; overlapFraction: number }
  | { matched: false; confidence: number; overlapFraction: number };

const EVIDENCE_DESCRIPTION = "a visible wall corner, transition, doorway, window edge, or other stable architectural feature where the previous captured area left off";

const PX_PER_UNIT = 380;
const CANVAS_HEIGHT_PX = 280;

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

type ProbeGuidanceStateV1 = "MOVE_BACK" | "KEEP_MOVING" | "READY_TO_CAPTURE";

/**
 * A single camera capture control used for every frame in this proof.
 * mode="SIMPLE": one tap opens the camera, one tap takes the photo (frame 1).
 * mode="LIVE_PROBE": once open, repeatedly grabs a LOW-RATE, DOWNSCALED
 * probe frame (never full-resolution video) and hands it to onProbeFrame,
 * which classifies it (the guided-continuation stop rule) and returns the
 * state. On READY_TO_CAPTURE this component automatically takes ONE
 * full-quality photo and stops -- "capture automatically... hold still."
 */
function RouteAssistCameraCaptureV1({
  label,
  mode,
  probeIntervalMs = 2200,
  onCaptured,
  onProbeFrame,
}: {
  label: string;
  mode: "SIMPLE" | "LIVE_PROBE";
  probeIntervalMs?: number;
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
        const guidance = await onProbeFrame(downscaled);
        if (guidance === "READY_TO_CAPTURE") takePhoto();
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
      <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black" />
      {mode === "SIMPLE" && (
        <button type="button" onClick={takePhoto} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-workspace-take-photo">
          Take photo
        </button>
      )}
    </div>
  );
}

/**
 * Stitched-workspace dev preview (product correction: the homeowner never
 * places devices on individual capture frames).
 *
 *   1. CAPTURE: take frame 1. Ask "does this show the entire work area?"
 *      If no, a LIVE probe loop (frameOverlapAiGateway.ts's real AI
 *      Gateway call, low-rate/downscaled frames only) classifies the
 *      current view via frameContinuation.ts's stop rule
 *      (evaluateRouteAssistContinuationGuidanceV1): "move back" (overlap
 *      lost), "keep moving" (still redundant, no new coverage yet), or
 *      "connection found -- hold still" (both conditions satisfied), which
 *      auto-captures ONE full-quality frame and registers it into the
 *      workspace (stitchedWorkspace.ts's addRouteAssistStitchedWorkspaceFrameV1
 *      -- refuses anything that doesn't satisfy the same stop rule, never
 *      silently stitched). Repeat until "entire work area captured."
 *   2. WORKSPACE: exactly ONE connected canvas is displayed (a registered
 *      composite, not per-frame tabs) -- devices are placed directly on
 *      it, in workspace coordinates, with an explicit "controlled by
 *      switch" relationship for downstream lights. Evaluation runs only
 *      now, through evaluateRouteAssistWorkspaceLegV1 -- the capture/
 *      evaluation gate this whole flow is built around.
 */
export default function RouteAssistGuidedContinuationPreviewClient() {
  const [stage, setStage] = useState<Stage>("CAPTURE");
  const [captureStep, setCaptureStep] = useState<CaptureStep>("AWAITING_FIRST_PHOTO");
  const [workspace, setWorkspace] = useState<RouteAssistStitchedWorkspaceV1>(emptyRouteAssistStitchedWorkspaceV1());
  const [frames, setFrames] = useState<CapturedFrameV1[]>([]);
  const [guidanceText, setGuidanceText] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const lastProbeAssessmentRef = useRef<OverlapAssessmentResponseV1 | null>(null);

  const [markers, setMarkers] = useState<RouteAssistWorkspaceMarkerV1[]>([]);
  const [pendingMarkerType, setPendingMarkerType] = useState<RouteAssistDestinationType>("RECEPTACLE");
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const [evaluating, setEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [legResults, setLegResults] = useState<Record<string, RouteAssistWorkspaceLegEvaluationV1>>({});

  function handleFirstPhoto(args: { dataUrl: string; width: number; height: number }) {
    const imageId = `frame-${Date.now()}`;
    const added = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId });
    if (added.outcome !== "ADDED") return; // frame 1 never has an overlap requirement; this cannot actually happen
    setWorkspace(added.workspace);
    setFrames([{ imageId, dataUrl: args.dataUrl, width: args.width, height: args.height, order: 1 }]);
    setCaptureStep("ASK_COMPLETE");
  }

  function finishCapture() {
    const result = markRouteAssistStitchedWorkspaceCompleteV1(workspace);
    if (result.outcome !== "MARKED_COMPLETE") return;
    setWorkspace(result.workspace);
    setStage("WORKSPACE");
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
        setGuidanceText(body?.detail || body?.error || "Route Assist could not assess the current view.");
        return "MOVE_BACK";
      }
      lastProbeAssessmentRef.current = body.assessment;
      const guidance = evaluateRouteAssistContinuationGuidanceV1({ matched: body.assessment.matched, confidence: body.assessment.confidence, overlapFraction: body.assessment.overlapFraction });
      setGuidanceText(guidance.state === "READY_TO_CAPTURE" ? "Connection found — hold still." : guidance.reason);
      return guidance.state;
    } catch (error) {
      setGuidanceText(error instanceof Error ? error.message : "Route Assist could not reach the frame-overlap endpoint.");
      return "MOVE_BACK";
    }
  }

  function handleContinuationCaptured(args: { dataUrl: string; width: number; height: number }) {
    const previousFrame = frames[frames.length - 1];
    const assessment = lastProbeAssessmentRef.current;
    if (!previousFrame || !assessment) return;
    const imageId = `frame-${Date.now()}`;
    const candidate = assessment.matched
      ? { evidenceKind: assessment.evidenceKind, fromObjectId: "prior-continuation-anchor", toObjectId: "new-continuation-anchor", confidence: assessment.confidence, overlapFraction: assessment.overlapFraction }
      : undefined;
    const added = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId, overlapFromPrevious: candidate });
    if (added.outcome !== "ADDED") {
      setCaptureError(added.problem);
      return; // stays in GUIDED_CONTINUATION -- the live probe loop keeps running.
    }
    setWorkspace(added.workspace);
    setFrames((existing) => [...existing, { imageId, dataUrl: args.dataUrl, width: args.width, height: args.height, order: added.workspace.frames.length }]);
    setCaptureError(null);
    setGuidanceText(null);
    setCaptureStep("ASK_COMPLETE");
  }

  const bounds = workspaceOverallBoundsV1(workspace);

  function placeMarkerAtEvent(event: React.PointerEvent<HTMLDivElement>) {
    if (!bounds) return;
    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left + container.scrollLeft;
    const localY = event.clientY - rect.top;
    const wx = localX / PX_PER_UNIT + bounds.minX;
    const wy = localY / CANVAS_HEIGHT_PX;
    const next = placeRouteAssistWorkspaceMarkerV1(markers, { wx, wy }, pendingMarkerType);
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
          // A frame already interpreted for an EARLIER leg from the same
          // source/destination label legitimately re-reports "I see this
          // device here" -- that ANCHOR_OBJECT_MATCH is already locked and
          // this refusal is expected/harmless; every other fact this call
          // produced still applies. Anything else is surfaced.
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

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-electric">Price2Book</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist: one stitched workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate">
            Preview-only test harness. Captured photos are only evidence -- they register into ONE connected workspace.
            Devices are placed once, on that unified workspace, never on individual frames.
          </p>
        </header>

        {stage === "CAPTURE" && (
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="route-assist-capture-stage">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Captured frames: {frames.length}</p>

            {captureStep === "AWAITING_FIRST_PHOTO" && (
              <>
                <p className="text-sm text-slate-700">Take one wide photo showing as much of the work area as possible.</p>
                <RouteAssistCameraCaptureV1 label="Take first photo" mode="SIMPLE" onCaptured={handleFirstPhoto} />
              </>
            )}

            {captureStep === "ASK_COMPLETE" && (
              <>
                <p className="text-sm text-slate-700" data-testid="route-assist-capture-ask-complete">Does this show the entire work area?</p>
                <div className="flex gap-2">
                  <button type="button" onClick={finishCapture} className="flex-1 rounded-xl bg-electric px-4 py-3 text-sm font-semibold text-white" data-testid="route-assist-capture-complete">
                    Entire work area captured
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCaptureStep("GUIDED_CONTINUATION"); setGuidanceText(null); setCaptureError(null); }}
                    className="flex-1 rounded-xl border border-electric px-4 py-3 text-sm font-semibold text-electric"
                    data-testid="route-assist-capture-add-view"
                  >
                    Add another view
                  </button>
                </div>
              </>
            )}

            {captureStep === "GUIDED_CONTINUATION" && (
              <div className="flex flex-col gap-3" data-testid="route-assist-guided-continuation-panel">
                <p className="text-sm text-slate-700">
                  Slowly move toward the rest of the work area. Keep <span className="font-semibold">{EVIDENCE_DESCRIPTION}</span> visible. We’ll tell you when to stop.
                </p>
                <RouteAssistCameraCaptureV1 label="Open camera" mode="LIVE_PROBE" onCaptured={handleContinuationCaptured} onProbeFrame={handleProbeFrame} />
                {guidanceText && <p className="text-sm text-amber-700" data-testid="route-assist-live-guidance">{guidanceText}</p>}
                {captureError && <p className="text-sm text-red-600" data-testid="route-assist-capture-error">{captureError}</p>}
              </div>
            )}
          </div>
        )}

        {stage === "WORKSPACE" && bounds && (
          <div className="flex flex-col gap-4" data-testid="route-assist-workspace-stage">
            <p className="text-xs text-slate-500">
              One connected workspace from {frames.length} frame{frames.length === 1 ? "" : "s"}. Pan to see the whole area; tap to place a device.
            </p>

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

            <div
              onPointerDown={placeMarkerAtEvent}
              className="relative w-full overflow-x-auto overflow-y-hidden rounded-xl bg-black"
              style={{ height: CANVAS_HEIGHT_PX }}
              data-testid="route-assist-workspace-canvas"
            >
              <div className="relative" style={{ width: (bounds.maxX - bounds.minX) * PX_PER_UNIT, height: CANVAS_HEIGHT_PX }}>
                {workspace.frames.map((frame) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={frame.imageId}
                    src={frames.find((candidate) => candidate.imageId === frame.imageId)?.dataUrl}
                    alt={`Frame ${frame.order}`}
                    className="absolute top-0 h-full object-cover"
                    style={{ left: (frame.transform.originX - bounds.minX) * PX_PER_UNIT, width: frame.transform.scale * PX_PER_UNIT, zIndex: frame.order }}
                  />
                ))}
                {markers.map((marker) => (
                  <button
                    key={marker.id}
                    type="button"
                    onPointerDown={(event) => { event.stopPropagation(); setSelectedMarkerId(marker.id); }}
                    data-testid={`route-assist-marker-${marker.label}`}
                    className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${marker.role === "SOURCE" ? "bg-blue-600" : "bg-emerald-600"} ${marker.id === selectedMarkerId ? "ring-2 ring-offset-2 ring-blue-300" : ""}`}
                    style={{ left: (marker.wx - bounds.minX) * PX_PER_UNIT, top: marker.wy * CANVAS_HEIGHT_PX, zIndex: 1000 }}
                  >
                    {marker.label}
                  </button>
                ))}
              </div>
            </div>

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
