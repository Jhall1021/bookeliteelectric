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
import {
  evaluateRouteAssistCorrespondenceDistributionV1,
  ROUTE_ASSIST_MIN_DISTRIBUTION_EXTENT_V1,
  ROUTE_ASSIST_MIN_DISTRIBUTION_PAIR_SEPARATION_V1,
  ROUTE_ASSIST_MIN_DISTRIBUTION_QUADRANTS_V1,
  type RouteAssistDistributionEvaluationV1,
} from "@/lib/visual-assist/route-assist/correspondenceDistribution";
import type { RouteAssistRelativeDirectionV1 } from "@/lib/visual-assist/route-assist/frameContinuation";
import { computeRouteAssistFrameMotionV1 } from "@/lib/visual-assist/route-assist/frameMotion";
import {
  registerFrameV1,
  ROUTE_ASSIST_REGISTRATION_HOMOGRAPHY_MIN_REDUNDANCY_V1,
  ROUTE_ASSIST_REGISTRATION_INLIER_DISTANCE_THRESHOLD_V1,
  ROUTE_ASSIST_REGISTRATION_MAX_MEAN_REPROJECTION_ERROR_V1,
  ROUTE_ASSIST_REGISTRATION_MIN_INLIER_COUNT_V1,
  ROUTE_ASSIST_REGISTRATION_MIN_INLIER_RATIO_V1,
  type RouteAssistRegistrationResultV1,
} from "@/lib/visual-assist/route-assist/imageRegistration";
import { loadRouteAssistImageV1 } from "@/lib/visual-assist/route-assist/projectiveRenderer";

/**
 * CAPTURE-UX ISOLATION, corrected (fixes a confirmed false-alignment
 * gap). The review UI stays free of any stitching/compositing display --
 * stitchedWorkspace.ts and projectiveRenderer.ts's WebGL drawer remain
 * UNTOUCHED and uncalled -- but "capture isolation" is now understood to
 * mean exactly that, and no more: it does NOT prohibit geometric
 * validation running behind the capture gate. This pass wires
 * imageRegistration.ts's registerFrameV1 in as exactly that -- a
 * validation step between "shutter tapped" and "frame saved," never a
 * rendering/compositing path, and never visible in the plain photo
 * review.
 *
 * THIS PASS'S CORRECTIONS (closing a confirmed false-alignment path, not
 * merely documenting it -- see alignmentEvidence.ts's own module doc
 * comment for the full before/after):
 *
 *   1. REAL MOTION REPLACES THE FALSE STABILITY SIGNAL. The previous
 *      "motion spread" check measured the variance of the AI's OWN
 *      self-reported overlapFraction across recent probes -- an
 *      estimate's internal consistency, not the camera's physical
 *      stability. Proven exploitable: three probes with identical,
 *      hand-constructed (image-independent) numbers reached ALIGNED.
 *      This pass measures ACTUAL motion between consecutive LIVE probe
 *      frames (frameMotion.ts's computeRouteAssistFrameMotionV1, a plain
 *      pixel luminance diff -- no AI call, no sensor) and feeds that as
 *      independent evidence into alignmentEvidence.ts; the AI's overlap
 *      estimate can no longer single-handedly claim the phone is still.
 *
 *   2. GEOMETRIC VALIDATION GATES THE ACTUAL CAPTURE. The AI overlap
 *      probe (frameOverlapAiGateway.ts, via frameContinuation.ts) still
 *      drives fast, cheap LIVE guidance (direction, "hold steady",
 *      "aligned" as an invitation to try) -- but AI estimates never get
 *      the final word on whether a frame is actually accepted. At the
 *      moment of the manual shutter tap, the frozen candidate frame is
 *      run through the real landmark-proposal call
 *      (route-assist-frame-registration-interpret, unchanged) and then
 *      through registerFrameV1's own robust geometric fit (spatial
 *      distribution + inlier consensus, unchanged) -- the SAME pipeline
 *      the offline registration harness already proved correct. Only a
 *      REGISTERED outcome authorizes saving the frame.
 *
 *   3. THE SHUTTER RACE IS CLOSED. takePhoto() freezes the EXACT current
 *      video frame into a canvas FIRST, then hands that exact frozen
 *      data to the validation gate above, and saves that SAME data only
 *      if it passes -- there is no separate "probe" frame that gets
 *      validated while a different, newer live frame gets saved. If
 *      validation fails, the frame is discarded, the live camera and
 *      guidance keep running, and a clear on-screen notice explains why
 *      (route-assist-capture-notice) -- the homeowner stays in capture,
 *      never silently rejected.
 *
 *   4/5 (ghost mapping, four directions, evidence-based hold/aligned
 *   progression) are UNCHANGED from the prior pass -- see below and
 *   alignmentEvidence.ts.
 *
 * Every ACCEPTED photo is still shown in a plain, unstitched list -- no
 * workspace, no marker, no route evaluation, no composite rendering
 * anywhere in this file's UI.
 *
 * MOVEMENT-GUIDANCE PASS (real-phone correction, 21 Sep 2026): "It mostly
 * says Hold steady. Ready to check briefly flashes and disappears." The
 * live guidance state machine (alignmentEvidence.ts) now separates
 * overlap POSITION from motion STABILITY into two independent axes --
 * see that file's own module doc comment for the full diagnosis and
 * fix. This file's own changes are limited to the resulting richer label
 * set (routeAssistAlignmentGuidanceLabelV1, below) and are otherwise
 * unchanged: the approved capture flow, the fixed 20% ghost, the manual
 * shutter, the exact frozen-frame validation gate, and the plain photo
 * review are all untouched by this pass.
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

/**
 * A small, fixed-size (deliberately stretched, aspect ratio not
 * preserved) RGBA sample of the CURRENT live frame -- used only to feed
 * frameMotion.ts's pixel-diff, never shown or sent anywhere. Only
 * relative pixel change between two consecutive samples of this SAME
 * fixed size matters here, not preserving the frame's true proportions.
 */
