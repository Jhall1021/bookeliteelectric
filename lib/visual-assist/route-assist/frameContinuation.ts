import type { RouteAssistCaptureEscalationResultV1 } from "./captureEscalation";

/**
 * Guided-continuation multi-frame architecture (product direction: minimal
 * guided overlap captures, not continuous sweep, as the default fallback).
 *
 * Modern phone cameras have a wide field of view, so most residential legs
 * should resolve from one photo. When one photo genuinely cannot show the
 * whole route, the preferred fallback is a SMALL, ordered sequence of
 * overlapping still photos -- each guided toward the part of the route the
 * prior photo didn't reach -- rather than a continuous sweep or world-
 * tracking session. This module is the architecture for that sequence:
 * which frames exist, in what order, what stable structural evidence ties
 * each consecutive pair together, and the deterministic rule for when that
 * chain is complete versus when it genuinely cannot be established from
 * stills alone.
 *
 * This module never talks to a provider and never writes Route Assist
 * facts. It composes on top of two things that already exist and are
 * UNCHANGED by this module: evaluateRouteAssistPhotoEscalationV1
 * (captureEscalation.ts), which still decides one frame's own local
 * evidence exactly as before, and the same "trust only an explicit,
 * structured, sufficiently-confident assertion -- never co-occurrence or
 * omission" discipline livePhotoFactAdapter.ts already established for a
 * single photo's facts. A frame-overlap claim gets no less scrutiny than a
 * doorway or corner claim does.
 */

/**
 * Closed set of stable, route-relevant structural evidence kinds a frame
 * overlap may be anchored on. This is deliberately the same vocabulary the
 * product direction names -- corners, transitions, doorway casings, window
 * edges, ceiling/wall lines, previously-placed route anchors or features --
 * not a new, separate taxonomy of "overlap object kinds." Arbitrary pixel
 * overlap is never sufficient on its own; every accepted link must name one
 * of these.
 */
export const ROUTE_ASSIST_FRAME_OVERLAP_EVIDENCE_KINDS_V1 = [
  "CORNER",
  "WALL_CEILING_TRANSITION",
  "DOORWAY_CASING",
  "WINDOW_EDGE",
  "CEILING_WALL_LINE",
  "ROUTE_ANCHOR",
  "PLACED_FEATURE",
] as const;
export type RouteAssistFrameOverlapEvidenceKindV1 = (typeof ROUTE_ASSIST_FRAME_OVERLAP_EVIDENCE_KINDS_V1)[number];

/**
 * Same discipline as CONSERVATIVE_EVIDENCE_CONFIDENCE_FLOOR_V1 in
 * livePhotoFactAdapter.ts -- reused as the same named bar, not re-derived,
 * since it means the identical thing: "sufficiently confident to act on,"
 * for a structural claim that determines what gets written or escalated.
 */
export const ROUTE_ASSIST_FRAME_OVERLAP_CONFIDENCE_FLOOR_V1 = 0.75;

/** One ordered still frame captured for one leg's guided-continuation sequence. */
export type RouteAssistContinuationFrameV1 = {
  imageId: string;
  /** 1-based capture order within this leg's sequence. */
  order: number;
};

/**
 * An EXPLICIT provider assertion that a specific piece of stable structural
 * evidence, visible in `fromImageId`, is the SAME physical feature visible
 * in `toImageId` -- never inferred from both images merely containing an
 * object of the same kind, and never averaged from partial identity.
 * `fromObjectId`/`toObjectId` name the actual scene objects (as reported in
 * each frame's own RouteAssistVisibleSceneSemanticsV1) that the provider is
 * claiming are one physical feature seen twice, from two capture positions.
 */
export type RouteAssistFrameOverlapObservationV1 = {
  legScopeId: string;
  fromImageId: string;
  toImageId: string;
  evidenceKind: RouteAssistFrameOverlapEvidenceKindV1;
  fromObjectId: string;
  toObjectId: string;
  confidence: number;
};

export type RouteAssistFrameOverlapLinkResultV1 =
  | { outcome: "CONNECTED"; evidenceKind: RouteAssistFrameOverlapEvidenceKindV1; confidence: number; fromObjectId: string; toObjectId: string }
  | { outcome: "UNRESOLVED"; reason: string };

