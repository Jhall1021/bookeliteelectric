"use client";

import { useEffect, useRef, useState } from "react";
import RouteAssistPhotoCapture, {
  type RouteAssistGuidedContinuationRequiredEventV1,
  type RouteAssistPhotoFirstOutcomeV1,
} from "@/components/route-assist/RouteAssistPhotoCapture";
import { evaluateRouteAssistFrameOverlapV1, type RouteAssistFrameOverlapObservationV1 } from "@/lib/visual-assist/route-assist/frameContinuation";

type CompletionEventV1 = { kind: "PHOTO_SUFFICIENT"; outcome: RouteAssistPhotoFirstOutcomeV1 } | { kind: "SWEEP_REQUIRED" };

type OverlapAssessmentResponseV1 =
  | { matched: true; evidenceKind: RouteAssistFrameOverlapObservationV1["evidenceKind"]; confidence: number }
  | { matched: false; confidence: number };

/** A minimal, standalone second camera capture -- deliberately NOT reusing RouteAssistPhotoCapture for frame 2, since this proof does not place a second set of homeowner markers (see the module doc comment below for why). Same getUserMedia lifecycle discipline as RouteAssistPhotoCapture.tsx: the stream is only attached once the <video> element has actually mounted. */
function ContinuationCameraCapture({ onCaptured }: { onCaptured: (dataUrl: string) => void }) {
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
    onCaptured(dataUrl);
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="button" onClick={openCamera} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-continuation-open-camera">
          Open camera for continuation photo
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black" />
      <button type="button" onClick={takePhoto} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-continuation-take">
        Take continuation photo
      </button>
    </div>
  );
}

/**
 * Thin client wrapper proving the guided-continuation architecture live:
 *
 *   1. Frame 1 is captured with the existing, unchanged RouteAssistPhotoCapture.
 *   2. When that leg resolves to GUIDED_CONTINUATION_REQUIRED, this page shows
 *      the guidance text and a second camera capture ("keep this area visible
 *      while moving toward the rest of the route").
 *   3. Frame 2 is sent, together with frame 1 and a short evidence
 *      description, to the new /api/dev-fixtures/route-assist-frame-overlap-
 *      interpret endpoint, which asks the AI Gateway whether frame 2 visibly
 *      shows the same physical feature frame 1 left off on.
 *   4. The response is run through evaluateRouteAssistFrameOverlapV1
 *      (frameContinuation.ts) exactly as production code would, and the
 *      result -- CONNECTED or UNRESOLVED -- is shown, proving "connection
 *      found, hold still" versus "insufficient overlap, try again" end to
 *      end on a real phone camera and a real model call.
 *
 * WHAT THIS PROOF DOES NOT DO: it does not place a second set of homeowner
 * source/destination markers on frame 2 or run frame 2 through
 * livePhotoFactAdapter.ts to decide whether the WHOLE route is now complete.
 * Doing that for a genuinely new continuation segment (rather than a
 * homeowner-placed leg) needs its own anchor/scope design -- exactly the
 * "architecture first, not production UX" boundary this pass was asked to
 * respect. What this proof DOES show live is the piece that is genuinely new
 * in this pass: capture -> anchor description -> capture -> overlap
 * accepted/rejected, using the real frameContinuation.ts rule.
 */