function grabMotionSampleV1(video: HTMLVideoElement, size = 48): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, size, size);
  return context.getImageData(0, 0, size, size);
}

/** The shape this file needs from route-assist-frame-registration-interpret's response -- only point pairs, validated defensively since it crosses a network boundary. */
type RouteAssistLandmarkPointsV1 = { fromPoint: { x: number; y: number }; toPoint: { x: number; y: number } };

/**
 * OUT-OF-RANGE LANDMARK BUG (real-phone diagnostic, 21 Sep 2026): a real
 * rejected capture's downloaded diagnostics bundle showed usedCorrespondences
 * like {x: 997, y: 437} -- nowhere near the [0,1] space frameRegistrationAiGateway.
 * ts's prompt and JSON schema both require. The vision model (a known
 * Gemini quirk: its native point/box grounding defaults to a ~0-1000 scale
 * regardless of prompt-level normalization instructions) does not reliably
 * honor that contract, and a JSON-schema `minimum`/`maximum` bound is a
 * hint to the model, not something the provider enforces at generation
 * time. This function previously only checked "is a finite number," so
 * those out-of-range points passed straight through into
 * correspondenceDistribution.ts's bin math, which CLAMPS any coordinate
 * outside [0,1] into the boundary bin -- collapsing every landmark into
 * the same bin regardless of how genuinely spread the true landmarks were,
 * and guaranteeing a "concentrated in a single region" rejection every
 * time the model returns un-normalized coordinates. Reproduced by hand
 * against that real captured JSON before this fix, matching its reported
 * distribution stats exactly. The range check below closes that gap at
 * the same network-boundary validation this function already existed for.
 */
function isFiniteLocalPointV1(value: unknown): value is { x: number; y: number } {
  const point = value as { x?: unknown; y?: unknown } | null;
  return (
    Boolean(point) &&
    typeof point?.x === "number" && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1 &&
    typeof point?.y === "number" && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1
  );
}

