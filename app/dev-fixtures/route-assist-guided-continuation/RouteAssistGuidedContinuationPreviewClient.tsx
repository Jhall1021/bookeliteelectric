"use client";

import { useEffect, useRef, useState } from "react";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "@/lib/visual-assist/route-assist/factModel";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "@/lib/visual-assist/route-assist/livePhotoFactAdapter";
import {
  addRouteAssistCaptureWorkspaceFrameV1,
  emptyRouteAssistCaptureWorkspaceV1,
  evaluateRouteAssistWorkspaceLegV1,
  frameOrderForImageV1,
  markRouteAssistCaptureWorkspaceCompleteV1,
  routeAssistFrameScopedLegIdV1,
  type RouteAssistCaptureWorkspaceV1,
  type RouteAssistWorkspaceLegEvaluationV1,
} from "@/lib/visual-assist/route-assist/captureWorkspace";
import { ROUTE_ASSIST_GUIDED_CONTINUATION_MAX_OVERLAP_ATTEMPTS_V1, type RouteAssistFrameOverlapObservationV1 } from "@/lib/visual-assist/route-assist/frameContinuation";
import {
  nextRouteAssistPhotoMarkerLabelV1,
  placeRouteAssistPhotoMarkerV1,
  removeRouteAssistPhotoMarkerV1,
  routeAssistPhotoMarkersToFactWritesV1,
  setRouteAssistPhotoMarkerTypeV1,
  type RouteAssistPhotoMarkerV1,
} from "@/lib/visual-assist/route-assist/photoMarkerState";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";
import type { RouteAssistVisibleSceneSemanticsV1 } from "@/lib/visual-assist/route-assist/visualSceneSemantics";

type Stage = "CAPTURE" | "PLACEMENT" | "EVALUATION";
type CaptureStep = "AWAITING_FIRST_PHOTO" | "ASK_COMPLETE" | "GUIDED_CONTINUATION";

type CapturedFrameV1 = { imageId: string; dataUrl: string; width: number; height: number; order: number };

type OverlapAssessmentResponseV1 =
  | { matched: true; evidenceKind: RouteAssistFrameOverlapObservationV1["evidenceKind"]; confidence: number }
  | { matched: false; confidence: number };

const EVIDENCE_DESCRIPTION = "a visible wall corner, transition, doorway, window edge, or other stable architectural feature where the previous photo left off";

type MarkerTypeChoice = { value: RouteAssistDestinationType; label: string };
const MARKER_TYPE_CHOICES: MarkerTypeChoice[] = [
  { value: "RECEPTACLE", label: "Outlet" },
  { value: "SWITCH", label: "Switch" },
  { value: "WALL_LIGHT", label: "Light / fixture" },
];

/**
 * A minimal, standalone camera capture used for EVERY frame in this proof
 * (frame 1 and every continuation frame alike) -- unlike the previous pass,
 * capture no longer bundles anchor placement at all, so there is no need for
 * RouteAssistPhotoCapture's marker-placement UI at this stage. Same
 * getUserMedia lifecycle discipline: the stream is only attached once the
 * <video> element has actually mounted.
 */
function RouteAssistCameraCaptureV1({ label, onCaptured }: { label: string; onCaptured: (args: { dataUrl: string; width: number; height: number }) => void }) {
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
      <button type="button" onClick={takePhoto} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-workspace-take-photo">
        Take photo
      </button>
    </div>
  );
}

function normalizedPoint(event: React.PointerEvent<HTMLElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
  return { x, y };
}

/**
 * Capture-the-work-area-first dev preview (product direction: separate
 * CAPTURE COMPLETENESS from ROUTE/LEG EVALUATION).
 *
 * Real-phone finding this replaces: placing anchors on the FIRST photo and
 * evaluating every leg against it immediately reported TARGETED_PHOTO_
 * REQUIRED for every destination not yet resolvable from that one photo --
 * before the homeowner had even finished telling Route Assist the work area
 * was fully captured. This page proves the corrected sequence instead:
 *
 *   1. CAPTURE: take frame 1. Ask "does this show the entire work area?"
 *      If no, guide a continuation photo (frameOverlapAiGateway.ts's real
 *      AI Gateway call, run through evaluateRouteAssistFrameOverlapV1),
 *      accept it into the workspace ONLY on a confident, structurally-tied
 *      overlap (captureWorkspace.ts's addRouteAssistCaptureWorkspaceFrameV1
 *      -- never silently stitched), and ask again. Repeat until the
 *      homeowner says "entire work area captured." No anchors exist yet at
 *      any point in this stage.
 *   2. PLACEMENT: once capture is marked complete, place A (source) and
 *      B/C/D/... (destinations) on ANY of the captured frames -- markers
 *      already carry their own imageId (photoMarkerState.ts), so this
 *      needed no new marker model.
 *   3. EVALUATION: only now, with workspace.captureComplete=true, each leg
 *      is evaluated via evaluateRouteAssistWorkspaceLegV1 -- same-frame legs
 *      delegate directly to the unchanged single-photo evaluator; cross-
 *      frame legs decompose into each endpoint frame's own local
 *      resolution, combined with the workspace's already-validated overlap
 *      links (see that function's own doc comment for the full rule).
 */
