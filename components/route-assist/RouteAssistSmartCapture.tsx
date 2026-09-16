"use client";

import { useMemo, useState } from "react";
import { useSiteFetch } from "@/components/site/SiteContext";
import RouteAssistCapture from "./RouteAssistCapture";
import RouteAssistRoomScanCamera, { type RouteAssistRoomScanCaptureV1 } from "./RouteAssistRoomScanCamera";
import RouteAssistSweepRouteReview from "./RouteAssistSweepRouteReview";
import RouteAssistTargetedRecaptureCamera, { type RouteAssistTargetedRecaptureCaptureV1 } from "./RouteAssistTargetedRecaptureCamera";
import { createPrivateRouteAssistBrowserCapturePersisterV1 } from "@/lib/visual-assist/route-assist/privateBrowserCapturePersister";
import { persistRouteAssistSweepCaptureV1, type RouteAssistPersistedSweepFrameV1, type RouteAssistSweepCaptureHandoffV1 } from "@/lib/visual-assist/route-assist/captureHandoff";
import { roomScanCaptureToSingleLegGraphV1, type RouteAssistRoomScanGraphV1 } from "@/lib/visual-assist/route-assist/roomScanGraph";
import { createRouteAssistBrowserVisibleSceneTransportV1, type RouteAssistBrowserMediaBindingV1 } from "@/lib/visual-assist/route-assist/browserVisibleSceneTransport";
import { createRouteAssistHttpVisibleSceneProviderV1 } from "@/lib/visual-assist/route-assist/httpVisibleSceneProvider";
import { preparePersistedSweepForVisibleSceneReviewV1, type RouteAssistVisibleSceneReviewPipelineV1 } from "@/lib/visual-assist/route-assist/visibleSceneReviewPipeline";
import { planRouteAssistRecaptureV1, persistRouteAssistTargetedSupplementV1, type RouteAssistPersistedSupplementalCaptureV1, type RouteAssistRecapturePlanV1 } from "@/lib/visual-assist/route-assist/targetedRecapture";
import { undoLatestRouteAssistReviewCorrectionV1, validateRouteAssistReviewCorrectionsV1, type RouteAssistReviewCorrectionKindV1, type RouteAssistReviewCorrectionV1 } from "@/lib/visual-assist/route-assist/routeReviewCorrection";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";
import type { RouteAssistVisibleTrimRouteOverlayV1 } from "@/lib/visual-assist/route-assist/visibleTrimRouteOverlay";

type Props = {
  guidedFlowSessionId: string;
  taskId: string;
  destinationType: RouteAssistDestinationType;
  sourceHint: string;
  destinationHint: string;
  onUploadPhoto: (file: File) => Promise<string>;
  onComplete: (result: RouteAssistResult) => void;
  expectedMode?: "SURFACE" | "CONCEALED" | null;
};

type Stage = "CHOICE" | "ROOM_SCAN" | "ANALYZING" | "REVIEW" | "TARGETED_RECAPTURE" | "VISUAL_ACCEPTED" | "MANUAL";

type SupplementalState = {
  persisted: RouteAssistPersistedSupplementalCaptureV1;
  capturedAt: string;
};

function correctionInstruction(kind: RouteAssistReviewCorrectionKindV1): string {
  if (kind === "ROUTE_SHOULD_AVOID_HERE") return "Tap the area this route should avoid. This is guidance for a revised proposal, not obstacle evidence.";
  if (kind === "SOURCE_ANCHOR_WRONG") return "Tap the actual existing source. The provider will re-check the image; the tap itself does not move canonical geometry.";
  if (kind === "DESTINATION_ANCHOR_WRONG") return "Tap the actual destination. The provider will re-check the image; the tap itself does not become route geometry.";
  return "Tap where you want the proposed route to pass.";
}