/**
 * Deterministic rule for whether two consecutive frames are connected.
 *
 * CONNECTED requires a SINGLE explicit RouteAssistFrameOverlapObservationV1
 * naming this exact legScopeId + fromImageId/toImageId pair, a real
 * evidenceKind, both a from- and to- object identity, and confidence at or
 * above the floor. Anything short of that -- no observation at all, low
 * confidence, a one-sided identity -- is UNRESOLVED. This function never
 * guesses, never falls back to pixel/geometric overlap, and never partially
 * credits weak evidence into a pass: an unresolved boundary must be
 * reported as such, not silently stitched.
 */
export function evaluateRouteAssistFrameOverlapV1(args: {
  legScopeId: string;
  fromImageId: string;
  toImageId: string;
  observations: readonly RouteAssistFrameOverlapObservationV1[];
}): RouteAssistFrameOverlapLinkResultV1 {
  const match = args.observations.find(
    (observation) =>
      observation.legScopeId === args.legScopeId &&
      observation.fromImageId === args.fromImageId &&
      observation.toImageId === args.toImageId &&
      observation.confidence >= ROUTE_ASSIST_FRAME_OVERLAP_CONFIDENCE_FLOOR_V1 &&
      Boolean(observation.fromObjectId) &&
      Boolean(observation.toObjectId),
  );
  if (!match) {
    return {
      outcome: "UNRESOLVED",
      reason: `no sufficiently confident, structurally-tied overlap observation connects ${args.fromImageId} to ${args.toImageId} for ${args.legScopeId}`,
    };
  }
  return { outcome: "CONNECTED", evidenceKind: match.evidenceKind, confidence: match.confidence, fromObjectId: match.fromObjectId, toObjectId: match.toObjectId };
}

/**
 * After this many consecutive failed overlap attempts at the SAME boundary
 * (the homeowner tried to reconnect from the last confirmed frame and the
 * provider still could not confidently tie the new frame back to it), guided
 * still capture is considered exhausted for this boundary and the chain
 * escalates to a genuine SWEEP_REQUIRED rather than asking indefinitely.
 */
export const ROUTE_ASSIST_GUIDED_CONTINUATION_MAX_OVERLAP_ATTEMPTS_V1 = 2;

/**
 * Preferred escalation hierarchy (product direction, capture-tier ceiling):
 * PHOTO_SUFFICIENT < GUIDED_CONTINUATION_REQUIRED < SWEEP_REQUIRED <
 * WORLD_GEOMETRY_REQUIRED. Continuous sweep/world tracking is the rare last
 * resort, not the default fallback.
 */
export type RouteAssistGuidedContinuationChainOutcomeV1 =
  | { outcome: "PHOTO_SUFFICIENT"; reason: string; frameCount: number }
  | {
      outcome: "GUIDED_CONTINUATION_REQUIRED";
      reason: string;
      /** The frame the homeowner should keep visible while moving toward the rest of the route. */
      continueFromImageId: string;
      /**
       * UNRESOLVED_OVERLAP: the most recently captured frame does not yet
       * tie back to the chain with sufficient confidence -- request a BETTER
       * recapture of this same boundary, never a silent stitch.
       * DESTINATION_NOT_YET_REACHED: every captured frame connects cleanly,
       * but the last frame's own local evidence (captureEscalation.ts) says
       * the route still continues beyond it -- request the NEXT overlapping
       * frame.
       */
      boundary: "UNRESOLVED_OVERLAP" | "DESTINATION_NOT_YET_REACHED";
    }
  | { outcome: "SWEEP_REQUIRED"; reason: string }
  /**
   * Passthrough for leg-local outcomes this chain function does not
   * reinterpret (TARGETED_PHOTO_REQUIRED, REVIEW_REQUIRED,
   * WORLD_GEOMETRY_REQUIRED): these describe the CURRENT frame's own
   * evidence, not a cross-frame continuation question, so the caller
   * handles them exactly as it would for a single-photo leg.
   */
  | { outcome: "LEG_LOCAL"; escalation: RouteAssistCaptureEscalationResultV1 };