function isValidLandmarkV1(value: unknown): value is RouteAssistLandmarkPointsV1 {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return isFiniteLocalPointV1(record.fromPoint) && isFiniteLocalPointV1(record.toPoint);
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
 * the (not-yet-visible) evidence state.
 *
 * MOVEMENT GUIDANCE REDESIGN (real-phone correction, 21 Sep 2026):
 * "It mostly says Hold steady. Ready to check briefly flashes and
 * disappears. I have no clear indication of when I should actually stop
 * moving and hold steady." alignmentEvidence.ts's own module doc comment
 * has the full diagnosis; this mapping just surfaces the resulting,
 * richer state set as the required sequence: Move ___ (KEEP_MOVING) ->
 * Slow down (SLOW_DOWN, approaching the target overlap window) -> Stop
 * here — hold steady (HOLD_STEADY, position is suitable -- an explicit
 * instruction, not a lingering status) -> Ready to check (ALIGNED,
 * position AND real measured motion have both settled). MOVE_BACK and
 * UNCERTAIN are the two corrections this pass adds: a confident match
 * with too little overlap ("Move back slightly") and a genuinely
 * unconfident read ("Can't confirm overlap yet") are no longer
 * conflated with the ordinary directional prompt.
 *
 * HONEST READINESS LABELING (still true, unchanged): ALIGNED reads
 * "Ready to check," never a checkmark, since it is the live, fast-signal
 * state (AI overlap + real measured motion) -- an invitation to try
 * capturing, not yet a verified match. The checkmark is reserved for
 * after a capture actually passes validation (the transition to the
 * review screen IS that confirmation). See the camera component for how
 * this is further overridden to a single consistent message while a
 * capture is actively being validated.
 */
export function routeAssistAlignmentGuidanceLabelV1(state: RouteAssistAlignmentEvidenceStateV1, lockedDirection: RouteAssistRelativeDirectionV1 | null): string {
  if (!lockedDirection) return "Pan slowly to continue capturing the work area.";
  switch (state) {
    case "UNCERTAIN":
      return "Can't confirm overlap yet — keep part of the previous view visible";
    case "MOVE_BACK":
      return "Move back slightly";
    case "KEEP_MOVING":
      return DIRECTION_COPY[lockedDirection];
    case "SLOW_DOWN":
      return "Slow down";
    case "HOLD_STEADY":
      return "Stop here — hold steady";
    case "ALIGNED":
      return "Ready to check";
  }
}

/**
 * Maps a FAILED capture-validation outcome to short, actionable homeowner
 * copy -- never the raw geometric diagnostic (correspondenceDistribution.
 * ts's own reason strings like "spread landmarks across more of the
 * shared view" are internal debugging language, logged via console.debug
 * at the call site, not shown on screen). Distinguishes the two ways a
 * geometrically-REJECTED (not a network/matching-service failure, which
 * has its own separate messages at the call site) capture can fail:
 * too few usable matches at all, vs matches that exist but didn't
 * satisfy the geometric fit.
 */
export function routeAssistCaptureFailureMessageV1(correspondenceCount: number): string {
  if (correspondenceCount < 4) {
    return "We couldn't find enough shared detail between these two photos. Try including more of the same wall, doorway, or fixture, then capture again.";
  }
  return "That view didn't line up closely enough with the previous photo. Keep more of the same area in frame, hold the phone level, and try again.";
}

/**
 * CAPTURE-DIAGNOSTICS EXPORT (real-phone request, 21 Sep 2026): "That view
 * didn't line up closely enough with the previous photo" is the SAME
 * generic on-screen copy for every geometric rejection reason -- by
 * design, per routeAssistCaptureFailureMessageV1's own doc comment, the
 * homeowner never sees the raw diagnostic. But that means a real
 * rejection's ACTUAL cause (landmark distribution vs. insufficient
 * matches vs. a genuine geometric-fit failure) has nowhere to go: it is
 * only ever computed HERE, in the browser, and only ever logged via
 * console.debug -- which never reaches any server log, since nothing in
 * this app forwards client console output anywhere (no error-tracking/
 * RUM integration exists in this codebase; confirmed by inspection, not
 * assumed). Vercel's own deployment logs capture server-side console
 * output only, and the ONE server route in this path
 * (route-assist-frame-registration-interpret) only logs on a THROWN AI
 * Gateway error -- never on a successful landmark response, which is
 * exactly the case here (routeAssistCaptureFailureMessageV1's "didn't
 * line up" message specifically requires correspondenceCount >= 4, i.e.
 * the AI call succeeded and returned landmarks; the rejection happened
 * in the CLIENT-SIDE geometric fit afterward). Deployment logs are
 * therefore structurally unable to contain this reason, regardless of
 * access -- this is a code-proven fact, not inferred from the user-
 * facing text or from an inability to reach Vercel's dashboard.
 *
 * This bundle captures EVERYTHING needed to diagnose a real rejection
 * offline, entirely client-side, with no new service and no phone
 * console: the exact previous photo and frozen candidate (the SAME
 * bytes actually sent to the registration endpoint and validated -- not
 * a re-derived approximation), the raw landmark-proposal response
 * exactly as received, the correspondences actually fed to
 * registerFrameV1, the full registration result (REGISTERED's inliers
 * or REJECTED's reason and best-effort stats), a SEPARATE direct call to
 * evaluateRouteAssistCorrespondenceDistributionV1 for its own coverage
 * metrics, every threshold the pipeline compares against, and the
 * deployed commit SHA (via the existing, already-public /api/release).
 */
type RouteAssistCaptureDiagnosticsV1 = {
  version: 1;
  capturedAtIso: string;
  deployment: { commitSha: string | null; deploymentId: string | null; target: string | null } | null;
  failureCategory: "MATCHING_SERVICE_FAILURE" | "GEOMETRIC_REJECTION";
  homeownerFacingMessage: string;
  lockedDirection: RouteAssistRelativeDirectionV1 | null;
  /**
   * The FIXED 20% ghost-crop rectangle (ghostEdgeCropRectV1) passed to
   * registerFrameV1 as expectedOverlapRegion. THIS IS A STORYBOARD/UI
   * CONVENTION, NOT A MEASUREMENT OF THE TRUE PHYSICAL OVERLAP -- the
   * actual shared area between two real photos can be wider or narrower
   * than this fixed strip. It is used only to choose which axis/bins the
   * distribution check measures spread along (see
   * correspondenceDistribution.ts's own module doc comment) -- it is
   * never used to discard, clip, or filter any landmark, and it never
   * substitutes for measuring where the real correspondences actually
   * fall. Recorded here explicitly so this exact question -- "is the
   * fixed crop being treated as the true overlap" -- can be checked
   * against REAL coordinates instead of re-argued from the code alone.
   */
  expectedOverlapRegion: RouteAssistNormalizedRectV1 | null;
  coordinateConventions: string;
  previousFrame: { width: number; height: number; dataUrl: string };
  candidateFrame: { width: number; height: number; dataUrl: string };
  registrationEndpoint: { ok: boolean; status: number; rawResponseBody: unknown };
  usedCorrespondences: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> | null;
  distributionEvaluation: RouteAssistDistributionEvaluationV1 | null;
  registrationResult: RouteAssistRegistrationResultV1 | null;
  thresholds: {
    registration: {
      minInlierCount: number;
      minInlierRatio: number;
      maxMeanReprojectionError: number;
      inlierDistanceThreshold: number;
      homographyMinRedundancy: number;
    };
    distribution: { minExtent: number; minQuadrants: number; minPairSeparation: number };
  };
};

const ROUTE_ASSIST_COORDINATE_CONVENTIONS_V1 =
  "Every point (in landmarks, correspondences, and expectedOverlapRegion) is normalized [0,1] within its OWN image's local space, origin (0,0) at that image's top-left corner, (1,1) at its bottom-right. 'from' points are in previousFrame's space; 'to' points are in candidateFrame's space. expectedOverlapRegion is expressed in previousFrame's space and is a fixed UI convention (the ghost-strip crop), not a measured overlap boundary.";

/** Builds the full diagnostic bundle. Pure given its inputs -- no fetch, no DOM -- so it is directly testable; the one network call (deployment identity) is resolved by the caller and passed in. */
function buildRouteAssistCaptureDiagnosticsV1(args: {
  deployment: { commitSha: string | null; deploymentId: string | null; target: string | null } | null;
  lockedDirection: RouteAssistRelativeDirectionV1 | null;
  expectedOverlapRegion: RouteAssistNormalizedRectV1 | null;
  previousFrame: { width: number; height: number; dataUrl: string };
  candidateFrame: { width: number; height: number; dataUrl: string };
  registrationEndpoint: { ok: boolean; status: number; rawResponseBody: unknown };
  usedCorrespondences: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> | null;
  registrationResult: RouteAssistRegistrationResultV1 | null;
}): RouteAssistCaptureDiagnosticsV1 {
  const distributionEvaluation = args.usedCorrespondences && args.usedCorrespondences.length > 0 ? evaluateRouteAssistCorrespondenceDistributionV1(args.usedCorrespondences, args.expectedOverlapRegion ?? undefined) : null;
  const failureCategory: RouteAssistCaptureDiagnosticsV1["failureCategory"] = args.registrationEndpoint.ok && Array.isArray((args.registrationEndpoint.rawResponseBody as { landmarks?: unknown } | null)?.landmarks) ? "GEOMETRIC_REJECTION" : "MATCHING_SERVICE_FAILURE";
  return {
    version: 1,
    capturedAtIso: new Date().toISOString(),
    deployment: args.deployment,
    failureCategory,
    homeownerFacingMessage: failureCategory === "GEOMETRIC_REJECTION" ? routeAssistCaptureFailureMessageV1(args.usedCorrespondences?.length ?? 0) : "We couldn't check that view against the previous photo.",
    lockedDirection: args.lockedDirection,
    expectedOverlapRegion: args.expectedOverlapRegion,
    coordinateConventions: ROUTE_ASSIST_COORDINATE_CONVENTIONS_V1,
    previousFrame: args.previousFrame,
    candidateFrame: args.candidateFrame,
    registrationEndpoint: args.registrationEndpoint,
    usedCorrespondences: args.usedCorrespondences,
    distributionEvaluation,
    registrationResult: args.registrationResult,
    thresholds: {
      registration: {
        minInlierCount: ROUTE_ASSIST_REGISTRATION_MIN_INLIER_COUNT_V1,
        minInlierRatio: ROUTE_ASSIST_REGISTRATION_MIN_INLIER_RATIO_V1,
        maxMeanReprojectionError: ROUTE_ASSIST_REGISTRATION_MAX_MEAN_REPROJECTION_ERROR_V1,
        inlierDistanceThreshold: ROUTE_ASSIST_REGISTRATION_INLIER_DISTANCE_THRESHOLD_V1,
        homographyMinRedundancy: ROUTE_ASSIST_REGISTRATION_HOMOGRAPHY_MIN_REDUNDANCY_V1,
      },
      distribution: { minExtent: ROUTE_ASSIST_MIN_DISTRIBUTION_EXTENT_V1, minQuadrants: ROUTE_ASSIST_MIN_DISTRIBUTION_QUADRANTS_V1, minPairSeparation: ROUTE_ASSIST_MIN_DISTRIBUTION_PAIR_SEPARATION_V1 },
    },
  };
}

function triggerBrowserDownloadV1(filename: string, dataUrl: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Three separate downloads -- the two full-quality photos as real,
 * directly-viewable JPEGs (so "is the ghost crop being read as the true
 * overlap" can be checked by eye against the actual images, not just
 * inferred from JSON coordinates), plus one JSON file with everything
 * structured. No zip dependency, no upload anywhere, no server round
 * trip beyond the one already-public /api/release call already resolved
 * before this is called.
 */
function downloadRouteAssistCaptureDiagnosticsV1(bundle: RouteAssistCaptureDiagnosticsV1) {
  const stamp = bundle.capturedAtIso.replace(/[:.]/g, "-");
  triggerBrowserDownloadV1(`route-assist-diagnostic-${stamp}-previous.jpg`, bundle.previousFrame.dataUrl);
  triggerBrowserDownloadV1(`route-assist-diagnostic-${stamp}-candidate.jpg`, bundle.candidateFrame.dataUrl);
  const { previousFrame, candidateFrame, ...withoutImageBytes } = bundle;
  const json = JSON.stringify({ ...withoutImageBytes, previousFrame: { width: previousFrame.width, height: previousFrame.height }, candidateFrame: { width: candidateFrame.width, height: candidateFrame.height } }, null, 2);
  const blobUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  triggerBrowserDownloadV1(`route-assist-diagnostic-${stamp}.json`, blobUrl);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
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
  validating,
  isCaptureEligibleNow,
  onProbeFrame,
  onCandidateFrame,
  onRestartDirection,
}: {
  ghostStripUrl: string | null;
  lockedDirection: RouteAssistRelativeDirectionV1 | null;
  guidanceLabel: string;
  captureEnabled: boolean;
  validating: boolean;
  isCaptureEligibleNow: () => boolean;
  onProbeFrame: (args: { downscaledDataUrl: string; motionScore: number }) => void;
  onCandidateFrame: (args: { dataUrl: string; width: number; height: number }) => Promise<boolean>;
  onRestartDirection: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const probingRef = useRef(false);
  const wasCaptureEnabledRef = useRef(false);
  const lastMotionSampleRef = useRef<ImageData | null>(null);
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

  /**
   * SHUTTER RACE FIX: freeze the EXACT current video frame into a canvas
   * FIRST -- before any validation happens -- then hand that exact frozen
   * data to the parent's validation gate, and only stop the live stream
   * (finishing the capture) if it reports the frame was accepted. On
   * rejection the stream and probe loop keep running untouched: the
   * homeowner stays on this same live screen, sees why (the parent sets a
   * notice), and can try again once genuinely re-settled -- never a
   * silent drop, and never a chance for a DIFFERENT, later live frame to
   * be the one that ends up saved.
   */
  async function takePhoto() {
    if (!isCaptureEligibleNow()) return; // RECHECK AT CAPTURE -- never trust only the button's own disabled attribute from a possibly-stale render.
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height); // the freeze -- nothing captured after this point can change what gets validated or saved
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    const width = canvas.width;
    const height = canvas.height;
    const accepted = await onCandidateFrame({ dataUrl, width, height });
    if (accepted) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  useEffect(() => {
    const interval = setInterval(async () => {
      if (probingRef.current) return;
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      probingRef.current = true;
      try {
        // REAL MOTION MEASUREMENT: computed from consecutive LIVE frames
        // directly, independent of anything the AI probe call reports.
        // No prior sample yet (the very first probe of an attempt) must
        // read as "cannot yet confirm stationary", never as "stationary".
        const sample = grabMotionSampleV1(video);
        let motionScore = 1;
        if (sample) {
          if (lastMotionSampleRef.current) {
            motionScore = computeRouteAssistFrameMotionV1(
              { data: lastMotionSampleRef.current.data, width: lastMotionSampleRef.current.width, height: lastMotionSampleRef.current.height },
              { data: sample.data, width: sample.width, height: sample.height },
            );
          }
          lastMotionSampleRef.current = sample;
        }
        const downscaled = downscaledProbeFrame(video);
        if (downscaled) onProbeFrame({ downscaledDataUrl: downscaled, motionScore });
      } finally {
        probingRef.current = false;
      }
    }, PROBE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aligned = captureEnabled;
  // ONE CONSISTENT CHECKING STATE (real-phone correction): while a
  // candidate is being validated, the badge and the bottom guidance text
  // used to keep showing whatever live label they already had ("✓
  // Aligned", "Hold steady", ...) at the same time the shutter button
  // separately said "Checking that view…" -- three surfaces disagreeing
  // about what was actually happening. All three now show the SAME
  // single message during validation; only once validation resolves
  // (accepted -> review; rejected -> evidence reset, notice shown) does
  // live guidance resume.
  const badgeLabel = validating ? "Checking…" : aligned ? "Ready to check" : "Match this edge";
  const bottomLabel = validating ? "Checking that view…" : guidanceLabel;
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
            className={`pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold ${aligned && !validating ? "bg-emerald-500 text-white" : "bg-black/70 text-white"}`}
            data-testid="route-assist-alignment-badge"
          >
            {badgeLabel}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-black/60 p-3">
          <p className={`text-sm font-semibold transition-opacity ${aligned && !validating ? "text-emerald-300" : "text-white opacity-90"}`} data-testid="route-assist-alignment-reason">
            {bottomLabel}
          </p>
        </div>
      </div>
      <button type="button" onClick={onRestartDirection} className="self-center text-xs font-medium text-slate-500 underline" data-testid="route-assist-restart-direction">
        ↺ Not the right direction? Restart
      </button>
      <button
        type="button"
        onClick={takePhoto}
        disabled={!captureEnabled || validating}
        className={`rounded-xl px-5 py-4 text-base font-semibold transition-transform duration-300 ${captureEnabled && !validating ? "bg-electric text-white" : "cursor-not-allowed bg-slate-300 text-slate-500"} ${justAligned ? "scale-105" : "scale-100"}`}
        data-testid="route-assist-alignment-shutter"
      >
        {validating ? "Checking that view…" : captureEnabled ? "Capture" : "Line up the ghost edge to capture"}
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
  const [alignmentState, setAlignmentState] = useState<RouteAssistAlignmentEvidenceStateV1>(initialRouteAssistAlignmentEvidenceStateV1().state);
  const [validating, setValidating] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [captureDiagnostics, setCaptureDiagnostics] = useState<RouteAssistCaptureDiagnosticsV1 | null>(null);

  const directionLockRef = useRef<RouteAssistDirectionLockStateV1>(initialRouteAssistDirectionLockStateV1());
  const evidenceRef = useRef<RouteAssistAlignmentEvidenceStateSnapshotV1>(initialRouteAssistAlignmentEvidenceStateV1());
  const alignmentStateRef = useRef<RouteAssistAlignmentEvidenceStateV1>(initialRouteAssistAlignmentEvidenceStateV1().state);
  const validatingRef = useRef(false);

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
    alignmentStateRef.current = initialRouteAssistAlignmentEvidenceStateV1().state;
    setLockedDirection(null);
    setAlignmentState(initialRouteAssistAlignmentEvidenceStateV1().state);
    setGhostStripUrl(null);
    setCaptureNotice(null);
    setCaptureDiagnostics(null);
  }

  /** Evidence-only reset after a FAILED capture validation -- keeps the locked direction and ghost strip (the homeowner does not need to re-find the edge, only re-settle into a genuinely valid Hold steady / Aligned before trying again). */
  function resetEvidenceAfterValidationFailureV1() {
    evidenceRef.current = initialRouteAssistAlignmentEvidenceStateV1();
    alignmentStateRef.current = initialRouteAssistAlignmentEvidenceStateV1().state;
    setAlignmentState(initialRouteAssistAlignmentEvidenceStateV1().state);
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
  async function handleAlignmentProbeFrame(args: { downscaledDataUrl: string; motionScore: number }): Promise<void> {
    const previousFrame = frames[frames.length - 1];
    if (!previousFrame) return;
    try {
      const response = await fetch("/api/dev-fixtures/route-assist-frame-overlap-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDataUrl: previousFrame.dataUrl, toDataUrl: args.downscaledDataUrl, evidenceDescription: EVIDENCE_DESCRIPTION }),
      });
      const body = (await response.json().catch(() => null)) as { assessment?: OverlapAssessmentResponseV1 } | null;
      if (!response.ok || !body?.assessment) {
        evidenceRef.current = initialRouteAssistAlignmentEvidenceStateV1();
        alignmentStateRef.current = initialRouteAssistAlignmentEvidenceStateV1().state;
        setAlignmentState(initialRouteAssistAlignmentEvidenceStateV1().state);
        return;
      }
      const assessment = body.assessment;
      const probe = { matched: assessment.matched, confidence: assessment.confidence, overlapFraction: assessment.matched ? assessment.overlapFraction : 0, motionScore: args.motionScore };

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
      alignmentStateRef.current = initialRouteAssistAlignmentEvidenceStateV1().state;
      setAlignmentState(initialRouteAssistAlignmentEvidenceStateV1().state);
    }
  }

  /** RECHECK AT CAPTURE: read straight from the refs, not a possibly-stale prop closure -- the freshest known evidence state at the exact moment of the tap. Also refuses a second overlapping attempt while one candidate frame is already being validated. */
  function isCaptureEligibleNow(): boolean {
    return alignmentStateRef.current === "ALIGNED" && directionLockRef.current.locked !== null && !validatingRef.current;
  }

  /**
   * THE CAPTURE-VALIDATION GATE (fixes the confirmed false-alignment
   * gap): the AI overlap probe never gets the final word here. Given the
   * EXACT frozen candidate frame from takePhoto(), this calls the real
   * landmark-proposal endpoint and then the unchanged, already-proven
   * registerFrameV1 geometric fit -- only a REGISTERED outcome saves the
   * frame. Returns whether the frame was accepted so the camera component
   * knows whether to stop its stream (accepted) or keep running (rejected
   * -- stay in capture with guidance, per this pass's requirement).
   */
  async function handleCandidateFrame(args: { dataUrl: string; width: number; height: number }): Promise<boolean> {
    if (!isCaptureEligibleNow()) return false; // defensive: mirrors the camera's own recheck
    const previousFrame = frames[frames.length - 1];
    if (!previousFrame) return false;

    validatingRef.current = true;
    setValidating(true);
    setCaptureNotice(null);
    setCaptureDiagnostics(null);
    const expectedOverlapRegion = lockedDirection ? ghostEdgeCropRectV1(lockedDirection) : null;
    // Resolved once, alongside the registration call, so a diagnostics
    // bundle (if this candidate is rejected) already has the deployed SHA
    // without an extra round trip later. /api/release is the SAME public,
    // ungated endpoint release tooling elsewhere in this app already uses
    // for this exact purpose.
    const deploymentPromise = fetch("/api/release")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { commitSha?: string | null; deploymentId?: string | null; target?: string | null } | null) => (body ? { commitSha: body.commitSha ?? null, deploymentId: body.deploymentId ?? null, target: body.target ?? null } : null))
      .catch(() => null);
    try {
      const response = await fetch("/api/dev-fixtures/route-assist-frame-registration-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDataUrl: previousFrame.dataUrl, toDataUrl: args.dataUrl }),
      });
      const rawResponseBody = await response.json().catch(() => null);
      const body = rawResponseBody as { landmarks?: unknown } | null;
      if (!response.ok || !Array.isArray(body?.landmarks)) {
        setCaptureNotice("We couldn't check that view against the previous photo. Hold steady and try again.");
        setCaptureDiagnostics(
          buildRouteAssistCaptureDiagnosticsV1({
            deployment: await deploymentPromise,
            lockedDirection,
            expectedOverlapRegion,
            previousFrame: { width: previousFrame.width, height: previousFrame.height, dataUrl: previousFrame.dataUrl },
            candidateFrame: { width: args.width, height: args.height, dataUrl: args.dataUrl },
            registrationEndpoint: { ok: response.ok, status: response.status, rawResponseBody },
            usedCorrespondences: null,
            registrationResult: null,
          }),
        );
        resetEvidenceAfterValidationFailureV1();
        return false;
      }
      const correspondences = body.landmarks.filter(isValidLandmarkV1).map((landmark) => ({ from: landmark.fromPoint, to: landmark.toPoint }));
      const registration = registerFrameV1({
        correspondences,
        fromAspectRatio: previousFrame.width / previousFrame.height,
        toAspectRatio: args.width / args.height,
        expectedOverlapRegion: expectedOverlapRegion ?? undefined,
      });
      if (registration.outcome !== "REGISTERED") {
        // The RAW reason (registration.reason / correspondenceDistribution.ts's
        // own diagnostic text) is dev-diagnostic detail, not homeowner
        // copy -- see routeAssistCaptureFailureMessageV1's own doc
        // comment for why it stays out of the on-screen notice. The FULL
        // detail (raw landmarks, correspondences, the complete
        // registration result, every threshold) goes into the downloadable
        // diagnostics bundle instead -- see buildRouteAssistCaptureDiagnosticsV1's
        // own doc comment for why console.debug alone was insufficient.
        console.debug("Route Assist capture validation rejected:", registration.reason, registration);
        setCaptureNotice(routeAssistCaptureFailureMessageV1(correspondences.length));
        setCaptureDiagnostics(
          buildRouteAssistCaptureDiagnosticsV1({
            deployment: await deploymentPromise,
            lockedDirection,
            expectedOverlapRegion,
            previousFrame: { width: previousFrame.width, height: previousFrame.height, dataUrl: previousFrame.dataUrl },
            candidateFrame: { width: args.width, height: args.height, dataUrl: args.dataUrl },
            registrationEndpoint: { ok: response.ok, status: response.status, rawResponseBody },
            usedCorrespondences: correspondences,
            registrationResult: registration,
          }),
        );
        resetEvidenceAfterValidationFailureV1();
        return false;
      }

      const imageId = `frame-${Date.now()}`;
      setFrames((existing) => [...existing, { imageId, dataUrl: args.dataUrl, width: args.width, height: args.height }]);
      setStage("REVIEW");
      return true;
    } catch {
      setCaptureNotice("We couldn't check that view against the previous photo. Check your connection and try again.");
      setCaptureDiagnostics(
        buildRouteAssistCaptureDiagnosticsV1({
          deployment: await deploymentPromise,
          lockedDirection,
          expectedOverlapRegion,
          previousFrame: { width: previousFrame.width, height: previousFrame.height, dataUrl: previousFrame.dataUrl },
          candidateFrame: { width: args.width, height: args.height, dataUrl: args.dataUrl },
          registrationEndpoint: { ok: false, status: 0, rawResponseBody: null },
          usedCorrespondences: null,
          registrationResult: null,
        }),
      );
      resetEvidenceAfterValidationFailureV1();
      return false;
    } finally {
      validatingRef.current = false;
      setValidating(false);
    }
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
          <div className="flex flex-col gap-2">
            <RouteAssistGhostAlignmentCameraV1
              ghostStripUrl={ghostStripUrl}
              lockedDirection={lockedDirection}
              guidanceLabel={guidanceLabel}
              captureEnabled={captureEnabled}
              validating={validating}
              isCaptureEligibleNow={isCaptureEligibleNow}
              onProbeFrame={handleAlignmentProbeFrame}
              onCandidateFrame={handleCandidateFrame}
              onRestartDirection={restartDirection}
            />
            {captureNotice && (
              <p className="rounded-lg bg-red-50 p-2 text-center text-sm text-red-700" data-testid="route-assist-capture-notice">
                {captureNotice}
              </p>
            )}
            {captureDiagnostics && (
              <button
                type="button"
                onClick={() => downloadRouteAssistCaptureDiagnosticsV1(captureDiagnostics)}
                className="self-center rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 underline"
                data-testid="route-assist-download-diagnostics"
              >
                Download capture diagnostics
              </button>
            )}
          </div>
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