export default function RouteAssistGuidedContinuationPreviewClient() {
  const [completion, setCompletion] = useState<CompletionEventV1 | null>(null);
  const [continuation, setContinuation] = useState<RouteAssistGuidedContinuationRequiredEventV1 | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [overlapResult, setOverlapResult] = useState<{ assessment: OverlapAssessmentResponseV1; link: RouteAssistFrameOverlapObservationV1 | null; outcome: "CONNECTED" | "UNRESOLVED" } | null>(null);

  const evidenceDescription = "a visible wall corner or plane transition where the previous photo left off";

  async function handleContinuationPhoto(toDataUrl: string) {
    if (!continuation) return;
    setAssessing(true);
    setAssessError(null);
    setOverlapResult(null);
    try {
      const response = await fetch("/api/dev-fixtures/route-assist-frame-overlap-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDataUrl: continuation.photo.dataUrl, toDataUrl, evidenceDescription }),
      });
      const body = (await response.json().catch(() => null)) as { assessment?: OverlapAssessmentResponseV1; error?: string; detail?: string } | null;
      if (!response.ok || !body?.assessment) {
        setAssessError(body?.detail || body?.error || "Route Assist could not assess frame overlap.");
        return;
      }
      const toImageId = `continuation-${Date.now()}`;
      const observations: RouteAssistFrameOverlapObservationV1[] = body.assessment.matched
        ? [{
            legScopeId: `leg-A-${continuation.legLabel}`,
            fromImageId: continuation.photo.imageId,
            toImageId,
            evidenceKind: body.assessment.evidenceKind,
            fromObjectId: "prior-continuation-anchor",
            toObjectId: "new-continuation-anchor",
            confidence: body.assessment.confidence,
          }]
        : [];
      const link = evaluateRouteAssistFrameOverlapV1({
        legScopeId: `leg-A-${continuation.legLabel}`,
        fromImageId: continuation.photo.imageId,
        toImageId,
        observations,
      });
      setOverlapResult({ assessment: body.assessment, link: observations[0] ?? null, outcome: link.outcome });
    } catch (error) {
      setAssessError(error instanceof Error ? error.message : "Route Assist could not reach the frame-overlap endpoint.");
    } finally {
      setAssessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-electric">Price2Book</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist guided-continuation preview</h1>
          <p className="mt-2 text-sm leading-6 text-slate">
            Preview-only test harness for the minimal guided overlap capture architecture. Take one photo first. If Route
            Assist needs more of the route, it will ask for a second overlapping photo instead of a full sweep.
          </p>
        </header>

        {!continuation && (
          <RouteAssistPhotoCapture
            onComplete={(outcome) => setCompletion({ kind: "PHOTO_SUFFICIENT", outcome })}
            onEscalateToSweep={() => setCompletion({ kind: "SWEEP_REQUIRED" })}
            onGuidedContinuationRequired={(event) => setContinuation(event)}
          />
        )}

        {continuation && !overlapResult && (
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="route-assist-guided-continuation-panel">
            <p className="text-sm text-slate-700" data-testid="route-assist-guided-continuation-guidance">
              Route Assist needs a bit more of the route. Move toward the rest of the route while keeping{" "}
              <span className="font-semibold">{evidenceDescription}</span> visible, then take another photo.
            </p>
            <p className="text-xs text-slate-500">Reason: {continuation.outcome.legEscalations[continuation.legLabel]?.reason}</p>
            <ContinuationCameraCapture onCaptured={handleContinuationPhoto} />
            {assessing && <p className="text-sm text-slate-500">Checking for a connection…</p>}
            {assessError && <p className="text-sm text-red-600" data-testid="route-assist-continuation-error">{assessError}</p>}
          </div>
        )}

        {overlapResult && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm" data-testid="route-assist-guided-continuation-result">
            {overlapResult.outcome === "CONNECTED" ? (
              <p className="font-semibold text-emerald-700">Connection found — hold still.</p>
            ) : (
              <p className="font-semibold text-amber-700">Insufficient overlap — please try the continuation photo again.</p>
            )}
            <p className="text-xs text-slate-500">
              matched: {String(overlapResult.assessment.matched)}, confidence: {overlapResult.assessment.confidence.toFixed(2)}
              {overlapResult.assessment.matched ? `, evidenceKind: ${overlapResult.assessment.evidenceKind}` : ""}
            </p>
            <p className="text-xs text-slate-500">Route continuation state: {overlapResult.outcome}</p>
            <button
              type="button"
              onClick={() => setOverlapResult(null)}
              className="mt-2 self-start rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600"
            >
              Try another continuation photo
            </button>
          </div>
        )}

        {completion && (
          <section className="mt-6 rounded-xl border border-cardline bg-white p-4 text-xs text-slate" data-testid="route-assist-guided-continuation-completion">
            <p className="font-semibold text-navy">Terminal callback fired: {completion.kind}</p>
            {completion.kind === "PHOTO_SUFFICIENT" && (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-700">{JSON.stringify(completion.outcome.legEscalations, null, 2)}</pre>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