/**
 * Combines each captured frame's OWN local escalation (evaluateRouteAssist
 * PhotoEscalationV1, unchanged, evaluated by the caller against whatever
 * facts that frame's photo contributed) with the overlap links between
 * consecutive frames into one overall chain result for the leg.
 *
 * Rule order, deliberate:
 *   1. Walk every consecutive frame pair. The first UNRESOLVED link stops
 *      the chain right there -- overlap is never silently stitched past a
 *      gap. If that unresolved boundary is the MOST RECENT one (the
 *      homeowner's latest attempt) and it has already failed
 *      ROUTE_ASSIST_GUIDED_CONTINUATION_MAX_OVERLAP_ATTEMPTS_V1 times,
 *      guided still capture is exhausted for this boundary and the chain
 *      escalates to a genuine SWEEP_REQUIRED -- "no reliable shared
 *      structural evidence" is exactly the case sequential stills cannot
 *      safely resolve. Otherwise it is GUIDED_CONTINUATION_REQUIRED with
 *      boundary "UNRESOLVED_OVERLAP", asking for a better-connected retry
 *      of the SAME boundary, not a new frame further on.
 *   2. If every captured link is CONNECTED (or there is only one frame),
 *      the LAST frame's own local escalation decides what happens next:
 *        - PHOTO_SUFFICIENT there means the whole chain is done.
 *        - GUIDED_CONTINUATION_REQUIRED there (captureEscalation.ts's own
 *          corner-transition-leaves-frame case) means the route keeps
 *          going; report boundary "DESTINATION_NOT_YET_REACHED" so the
 *          caller guides the homeowner to the next overlap frame.
 *        - SWEEP_REQUIRED there (an unanchored plane break -- no identified
 *          transition to guide a continuation toward) propagates unchanged:
 *          the genuine ceiling case sequential stills cannot safely resolve.
 *        - Anything else (TARGETED_PHOTO_REQUIRED, REVIEW_REQUIRED,
 *          WORLD_GEOMETRY_REQUIRED) passes through as LEG_LOCAL, deliberately
 *          not reinterpreted here.
 */
export function evaluateRouteAssistGuidedContinuationChainV1(args: {
  legScopeId: string;
  frames: readonly RouteAssistContinuationFrameV1[];
  overlapObservations: readonly RouteAssistFrameOverlapObservationV1[];
  lastFrameEscalation: RouteAssistCaptureEscalationResultV1;
  /**
   * How many consecutive UNRESOLVED overlap attempts have already been made
   * to connect the LAST frame back to the chain. Defaults to 1 (this IS the
   * first attempt at this boundary) so a caller that never tracks retries
   * still gets the ordinary GUIDED_CONTINUATION_REQUIRED behavior.
   */
  failedOverlapAttemptsAtLastBoundary?: number;
}): RouteAssistGuidedContinuationChainOutcomeV1 {
  const ordered = [...args.frames].sort((a, b) => a.order - b.order);

  for (let i = 1; i < ordered.length; i += 1) {
    const from = ordered[i - 1];
    const to = ordered[i];
    const link = evaluateRouteAssistFrameOverlapV1({
      legScopeId: args.legScopeId,
      fromImageId: from.imageId,
      toImageId: to.imageId,
      observations: args.overlapObservations,
    });
    if (link.outcome === "UNRESOLVED") {
      const isMostRecentBoundary = i === ordered.length - 1;
      const attempts = isMostRecentBoundary ? (args.failedOverlapAttemptsAtLastBoundary ?? 1) : 1;
      if (isMostRecentBoundary && attempts >= ROUTE_ASSIST_GUIDED_CONTINUATION_MAX_OVERLAP_ATTEMPTS_V1) {
        return {
          outcome: "SWEEP_REQUIRED",
          reason: `no reliable shared structural evidence connects frame ${to.imageId} back to ${from.imageId} after ${attempts} guided-continuation attempts; sequential still photos cannot safely establish this part of the route`,
        };
      }
      return {
        outcome: "GUIDED_CONTINUATION_REQUIRED",
        reason: `frame ${to.imageId} does not yet have a sufficiently confident, structurally-tied connection back to ${from.imageId}: ${link.reason}`,
        continueFromImageId: from.imageId,
        boundary: "UNRESOLVED_OVERLAP",
      };
    }
  }

  const last = args.lastFrameEscalation;
  const lastImageId = ordered[ordered.length - 1]?.imageId ?? "";
  if (last.escalation === "PHOTO_SUFFICIENT") {
    return { outcome: "PHOTO_SUFFICIENT", reason: "every captured frame is structurally connected to the last, and the final frame's own leg evaluation is fully resolved", frameCount: ordered.length };
  }
  if (last.escalation === "GUIDED_CONTINUATION_REQUIRED") {
    return { outcome: "GUIDED_CONTINUATION_REQUIRED", reason: last.reason, continueFromImageId: lastImageId, boundary: "DESTINATION_NOT_YET_REACHED" };
  }
  if (last.escalation === "SWEEP_REQUIRED") {
    return { outcome: "SWEEP_REQUIRED", reason: last.reason };
  }
  return { outcome: "LEG_LOCAL", escalation: last };
}
