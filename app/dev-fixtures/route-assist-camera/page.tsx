"use client";

import { useEffect, useMemo, useState } from "react";
import RouteAssistRoomScanCamera, { type RouteAssistRoomScanCaptureV1 } from "@/components/route-assist/RouteAssistRoomScanCamera";
import RouteAssistSweepRouteReview from "@/components/route-assist/RouteAssistSweepRouteReview";
import {
  persistRouteAssistSweepCaptureV1,
  type RouteAssistCaptureImagePersisterV1,
  type RouteAssistSweepCaptureHandoffV1,
} from "@/lib/visual-assist/route-assist/captureHandoff";
import {
  detectRouteAssistWebCaptureCapabilityV1,
  selectRouteAssistAcquisitionPathV1,
  type RouteAssistAcquisitionPathV1,
  type RouteAssistCaptureCapabilityV1,
} from "@/lib/visual-assist/route-assist/captureCapability";
import type { RouteAssistHttpVisibleSceneRequestV1 } from "@/lib/visual-assist/route-assist/httpVisibleSceneProvider";
import { buildFixtureCorrectionAwareOverlayV1 } from "@/lib/visual-assist/route-assist/fixtureRouteRevision";
import {
  undoLatestRouteAssistReviewCorrectionV1,
  validateRouteAssistReviewCorrectionsV1,
  type RouteAssistReviewCorrectionKindV1,
  type RouteAssistReviewCorrectionV1,
} from "@/lib/visual-assist/route-assist/routeReviewCorrection";
import { proposeVisibleTrimHuggingRouteV1 } from "@/lib/visual-assist/route-assist/visibleTrimRouteProposal";
import { buildVisibleTrimRouteOverlayV1 } from "@/lib/visual-assist/route-assist/visibleTrimRouteOverlay";
import type { RouteAssistVisibleSceneSemanticsV1 } from "@/lib/visual-assist/route-assist/visualSceneSemantics";
import {
  evaluateRouteAssistAutomaticCalibrationV1,
  resolveRouteAssistHomeownerCalibrationV1,
} from "@/lib/visual-assist/route-assist/visualCalibrationFlow";
import type { RoutePoint, RouteSegment } from "@/lib/visual-assist/route-assist/types";

type CeilingHeight = 8 | 9 | 10 | 12 | null;
type VisionState = "IDLE" | "ANALYZING" | "READY" | "FAILED";
type PreviewImage = { imageId: string; dataUrl: string };

const OPTIONS: Array<{ label: string; value: CeilingHeight }> = [
  { label: "8 ft", value: 8 },
  { label: "9 ft", value: 9 },
  { label: "10 ft", value: 10 },
  { label: "12 ft", value: 12 },
  { label: "Not sure", value: null },
];

const previewCapturePersisterV1: RouteAssistCaptureImagePersisterV1 = {
  async persist(frame) {
    return {
      imageId: frame.imageId,
      imageUrl: frame.objectUrl,
      mimeType: frame.mimeType,
      width: frame.width,
      height: frame.height,
    };
  },
};

function correctionInstruction(kind: RouteAssistReviewCorrectionKindV1): string {
  if (kind === "ROUTE_SHOULD_AVOID_HERE") return "Tap the area the proposed route should avoid. This is guidance only, not obstacle evidence.";
  if (kind === "SOURCE_ANCHOR_WRONG") return "Tap the actual existing outlet/source. Route Assist will ask the provider to re-identify the source.";
  if (kind === "DESTINATION_ANCHOR_WRONG") return "Tap the actual requested destination. Route Assist will ask the provider to re-identify it.";
  return "Tap where you want the proposed route to pass.";
}

function graphFromCapture(capture: RouteAssistRoomScanCaptureV1): { points: RoutePoint[]; segments: RouteSegment[] } | null {
  const destination = capture.destinationAnchors[0];
  if (!destination) return null;
  const points: RoutePoint[] = [
    {
      id: "preview-source-point",
      x: capture.sourceAnchor.x,
      y: capture.sourceAnchor.y,
      imageId: capture.sourceAnchor.imageId,
      kind: "SOURCE",
    },
    {
      id: "preview-destination-point",
      x: destination.x,
      y: destination.y,
      imageId: destination.imageId,
      kind: "DESTINATION",
    },
  ];
  return {
    points,
    segments: [{ id: "preview-route-segment", fromPointId: points[0].id, toPointId: points[1].id }],
  };
}

function selectedFrames(capture: RouteAssistRoomScanCaptureV1) {
  const frames = capture.sweepFrames;
  if (frames.length <= 8) return frames;
  const selected = new Map<number, (typeof frames)[number]>();
  for (let i = 0; i < 8; i++) {
    const index = Math.round((i * (frames.length - 1)) / 7);
    selected.set(index, frames[index]);
  }
  return [...selected.entries()].sort((a, b) => a[0] - b[0]).map(([, frame]) => frame);
}