export default function RouteAssistGuidedContinuationPreviewClient() {
  const [stage, setStage] = useState<Stage>("CAPTURE");
  const [captureStep, setCaptureStep] = useState<CaptureStep>("AWAITING_FIRST_PHOTO");
  const [workspace, setWorkspace] = useState<RouteAssistCaptureWorkspaceV1>(emptyRouteAssistCaptureWorkspaceV1());
  const [frames, setFrames] = useState<CapturedFrameV1[]>([]);
  const [overlapChecking, setOverlapChecking] = useState(false);
  const [overlapError, setOverlapError] = useState<string | null>(null);
  const [lastAssessment, setLastAssessment] = useState<OverlapAssessmentResponseV1 | null>(null);
  const [failedAttemptsAtBoundary, setFailedAttemptsAtBoundary] = useState(0);

  const [markers, setMarkers] = useState<RouteAssistPhotoMarkerV1[]>([]);
  const [activeFrameImageId, setActiveFrameImageId] = useState<string | null>(null);
  const [pendingMarkerType, setPendingMarkerType] = useState<RouteAssistDestinationType>("RECEPTACLE");
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const [evaluating, setEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [legResults, setLegResults] = useState<Record<string, RouteAssistWorkspaceLegEvaluationV1>>({});

  function handleFirstPhoto(args: { dataUrl: string; width: number; height: number }) {
    const imageId = `frame-${Date.now()}`;
    const added = addRouteAssistCaptureWorkspaceFrameV1({ workspace, imageId });
    if (added.outcome !== "ADDED") return; // frame 1 never has an overlap requirement; this cannot actually happen
    setWorkspace(added.workspace);
    setFrames([{ imageId, dataUrl: args.dataUrl, width: args.width, height: args.height, order: 1 }]);
    setCaptureStep("ASK_COMPLETE");
  }

  function finishCapture() {
    const result = markRouteAssistCaptureWorkspaceCompleteV1(workspace);
    if (result.outcome !== "MARKED_COMPLETE") return;
    setWorkspace(result.workspace);
    setActiveFrameImageId(frames[0]?.imageId ?? null);
    setStage("PLACEMENT");
  }

  async function handleContinuationPhoto(args: { dataUrl: string; width: number; height: number }) {
    const previousFrame = frames[frames.length - 1];
    if (!previousFrame) return;
    setOverlapChecking(true);
    setOverlapError(null);
    setLastAssessment(null);
    try {
      const response = await fetch("/api/dev-fixtures/route-assist-frame-overlap-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDataUrl: previousFrame.dataUrl, toDataUrl: args.dataUrl, evidenceDescription: EVIDENCE_DESCRIPTION }),
      });
      const body = (await response.json().catch(() => null)) as { assessment?: OverlapAssessmentResponseV1; error?: string; detail?: string } | null;
      if (!response.ok || !body?.assessment) {
        setOverlapError(body?.detail || body?.error || "Route Assist could not assess frame overlap.");
        return;
      }
      setLastAssessment(body.assessment);
      const imageId = `frame-${Date.now()}`;
      const observation: RouteAssistFrameOverlapObservationV1 | undefined = body.assessment.matched
        ? { legScopeId: "unused", fromImageId: previousFrame.imageId, toImageId: imageId, evidenceKind: body.assessment.evidenceKind, fromObjectId: "prior-continuation-anchor", toObjectId: "new-continuation-anchor", confidence: body.assessment.confidence }
        : undefined;
      const added = addRouteAssistCaptureWorkspaceFrameV1({ workspace, imageId, overlapFromPrevious: observation });
      if (added.outcome !== "ADDED") {
        setFailedAttemptsAtBoundary((count) => count + 1);
        return; // stays in GUIDED_CONTINUATION -- ask for another attempt at the SAME boundary, never silently stitched.
      }
      setWorkspace(added.workspace);
      setFrames((existing) => [...existing, { imageId, dataUrl: args.dataUrl, width: args.width, height: args.height, order: added.workspace.frames.length }]);
      setFailedAttemptsAtBoundary(0);
      setCaptureStep("ASK_COMPLETE");
    } catch (error) {
      setOverlapError(error instanceof Error ? error.message : "Route Assist could not reach the frame-overlap endpoint.");
    } finally {
      setOverlapChecking(false);
    }
  }

  function placeMarker(event: React.PointerEvent<HTMLDivElement>) {
    if (!activeFrameImageId) return;
    const point = normalizedPoint(event);
    const next = placeRouteAssistPhotoMarkerV1(markers, { ...point, imageId: activeFrameImageId }, pendingMarkerType);
    setMarkers(next);
    setSelectedMarkerId(next[next.length - 1].id);
  }

  function removeMarker(markerId: string) {
    setMarkers((prev) => removeRouteAssistPhotoMarkerV1(prev, markerId));
    setSelectedMarkerId(null);
  }

  async function evaluateRoute() {
    const source = markers.find((marker) => marker.role === "SOURCE");
    const destinations = markers.filter((marker) => marker.role === "DESTINATION");
    if (!source || destinations.length === 0) return;

    setEvaluating(true);
    setEvaluationError(null);
    try {
      let store: RouteAssistFactStoreV1 = emptyRouteAssistFactStoreV1();
      for (const write of routeAssistPhotoMarkersToFactWritesV1(markers)) {
        const result = writeRouteAssistFactV1(store, write);
        if (result.outcome === "WRITTEN") store = result.store;
      }

      const interpretedFrameIds = new Set<string>();
      const problems: string[] = [];

      async function interpretFrame(args: { imageId: string; legScopeId: string; sourceAnchor: { x: number; y: number }; destinationAnchor: { x: number; y: number }; destinationLabel: string; destinationType: RouteAssistDestinationType }) {
        const frame = frames.find((candidate) => candidate.imageId === args.imageId);
        if (!frame) return;
        const response = await fetch("/api/dev-fixtures/route-assist-workspace-interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageId: frame.imageId,
            dataUrl: frame.dataUrl,
            sourceAnchor: args.sourceAnchor,
            destinationAnchor: args.destinationAnchor,
            destinationLabel: args.destinationLabel,
            destinationType: args.destinationType,
            legScopeId: args.legScopeId,
          }),
        });
        const body = (await response.json().catch(() => null)) as { semantics?: RouteAssistVisibleSceneSemanticsV1; error?: string; problems?: string[] } | null;
        if (!response.ok || !body?.semantics) {
          problems.push(body?.error ?? `Route Assist could not interpret frame ${frame.imageId} for leg ${args.legScopeId}.`);
          return;
        }
        const application = applyRouteAssistLiveVisibleSceneFactsV1({
          store,
          semantics: body.semantics,
          legScopeId: args.legScopeId,
          sourcePointId: "A",
          destinationPointId: args.destinationLabel,
          imageId: frame.imageId,
          sourceAnchor: args.sourceAnchor,
          destinationAnchor: args.destinationAnchor,
          providerKey: "price2book.route-assist.capture-workspace-preview.v1",
        });
        store = application.store;
        // A frame already interpreted for an EARLIER leg from the same
        // source point legitimately re-reports "I see A here" -- that
        // ANCHOR_OBJECT_MATCH is already locked from the first leg's own
        // apply and this refusal is expected/harmless (every OTHER fact in
        // this call still applies normally); anything else is surfaced.
        for (const problem of application.problems) {
          if (!problem.startsWith("ANCHOR_OBJECT_MATCH:")) problems.push(problem);
        }
      }

      const results: Record<string, RouteAssistWorkspaceLegEvaluationV1> = {};
      for (const destination of destinations) {
        const legScopeId = `leg-A-${destination.label}`;
        const sourceOrder = frameOrderForImageV1(workspace, source.imageId);
        const destinationOrder = frameOrderForImageV1(workspace, destination.imageId);
        if (sourceOrder === null || destinationOrder === null) continue;

        if (sourceOrder === destinationOrder) {
          const key = `${legScopeId}:${source.imageId}`;
          if (!interpretedFrameIds.has(key)) {
            interpretedFrameIds.add(key);
            await interpretFrame({ imageId: source.imageId, legScopeId, sourceAnchor: { x: source.x, y: source.y }, destinationAnchor: { x: destination.x, y: destination.y }, destinationLabel: destination.label, destinationType: destination.markerType });
          }
        } else {
          const sourceFrameId = sourceOrder < destinationOrder ? source.imageId : destination.imageId;
          const destinationFrameId = sourceOrder < destinationOrder ? destination.imageId : source.imageId;
          await interpretFrame({
            imageId: sourceFrameId,
            legScopeId: routeAssistFrameScopedLegIdV1(legScopeId, sourceFrameId),
            sourceAnchor: { x: source.x, y: source.y },
            destinationAnchor: { x: 1, y: source.y },
            destinationLabel: destination.label,
            destinationType: destination.markerType,
          });
          await interpretFrame({
            imageId: destinationFrameId,
            legScopeId: routeAssistFrameScopedLegIdV1(legScopeId, destinationFrameId),
            sourceAnchor: { x: 0, y: destination.y },
            destinationAnchor: { x: destination.x, y: destination.y },
            destinationLabel: destination.label,
            destinationType: destination.markerType,
          });
        }

        results[destination.label] = evaluateRouteAssistWorkspaceLegV1({
          workspace,
          store,
          legScopeId,
          sourceScopeId: "A",
          destinationScopeId: destination.label,
          sourceImageId: source.imageId,
          destinationImageId: destination.imageId,
        });
      }
      setLegResults(results);
      if (problems.length) setEvaluationError(problems.join("; "));
      setStage("EVALUATION");
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : "Route Assist could not evaluate the placed route.");
    } finally {
      setEvaluating(false);
    }
  }

  const activeFrame = frames.find((frame) => frame.imageId === activeFrameImageId) ?? null;
  const selectedMarker = markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const { role: nextRole, label: nextLabel } = nextRouteAssistPhotoMarkerLabelV1(markers);
  const attemptsRemaining = Math.max(0, ROUTE_ASSIST_GUIDED_CONTINUATION_MAX_OVERLAP_ATTEMPTS_V1 - failedAttemptsAtBoundary);

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-electric">Price2Book</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist: capture the work area first</h1>
          <p className="mt-2 text-sm leading-6 text-slate">
            Preview-only test harness. Capture is fully separate from anchor placement: photograph the whole work area
            first, then place the source and destinations across whichever frames they actually appear on.
          </p>
        </header>

        {stage === "CAPTURE" && (
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="route-assist-capture-stage">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Captured frames: {frames.length}
            </p>

            {captureStep === "AWAITING_FIRST_PHOTO" && (
              <>
                <p className="text-sm text-slate-700">Take one wide photo showing as much of the work area as possible.</p>
                <RouteAssistCameraCaptureV1 label="Take first photo" onCaptured={handleFirstPhoto} />
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
                    onClick={() => { setCaptureStep("GUIDED_CONTINUATION"); setLastAssessment(null); setOverlapError(null); }}
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
                  Slowly move your phone toward the rest of the work area. Keep{" "}
                  <span className="font-semibold">{EVIDENCE_DESCRIPTION}</span> visible. We’ll tell you when to stop.
                </p>
                <RouteAssistCameraCaptureV1 label="Take continuation photo" onCaptured={handleContinuationPhoto} />
                {overlapChecking && <p className="text-sm text-slate-500">Checking for a connection…</p>}
                {lastAssessment && !lastAssessment.matched && (
                  <p className="text-sm text-amber-700" data-testid="route-assist-overlap-insufficient">
                    Insufficient overlap (confidence {lastAssessment.confidence.toFixed(2)}) — please try again, keeping more of the same view visible.
                    {attemptsRemaining <= 0 && " After repeated attempts, Route Assist would fall back to a full continuous sweep (not implemented in this proof)."}
                  </p>
                )}
                {overlapError && <p className="text-sm text-red-600" data-testid="route-assist-overlap-error">{overlapError}</p>}
              </div>
            )}
          </div>
        )}

        {stage === "PLACEMENT" && (
          <div className="flex flex-col gap-4" data-testid="route-assist-placement-stage">
            <div className="flex gap-2 overflow-x-auto">
              {frames.map((frame) => (
                <button
                  key={frame.imageId}
                  type="button"
                  onClick={() => setActiveFrameImageId(frame.imageId)}
                  data-testid={`route-assist-frame-thumb-${frame.order}`}
                  className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 ${activeFrameImageId === frame.imageId ? "border-electric" : "border-slate-200"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frame.dataUrl} alt={`Frame ${frame.order}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {MARKER_TYPE_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => (selectedMarker ? setMarkers((prev) => setRouteAssistPhotoMarkerTypeV1(prev, selectedMarker.id, choice.value)) : setPendingMarkerType(choice.value))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${(selectedMarker ? selectedMarker.markerType : pendingMarkerType) === choice.value ? "border-electric bg-electric/10 text-electric" : "border-slate-200 text-slate-600"}`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Tap the active frame to place {nextRole === "SOURCE" ? "the existing source (A)" : `the next location (${nextLabel})`}.
            </p>

            {activeFrame && (
              <div
                onPointerDown={placeMarker}
                style={{ aspectRatio: `${activeFrame.width} / ${activeFrame.height}` }}
                className="relative w-full overflow-hidden rounded-xl bg-black"
                data-testid="route-assist-placement-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activeFrame.dataUrl} alt={`Frame ${activeFrame.order}`} className="pointer-events-none h-full w-full object-contain" />
                {markers.filter((marker) => marker.imageId === activeFrame.imageId).map((marker) => (
                  <button
                    key={marker.id}
                    type="button"
                    onPointerDown={(event) => { event.stopPropagation(); setSelectedMarkerId(marker.id); }}
                    data-testid={`route-assist-marker-${marker.label}`}
                    className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${marker.role === "SOURCE" ? "bg-blue-600" : "bg-emerald-600"} ${marker.id === selectedMarkerId ? "ring-2 ring-offset-2 ring-blue-300" : ""}`}
                    style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
                  >
                    {marker.label}
                  </button>
                ))}
              </div>
            )}

            {selectedMarker && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <span>{selectedMarker.label} — frame {frames.find((f) => f.imageId === selectedMarker.imageId)?.order}</span>
                <button type="button" onClick={() => removeMarker(selectedMarker.id)} className="text-red-600">Remove</button>
              </div>
            )}

            <ul className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600" data-testid="route-assist-frame-anchor-mapping">
              <li className="font-semibold text-navy">Ordered frame / anchor mapping</li>
              {frames.map((frame) => (
                <li key={frame.imageId}>
                  Frame {frame.order}: {markers.filter((marker) => marker.imageId === frame.imageId).map((marker) => marker.label).join(", ") || "no markers yet"}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={evaluateRoute}
              disabled={evaluating || !markers.some((marker) => marker.role === "SOURCE") || !markers.some((marker) => marker.role === "DESTINATION")}
              className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              data-testid="route-assist-evaluate-route"
            >
              {evaluating ? "Evaluating…" : "Evaluate route"}
            </button>
          </div>
        )}

        {stage === "EVALUATION" && (
          <div className="flex flex-col gap-4" data-testid="route-assist-evaluation-stage">
            <ul className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <li className="font-semibold text-navy">Ordered frame / anchor mapping</li>
              {frames.map((frame) => (
                <li key={frame.imageId}>
                  Frame {frame.order}: {markers.filter((marker) => marker.imageId === frame.imageId).map((marker) => marker.label).join(", ") || "no markers"}
                </li>
              ))}
            </ul>

            {evaluationError && <p className="text-sm text-red-600" data-testid="route-assist-evaluation-error">{evaluationError}</p>}

            <ul className="flex flex-col gap-2 text-sm" data-testid="route-assist-leg-results">
              {Object.entries(legResults).map(([label, evaluation]) => (
                <li key={label} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="font-semibold text-navy">A → {label}</p>
                  {evaluation.outcome === "EVALUATED" ? (
                    <>
                      <p>{evaluation.result.escalation}</p>
                      <p className="text-xs text-slate-500">{evaluation.result.reason}</p>
                    </>
                  ) : (
                    <p>{evaluation.outcome}</p>
                  )}
                </li>
              ))}
            </ul>

            <button type="button" onClick={() => setStage("PLACEMENT")} className="self-start rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
              Back to placement
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