function supplementalReviewFrames(
  primaryCount: number,
  supplements: readonly SupplementalState[],
): RouteAssistPersistedSweepFrameV1[] {
  let sequence = primaryCount;
  const frames: RouteAssistPersistedSweepFrameV1[] = [];
  for (const supplement of supplements) {
    for (const image of supplement.persisted.persistedImages) {
      frames.push({
        ...image,
        capturedAt: supplement.capturedAt,
        sequence,
      });
      sequence += 1;
    }
  }
  return frames;
}

/**
 * Production Route Assist camera experience.
 *
 * Ordinary mobile browsers get the semantic-CV room-scan flow: explicit A/B
 * taps, private evidence upload, structural/provider quality gates, targeted
 * recapture, corrections, and a homeowner-reviewed visible proposal. Because a
 * browser camera is not calibrated world geometry, the visible proposal never
 * fabricates footage or fitting counts. After visual review the flow hands off
 * to the existing explicit/manual Route Assist measurement UI, preserving the
 * current deterministic Routing V2 path.
 *
 * Concealed routing skips the visual surface proposal entirely: an ordinary
 * room scan cannot observe a hidden attic/crawlspace/wall path.
 */
export default function RouteAssistSmartCapture({
  guidedFlowSessionId,
  taskId,
  destinationType,
  sourceHint,
  destinationHint,
  onUploadPhoto,
  onComplete,
  expectedMode = null,
}: Props) {
  const siteFetch = useSiteFetch();
  const [stage, setStage] = useState<Stage>(expectedMode === "CONCEALED" ? "MANUAL" : "CHOICE");
  const [handoff, setHandoff] = useState<RouteAssistSweepCaptureHandoffV1 | null>(null);
  const [graph, setGraph] = useState<RouteAssistRoomScanGraphV1 | null>(null);
  const [review, setReview] = useState<RouteAssistVisibleSceneReviewPipelineV1 | null>(null);
  const [previousOverlay, setPreviousOverlay] = useState<RouteAssistVisibleTrimRouteOverlayV1 | null>(null);
  const [corrections, setCorrections] = useState<RouteAssistReviewCorrectionV1[]>([]);
  const [correctionKind, setCorrectionKind] = useState<RouteAssistReviewCorrectionKindV1>("ROUTE_SHOULD_PASS_HERE");
  const [adjusting, setAdjusting] = useState(false);
  const [supplements, setSupplements] = useState<SupplementalState[]>([]);
  const [recapturePlan, setRecapturePlan] = useState<RouteAssistRecapturePlanV1 | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const persister = useMemo(() => createPrivateRouteAssistBrowserCapturePersisterV1({
    fetchFn: siteFetch,
    guidedFlowSessionId,
    taskId,
  }), [siteFetch, guidedFlowSessionId, taskId]);

  const reviewFrames = useMemo(() => {
    if (!handoff) return [];
    return [...handoff.persistedFrames, ...supplementalReviewFrames(handoff.persistedFrames.length, supplements)];
  }, [handoff, supplements]);

  async function analyze(args: {
    nextHandoff?: RouteAssistSweepCaptureHandoffV1;
    nextGraph?: RouteAssistRoomScanGraphV1;
    nextCorrections?: RouteAssistReviewCorrectionV1[];
    nextSupplements?: SupplementalState[];
    priorOverlay?: RouteAssistVisibleTrimRouteOverlayV1 | null;
    /**
     * The last accepted REVIEW_REQUIRED proposal for THIS scan session, so a
     * correction/recapture round that re-runs the provider from scratch
     * can't silently contradict an already-accepted doorway conclusion.
     * Explicitly `null` on a brand-new scan (handleRoomCapture) — a fresh
     * handoff has no continuity with whatever `review` still held from
     * before, e.g. a prior scan that was discarded for a full re-sweep.
     */
    previousProposal?: RouteAssistVisibleSceneReviewPipelineV1["proposal"] | null;
  } = {}) {
    const activeHandoff = args.nextHandoff ?? handoff;
    const activeGraph = args.nextGraph ?? graph;
    const activeCorrections = args.nextCorrections ?? corrections;
    const activeSupplements = args.nextSupplements ?? supplements;
    if (!activeHandoff || !activeGraph) return;

    setStage("ANALYZING");
    setProblem(null);
    const supplementalMedia: RouteAssistBrowserMediaBindingV1[] = activeSupplements.flatMap((supplement) =>
      supplement.persisted.persistedImages.flatMap((image) => image.mediaRef ? [{ imageId: image.imageId, mediaRef: image.mediaRef }] : []),
    );
    const transport = createRouteAssistBrowserVisibleSceneTransportV1({
      fetchFn: siteFetch,
      guidedFlowSessionId,
      taskId,
      primaryFrames: activeHandoff.persistedFrames,
      supplementalMedia,
    });
    const provider = createRouteAssistHttpVisibleSceneProviderV1({ providerKey: "price2book.route-assist.visible-scene.v1", transport });

    const result = await preparePersistedSweepForVisibleSceneReviewV1({
      handoff: activeHandoff,
      provider,
      providerInput: {
        version: 1,
        mode: "SURFACE",
        destinationType,
        points: activeGraph.points,
        segments: activeGraph.segments,
        supplementalCaptureSets: activeSupplements.map((supplement) => supplement.persisted.captureSet),
        reviewCorrections: activeCorrections,
      },
      previousProposal: args.previousProposal ?? null,
    }).catch(() => null);

    if (!result) {
      setProblem("Route Assist could not analyze the room scan. You can continue with the manual route instead.");
      setStage("CHOICE");
      return;
    }
    setReview(result);
    setPreviousOverlay(args.priorOverlay ?? null);

    if (result.recaptureIssues.length) {
      const issue = result.recaptureIssues[0];
      const plan = planRouteAssistRecaptureV1({ issue, originalImageIds: activeHandoff.captureArtifacts.imageIds });
      if (plan.mode === "FULL_SWEEP") {
        setProblem(issue.homeownerMessage);
        setHandoff(null);
        setGraph(null);
        setReview(null);
        setSupplements([]);
        setCorrections([]);
        setStage("ROOM_SCAN");
        return;
      }
      setProblem(issue.homeownerMessage);
      setRecapturePlan(plan);
      setStage("TARGETED_RECAPTURE");
      return;
    }

    if (!result.overlay || !result.proposal || result.proposal.status !== "REVIEW_REQUIRED") {
      setProblem(result.problems[0] ?? "Route Assist could not build a reliable visible route proposal. Continue with the manual route instead.");
      setStage("CHOICE");
      return;
    }

    setRecapturePlan(null);
    setStage("REVIEW");
  }

  async function handleRoomCapture(capture: RouteAssistRoomScanCaptureV1) {
    const nextGraph = roomScanCaptureToSingleLegGraphV1(capture);
    if (!nextGraph) {
      setProblem("This Route Assist step needs one clear destination. Continue with the manual route instead.");
      setStage("CHOICE");
      return;
    }
    setStage("ANALYZING");
    setProblem(null);
    const persisted = await persistRouteAssistSweepCaptureV1({ frames: capture.sweepFrames, persister });
    if (!persisted || persisted.persistedFrames.some((frame) => !frame.mediaRef)) {
      setProblem("We couldn't securely save the room scan. Continue with the manual route or try the scan again.");
      setStage("CHOICE");
      return;
    }
    setHandoff(persisted);
    setGraph(nextGraph);
    setCorrections([]);
    setSupplements([]);
    await analyze({ nextHandoff: persisted, nextGraph, nextCorrections: [], nextSupplements: [], priorOverlay: null });
  }

  async function handleTargetedRecapture(capture: RouteAssistTargetedRecaptureCaptureV1) {
    if (!handoff || !recapturePlan || recapturePlan.mode !== "TARGETED_SUPPLEMENT") return;
    const requestId = `recapture-${Date.now()}-${supplements.length + 1}`;
    const persisted = await persistRouteAssistTargetedSupplementV1({
      requestId,
      plan: recapturePlan,
      frames: capture.frames,
      persister,
    });
    if (!persisted || persisted.persistedImages.some((image) => !image.mediaRef)) {
      setProblem("We couldn't securely save those focused photos. Try them again or continue with the manual route.");
      return;
    }
    const nextSupplements = [...supplements, { persisted, capturedAt: capture.capturedAt }];
    setSupplements(nextSupplements);
    await analyze({ nextSupplements, priorOverlay: review?.overlay ?? null, previousProposal: review?.proposal ?? null });
  }

  async function addCorrection(next: { imageId: string; kind: RouteAssistReviewCorrectionKindV1; point: { x: number; y: number } }) {
    if (!handoff) return;
    const candidate: RouteAssistReviewCorrectionV1 = {
      correctionId: `route-correction-${Date.now()}-${corrections.length + 1}`,
      imageId: next.imageId,
      kind: next.kind,
      point: next.point,
      createdAt: new Date().toISOString(),
    };
    const proposed = [...corrections, candidate];
    const allowedImages = [
      ...handoff.captureArtifacts.imageIds,
      ...supplements.flatMap((supplement) => supplement.persisted.captureSet.supplementalImageIds),
    ];
    const validation = validateRouteAssistReviewCorrectionsV1({ corrections: proposed, captureImageIds: allowedImages });
    if (validation.length) {
      setProblem(validation[0]);
      return;
    }
    setCorrections(proposed);
    setAdjusting(false);
    await analyze({ nextCorrections: proposed, priorOverlay: review?.overlay ?? null, previousProposal: review?.proposal ?? null });
  }

  async function undoCorrection() {
    const next = undoLatestRouteAssistReviewCorrectionV1(corrections);
    setCorrections(next);
    setAdjusting(false);
    await analyze({ nextCorrections: next, priorOverlay: review?.overlay ?? null, previousProposal: review?.proposal ?? null });
  }

  function completeManual(result: RouteAssistResult) {
    // The semantic sweep remains evidence upstream of this deterministic result;
    // it never rewrites the explicit/manual measurements the homeowner confirms.
    onComplete(result);
  }

  if (stage === "MANUAL") {
    return <RouteAssistCapture destinationType={destinationType} sourceHint={sourceHint} destinationHint={destinationHint} onUploadPhoto={onUploadPhoto} onComplete={completeManual} onCancel={() => setStage("CHOICE")} />;
  }

  if (stage === "ROOM_SCAN") {
    return <div><RouteAssistRoomScanCamera sourceLabel={sourceHint.replace(/^tap\s+/i, "").replace(/[.]$/, "")} destinationLabels={[destinationHint.replace(/^tap\s+/i, "").replace(/[.]$/, "")]} onScanComplete={handleRoomCapture} onBack={() => setStage("CHOICE")} />{problem && <p className="mx-auto mt-3 max-w-md text-center text-sm text-amber-800">{problem}</p>}</div>;
  }

  if (stage === "ANALYZING") {
    return <div className="mx-auto max-w-md rounded-2xl border border-cardline bg-white p-6 text-center shadow-sm"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-electric" /><h2 className="mt-4 text-lg font-semibold text-navy">Building your route</h2><p className="mt-2 text-sm leading-6 text-slate">Checking the visible source, destination, trim and openings. No hidden wiring or pricing is inferred here.</p></div>;
  }

  if (stage === "TARGETED_RECAPTURE" && recapturePlan?.mode === "TARGETED_SUPPLEMENT") {
    return <div className="mx-auto max-w-md"><RouteAssistTargetedRecaptureCamera focus={recapturePlan.focus} instruction={problem ?? "Capture the missing visible area more clearly."} onComplete={handleTargetedRecapture} onCancel={() => setStage("MANUAL")} /></div>;
  }

  if (stage === "REVIEW" && handoff && review?.overlay) {
    return <div className="mx-auto max-w-md"><RouteAssistSweepRouteReview frames={reviewFrames} overlay={review.overlay} previousOverlay={previousOverlay} corrections={corrections} adjustmentMode={adjusting} correctionKind={correctionKind} onCorrectionPoint={addCorrection} />
      {!adjusting ? <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setAdjusting(true)} className="rounded-xl border border-cardline px-4 py-3 text-sm font-semibold text-navy">Adjust route</button><button type="button" onClick={() => setStage("VISUAL_ACCEPTED")} className="rounded-xl bg-electric px-4 py-3 text-sm font-semibold text-white">Looks good</button></div> : <div className="mt-3 rounded-2xl border border-cardline bg-white p-3"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setCorrectionKind("ROUTE_SHOULD_PASS_HERE")} className={`rounded-xl border p-3 text-sm font-semibold ${correctionKind === "ROUTE_SHOULD_PASS_HERE" ? "border-electric text-electric" : "border-cardline text-navy"}`}>Route through here</button><button type="button" onClick={() => setCorrectionKind("ROUTE_SHOULD_AVOID_HERE")} className={`rounded-xl border p-3 text-sm font-semibold ${correctionKind === "ROUTE_SHOULD_AVOID_HERE" ? "border-electric text-electric" : "border-cardline text-navy"}`}>Avoid this area</button><button type="button" onClick={() => setCorrectionKind("SOURCE_ANCHOR_WRONG")} className={`rounded-xl border p-3 text-sm font-semibold ${correctionKind === "SOURCE_ANCHOR_WRONG" ? "border-electric text-electric" : "border-cardline text-navy"}`}>Wrong start</button><button type="button" onClick={() => setCorrectionKind("DESTINATION_ANCHOR_WRONG")} className={`rounded-xl border p-3 text-sm font-semibold ${correctionKind === "DESTINATION_ANCHOR_WRONG" ? "border-electric text-electric" : "border-cardline text-navy"}`}>Wrong end</button></div><p className="mt-3 text-xs leading-5 text-slate">{correctionInstruction(correctionKind)}</p>{corrections.length > 0 && <button type="button" onClick={undoCorrection} className="mt-3 rounded-xl border border-cardline px-3 py-2 text-xs font-semibold text-navy">Undo last correction</button>}</div>}
      {problem && <p className="mt-3 text-center text-sm text-amber-800">{problem}</p>}</div>;
  }

  if (stage === "VISUAL_ACCEPTED") {
    return <div className="mx-auto max-w-md rounded-2xl border border-cardline bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[.14em] text-electric">Visible route confirmed</p><h2 className="mt-1 text-lg font-bold text-navy">One last step for the price</h2><p className="mt-2 text-sm leading-6 text-slate">Your phone camera can show the route, but an ordinary browser cannot claim real-world feet or hidden fitting geometry from pixels. Continue to the measurement step so Price2Book uses only dimensions you explicitly confirm.</p><button type="button" onClick={() => setStage("MANUAL")} className="mt-4 w-full rounded-xl bg-electric px-4 py-3 text-sm font-semibold text-white">Continue to measurement</button><button type="button" onClick={() => setStage("REVIEW")} className="mt-2 w-full text-xs font-semibold text-slate underline underline-offset-4">Review the route again</button></div>;
  }

  return <div className="mx-auto max-w-md rounded-2xl border border-cardline bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[.14em] text-electric">Route Assist</p><h2 className="mt-1 text-lg font-bold text-navy">How would you like to map the route?</h2><p className="mt-2 text-sm leading-6 text-slate">Use the room scan for a guided visible-route proposal, or go straight to the manual route measurement.</p>{problem && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{problem}</p>}<button type="button" onClick={() => setStage("ROOM_SCAN")} className="mt-4 w-full rounded-xl bg-electric px-4 py-3 text-sm font-semibold text-white">Scan the visible route</button><button type="button" onClick={() => setStage("MANUAL")} className="mt-2 w-full rounded-xl border border-cardline px-4 py-3 text-sm font-semibold text-navy">Enter the route manually</button>{expectedMode === "SURFACE" && <p className="mt-3 text-center text-xs text-slate">This question is for a visible surface route.</p>}</div>;
}