async function downscaledDataUrl(objectUrl: string): Promise<string> {
  const response = await fetch(objectUrl);
  if (!response.ok) throw new Error("Could not read captured frame");
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const maxEdge = 960;
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare captured frame");
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.62);
  } finally {
    bitmap.close();
  }
}

async function preparePreviewImages(capture: RouteAssistRoomScanCaptureV1): Promise<PreviewImage[]> {
  const frames = selectedFrames(capture);
  const images: PreviewImage[] = [];
  for (const frame of frames) {
    images.push({ imageId: frame.imageId, dataUrl: await downscaledDataUrl(frame.objectUrl) });
  }
  return images;
}

async function analyzeLiveSemantics(args: {
  capture: RouteAssistRoomScanCaptureV1;
  handoff: RouteAssistSweepCaptureHandoffV1;
  images: PreviewImage[];
  corrections: RouteAssistReviewCorrectionV1[];
}): Promise<RouteAssistVisibleSceneSemanticsV1> {
  const graph = graphFromCapture(args.capture);
  if (!graph) throw new Error("Capture graph is incomplete");
  const request: RouteAssistHttpVisibleSceneRequestV1 = {
    version: 1,
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    pointAnchors: graph.points.map((point) => ({
      pointId: point.id,
      kind: point.kind,
      imageId: point.imageId,
      x: point.x,
      y: point.y,
    })),
    segments: graph.segments.map((segment) => ({
      segmentId: segment.id,
      fromPointId: segment.fromPointId,
      toPointId: segment.toPointId,
    })),
    imageIds: [...args.handoff.captureArtifacts.imageIds],
    supplementalCaptureSets: [],
    reviewCorrections: args.corrections,
  };
  const response = await fetch("/api/dev-fixtures/route-assist-visible-scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request, images: args.images }),
  });
  if (!response.ok) throw new Error("Live scene analysis failed");
  return response.json() as Promise<RouteAssistVisibleSceneSemanticsV1>;
}

export default function RouteAssistCameraDemoPage() {
  const [capture, setCapture] = useState<RouteAssistRoomScanCaptureV1 | null>(null);
  const [handoff, setHandoff] = useState<RouteAssistSweepCaptureHandoffV1 | null>(null);
  const [state, setState] = useState<"IDLE" | "UPLOADING" | "READY" | "FAILED">("IDLE");
  const [visionState, setVisionState] = useState<VisionState>("IDLE");
  const [semantics, setSemantics] = useState<RouteAssistVisibleSceneSemanticsV1 | null>(null);
  const [visionProblem, setVisionProblem] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [capability, setCapability] = useState<RouteAssistCaptureCapabilityV1 | null>(null);
  const [acquisition, setAcquisition] = useState<RouteAssistAcquisitionPathV1 | null>(null);
  const [needsScale, setNeedsScale] = useState(false);
  const [calibrationReady, setCalibrationReady] = useState(false);
  const [scaleDeclined, setScaleDeclined] = useState(false);
  const [reviewed, setReviewed] = useState<"PENDING" | "ACCEPTED" | "ADJUST">("PENDING");
  const [corrections, setCorrections] = useState<RouteAssistReviewCorrectionV1[]>([]);
  const [correctionKind, setCorrectionKind] = useState<RouteAssistReviewCorrectionKindV1>("ROUTE_SHOULD_PASS_HERE");
  const [correctionProblem, setCorrectionProblem] = useState<string | null>(null);

  useEffect(() => {
    const c = detectRouteAssistWebCaptureCapabilityV1();
    setCapability(c);
    setAcquisition(selectRouteAssistAcquisitionPathV1(c));
  }, []);

  async function handleCapture(next: RouteAssistRoomScanCaptureV1) {
    setCapture(next);
    setState("UPLOADING");
    setVisionState("IDLE");
    setSemantics(null);
    setVisionProblem(null);
    setReviewed("PENDING");
    setCorrections([]);
    setCorrectionProblem(null);
    setCorrectionKind("ROUTE_SHOULD_PASS_HERE");
    setScaleDeclined(false);

    const persisted = await persistRouteAssistSweepCaptureV1({ frames: next.sweepFrames, persister: previewCapturePersisterV1 });
    if (!persisted) {
      setState("FAILED");
      return;
    }
    setHandoff(persisted);
    setState("READY");

    if (!capability || capability.worldGeometryAvailable) {
      setCalibrationReady(true);
    } else {
      const auto = evaluateRouteAssistAutomaticCalibrationV1({ capability, visualReferenceAttempted: true, references: [] });
      setNeedsScale(auto.decision.askHomeownerForScale);
      setCalibrationReady(!auto.decision.askHomeownerForScale);
    }

    setVisionState("ANALYZING");
    try {
      const images = await preparePreviewImages(next);
      setPreviewImages(images);
      const result = await analyzeLiveSemantics({ capture: next, handoff: persisted, images, corrections: [] });
      setSemantics(result);
      setVisionState("READY");
    } catch (error) {
      console.error(error);
      setVisionProblem("Route Assist could not interpret this sweep. Try a slower scan that keeps the baseboard and full doorway trim visible.");
      setVisionState("FAILED");
    }
  }

  function answerScale(value: CeilingHeight) {
    if (!capability) return;
    if (value === null) {
      setScaleDeclined(true);
      setNeedsScale(false);
      setCalibrationReady(false);
      return;
    }
    const result = resolveRouteAssistHomeownerCalibrationV1({ capability, ceilingHeightFt: value });
    setCalibrationReady(result.usableReferences.length > 0);
    setNeedsScale(result.usableReferences.length === 0);
  }

  const graph = useMemo(() => capture ? graphFromCapture(capture) : null, [capture]);
  const baselineOverlay = useMemo(() => {
    if (!handoff || !semantics || !graph) return null;
    const proposal = proposeVisibleTrimHuggingRouteV1({
      semantics,
      expectedCaptureImageIds: handoff.captureArtifacts.imageIds,
      points: graph.points,
      segments: graph.segments,
    });
    if (proposal.status !== "REVIEW_REQUIRED") return null;
    return buildVisibleTrimRouteOverlayV1({ semantics, proposal });
  }, [handoff, semantics, graph]);

  const overlay = useMemo(
    () => baselineOverlay ? buildFixtureCorrectionAwareOverlayV1({ baseline: baselineOverlay, corrections }) : null,
    [baselineOverlay, corrections],
  );

  const canReview = state === "READY" && handoff && calibrationReady && visionState === "READY" && overlay;

  async function addCorrection(next: { imageId: string; kind: RouteAssistReviewCorrectionKindV1; point: { x: number; y: number } }) {
    if (!handoff || !capture) return;
    const candidate: RouteAssistReviewCorrectionV1 = {
      correctionId: `preview-correction-${corrections.length + 1}`,
      imageId: next.imageId,
      kind: next.kind,
      point: next.point,
      createdAt: new Date().toISOString(),
    };
    const proposed = [...corrections, candidate];
    const problems = validateRouteAssistReviewCorrectionsV1({ corrections: proposed, captureImageIds: handoff.captureArtifacts.imageIds });
    if (problems.length) {
      setCorrectionProblem(problems[0]);
      return;
    }
    setCorrectionProblem(null);
    setCorrections(proposed);
    setReviewed("PENDING");

    if (!previewImages.length) return;
    setVisionState("ANALYZING");
    try {
      const result = await analyzeLiveSemantics({ capture, handoff, images: previewImages, corrections: proposed });
      setSemantics(result);
      setVisionState("READY");
    } catch {
      setVisionProblem("Route Assist could not revise the route from that correction. The correction was kept for review.");
      setVisionState("FAILED");
    }
  }

  function undoCorrection() {
    setCorrections((current) => undoLatestRouteAssistReviewCorrectionV1(current));
    setCorrectionProblem(null);
    setReviewed("PENDING");
  }

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-electric">Price2Book</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist live camera test</h1>
          <p className="mt-2 text-sm leading-6 text-slate">Scan from an existing outlet toward the new location. Route Assist now analyzes the actual captured room frames for visible baseboard, doorway and trim context.</p>
        </header>

        {acquisition && <div className="mb-4 rounded-xl border border-cardline bg-white p-3 text-xs text-slate"><strong className="text-navy">Capture path:</strong> {acquisition.path}</div>}
        {acquisition?.path === "CALIBRATED_CAMERA" && <RouteAssistRoomScanCamera sourceLabel="Existing outlet" destinationLabels={["New outlet location"]} onScanComplete={handleCapture} />}
        {acquisition?.path === "REVIEW_ONLY" && <div className="rounded-xl bg-amber-50 p-4 text-sm">Camera evidence unavailable; contractor review required.</div>}
        {acquisition?.path === "WORLD_GEOMETRY" && <div className="rounded-xl bg-blue-50 p-4 text-sm">Spatial provider path available; this browser test intentionally uses the ordinary-camera path.</div>}

        {state === "UPLOADING" && <div className="mt-4 rounded-xl border border-cardline bg-white p-4 text-sm">Preparing {capture?.sweepFrames.length ?? 0} ordered frames…</div>}
        {state === "FAILED" && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">The preview could not prepare this sweep. Please rescan.</div>}
        {state === "READY" && handoff && <div className="mt-4 rounded-xl border border-cardline bg-white p-3 text-xs"><strong>{handoff.persistedFrames.length} ordered frames captured.</strong></div>}
        {visionState === "ANALYZING" && <div className="mt-4 rounded-xl border border-cardline bg-white p-4 text-sm"><strong className="text-navy">Analyzing the room…</strong><div className="mt-1 text-xs text-slate">Looking only for visible route context such as the source, destination, baseboard and doorway trim.</div></div>}
        {visionState === "FAILED" && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{visionProblem}</div>}
        {visionState === "READY" && semantics?.qualityIssues?.length ? <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><strong>More visual context is needed.</strong><div className="mt-1 text-xs">{semantics.qualityIssues.map((issue) => issue.code.replaceAll("_", " ").toLowerCase()).join(" · ")}</div></div> : null}
        {visionState === "READY" && semantics && !baselineOverlay && !semantics.qualityIssues?.length ? <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">Route Assist saw the room but could not form a trustworthy trim-hugging route from the visible evidence. Try scanning more slowly with the baseboard and the entire doorway visible.</div> : null}

        {state === "READY" && handoff && needsScale && !calibrationReady && <section className="mt-4 rounded-2xl border border-cardline bg-white p-4"><h2 className="font-bold text-navy">About how high is your ceiling?</h2><p className="mt-1 text-sm text-slate">This is only a scale reference for the ordinary-camera test. It does not create hidden geometry.</p><div className="mt-3 grid grid-cols-2 gap-2">{OPTIONS.map((option) => <button key={option.label} onClick={() => answerScale(option.value)} className="rounded-xl border border-cardline p-3 text-sm font-semibold">{option.label}</button>)}</div></section>}
        {scaleDeclined && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><strong>Measurement unavailable.</strong><div className="mt-1 text-xs">Route Assist will not guess a scale.</div></div>}

        {canReview && <div className="mt-4">
          <RouteAssistSweepRouteReview frames={handoff.persistedFrames} overlay={overlay} previousOverlay={corrections.length > 0 ? baselineOverlay : null} corrections={corrections} adjustmentMode={reviewed === "ADJUST"} correctionKind={correctionKind} onCorrectionPoint={addCorrection} />
          {reviewed === "PENDING" && <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setReviewed("ADJUST")} className="rounded-xl border border-cardline p-3 font-semibold">Adjust route</button><button onClick={() => setReviewed("ACCEPTED")} className="rounded-xl bg-electric p-3 font-semibold text-white">Looks good</button></div>}
          {reviewed === "ADJUST" && <div className="mt-3 rounded-xl border border-cardline bg-white p-3"><div className="grid grid-cols-2 gap-2"><button onClick={() => setCorrectionKind("ROUTE_SHOULD_PASS_HERE")} className={`rounded-xl border p-3 text-sm font-semibold ${correctionKind === "ROUTE_SHOULD_PASS_HERE" ? "border-electric text-electric" : "border-cardline text-navy"}`}>Route through here</button><button onClick={() => setCorrectionKind("ROUTE_SHOULD_AVOID_HERE")} className={`rounded-xl border p-3 text-sm font-semibold ${correctionKind === "ROUTE_SHOULD_AVOID_HERE" ? "border-electric text-electric" : "border-cardline text-navy"}`}>Avoid this area</button><button onClick={() => setCorrectionKind("SOURCE_ANCHOR_WRONG")} className={`rounded-xl border p-3 text-sm font-semibold ${correctionKind === "SOURCE_ANCHOR_WRONG" ? "border-electric text-electric" : "border-cardline text-navy"}`}>Wrong start point</button><button onClick={() => setCorrectionKind("DESTINATION_ANCHOR_WRONG")} className={`rounded-xl border p-3 text-sm font-semibold ${correctionKind === "DESTINATION_ANCHOR_WRONG" ? "border-electric text-electric" : "border-cardline text-navy"}`}>Wrong end point</button></div><div className="mt-2 text-xs text-slate">{correctionInstruction(correctionKind)}</div>{corrections.length > 0 && <button onClick={undoCorrection} className="mt-3 rounded-xl border border-cardline px-3 py-2 text-xs font-semibold text-navy">Undo last correction</button>}{correctionProblem && <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-950">Those instructions conflict at the same marked point. Route Assist will not guess.</div>}</div>}
          {reviewed === "ACCEPTED" && <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Visible route review accepted. This camera test still does not create pricing or material facts.</div>}
        </div>}

        <p className="mt-4 text-center text-xs text-slate-light">Live semantic vision is limited to visible scene facts. It cannot diagnose electrical conditions, infer concealed wiring, or create price authority.</p>
      </div>
    </main>
  );
}
