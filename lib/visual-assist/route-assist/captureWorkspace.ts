import { evaluateRouteAssistPhotoEscalationV1, type RouteAssistCaptureEscalationResultV1 } from "./captureEscalation";
import {
  evaluateRouteAssistFrameOverlapV1,
  evaluateRouteAssistGuidedContinuationChainV1,
  type RouteAssistContinuationFrameV1,
  type RouteAssistFrameOverlapObservationV1,
} from "./frameContinuation";
import type { RouteAssistFactStoreV1 } from "./factModel";

/**
 * CAPTURE-COMPLETENESS / ROUTE-EVALUATION SEPARATION (product direction:
 * capture-the-work-area-first).
 *
 * Real-phone finding this corrects: with multiple intended destinations
 * placed on the FIRST photo, every leg (A->B, A->C, A->D) was evaluated
 * against that one photo immediately, so legs whose real evidence needed a
 * second photo were reported as needing ANOTHER photo before the homeowner
 * had even finished telling Route Assist the work area was fully captured.
 * That's backwards: whether enough of the WORK AREA has been photographed
 * is a question about the CAPTURE, not about any one leg's topology, and it
 * must be answered (and only answered) before any leg is evaluated at all.
 *
 * This module is that boundary. A RouteAssistCaptureWorkspaceV1 tracks
 * ordered frames and the validated overlap links between them -- capture
 * concerns only, no anchors, no WALL_PLANE/CORNER/doorway facts, nothing a
 * leg evaluation would need. `captureComplete` is homeowner-declared, never
 * inferred, and evaluateRouteAssistWorkspaceLegV1 below REFUSES outright
 * while it is false: there is no path through this module that lets a leg
 * get evaluated against an image set the homeowner hasn't yet said is done.
 *
 * Anchor placement (photoMarkerState.ts) already needed no changes for
 * this: every RouteAssistPhotoMarkerV1 already carries its own `imageId`,
 * and routeAssistPhotoMarkersToFactWritesV1 already writes each anchor's
 * point with that marker's own frame -- markers were frame-scoped from the
 * start. What was missing was purely this capture/evaluation boundary.
 */

export type RouteAssistCaptureWorkspaceFrameV1 = { imageId: string; order: number };

export type RouteAssistCaptureWorkspaceV1 = {
  frames: RouteAssistCaptureWorkspaceFrameV1[];
  /** Validated links between CONSECUTIVE frames only -- see addRouteAssistCaptureWorkspaceFrameV1. */
  overlapLinks: RouteAssistFrameOverlapObservationV1[];
  /** Homeowner-declared, never inferred. See markRouteAssistCaptureWorkspaceCompleteV1. */
  captureComplete: boolean;
};

/** legScopeId used only for workspace-level (capture-time) overlap checks -- never a real Route Assist leg. */
export const ROUTE_ASSIST_CAPTURE_WORKSPACE_SCOPE_V1 = "__route-assist-capture-workspace__";

export function emptyRouteAssistCaptureWorkspaceV1(): RouteAssistCaptureWorkspaceV1 {
  return { frames: [], overlapLinks: [], captureComplete: false };
}

export type RouteAssistCaptureWorkspaceAddFrameResultV1 =
  | { outcome: "ADDED"; workspace: RouteAssistCaptureWorkspaceV1 }
  | { outcome: "REFUSED"; workspace: RouteAssistCaptureWorkspaceV1; problem: string };

/**
 * Appends a frame. The FIRST frame needs no overlap evidence -- there is
 * nothing yet for it to connect to. Every frame after that REQUIRES a
 * validated overlap observation tying it back to the immediately preceding
 * frame (evaluateRouteAssistFrameOverlapV1, unchanged from frameContinuation.
 * ts -- same confidence floor, same "explicit structural tie, never
 * co-occurrence" discipline). A frame whose overlap does not resolve to
 * CONNECTED is REFUSED, not added with a note -- this is the "do not
 * silently stitch disconnected views" requirement enforced at the one point
 * it can actually be enforced: before the frame ever becomes part of the
 * workspace.
 */
export function addRouteAssistCaptureWorkspaceFrameV1(args: {
  workspace: RouteAssistCaptureWorkspaceV1;
  imageId: string;
  overlapFromPrevious?: RouteAssistFrameOverlapObservationV1;
}): RouteAssistCaptureWorkspaceAddFrameResultV1 {
  const { workspace } = args;
  if (workspace.captureComplete) {
    return { outcome: "REFUSED", workspace, problem: "cannot add a frame after the work area has been marked fully captured" };
  }
  if (workspace.frames.some((frame) => frame.imageId === args.imageId)) {
    return { outcome: "REFUSED", workspace, problem: `frame ${args.imageId} has already been added to this workspace` };
  }

  const previous = workspace.frames[workspace.frames.length - 1];
  if (!previous) {
    return { outcome: "ADDED", workspace: { ...workspace, frames: [{ imageId: args.imageId, order: 1 }] } };
  }

  if (!args.overlapFromPrevious) {
    return { outcome: "REFUSED", workspace, problem: `frame ${args.imageId} requires a validated overlap observation back to ${previous.imageId} before it can be added` };
  }
  // The caller's overlap observation describes the frames/evidence it
  // actually assessed; its own legScopeId is irrelevant to a workspace-level
  // (anchor-free) capture check, so it's normalized to this module's own
  // scope constant here rather than requiring every caller to know about it.
  const normalizedObservation: RouteAssistFrameOverlapObservationV1 = { ...args.overlapFromPrevious, legScopeId: ROUTE_ASSIST_CAPTURE_WORKSPACE_SCOPE_V1 };
  const link = evaluateRouteAssistFrameOverlapV1({
    legScopeId: ROUTE_ASSIST_CAPTURE_WORKSPACE_SCOPE_V1,
    fromImageId: previous.imageId,
    toImageId: args.imageId,
    observations: [normalizedObservation],
  });
  if (link.outcome === "UNRESOLVED") {
    return {
      outcome: "REFUSED",
      workspace,
      problem: `frame ${args.imageId} does not have a sufficiently confident, structurally-tied overlap back to ${previous.imageId}: ${link.reason}`,
    };
  }
  return {
    outcome: "ADDED",
    workspace: {
      ...workspace,
      frames: [...workspace.frames, { imageId: args.imageId, order: previous.order + 1 }],
      overlapLinks: [...workspace.overlapLinks, normalizedObservation],
    },
  };
}

export type RouteAssistCaptureWorkspaceCompleteResultV1 =
  | { outcome: "MARKED_COMPLETE"; workspace: RouteAssistCaptureWorkspaceV1 }
  | { outcome: "REFUSED"; workspace: RouteAssistCaptureWorkspaceV1; problem: string };

/**
 * The homeowner's own "entire work area captured" declaration -- the ONLY
 * way captureComplete becomes true. Refuses on zero frames (nothing was
 * ever captured); otherwise always succeeds, exactly as many frames as the
 * homeowner chose to take, whether that's one or several. This function
 * never second-guesses "should the homeowner really be done yet" -- see the
 * module doc comment and the task's own "do not force guided continuation
 * just because Route Assist thinks another photo might help" instruction.
 */
export function markRouteAssistCaptureWorkspaceCompleteV1(workspace: RouteAssistCaptureWorkspaceV1): RouteAssistCaptureWorkspaceCompleteResultV1 {
  if (workspace.frames.length === 0) {
    return { outcome: "REFUSED", workspace, problem: "cannot mark the work area captured before at least one frame has been taken" };
  }
  return { outcome: "MARKED_COMPLETE", workspace: { ...workspace, captureComplete: true } };
}

export function frameOrderForImageV1(workspace: RouteAssistCaptureWorkspaceV1, imageId: string): number | null {
  return workspace.frames.find((frame) => frame.imageId === imageId)?.order ?? null;
}

/**
 * legScopeId as seen by ONE frame's own local contribution to a cross-frame
 * leg -- see evaluateRouteAssistWorkspaceLegV1's doc comment for why a leg
 * spanning multiple frames is decomposed this way rather than sharing one
 * legScopeId across frames (which would collide: WALL_PLANE/BASEBOARD_
 * CONTINUITY are written once per legScopeId and lock on write).
 */
export function routeAssistFrameScopedLegIdV1(legScopeId: string, imageId: string): string {
  return `${legScopeId}@${imageId}`;
}

export type RouteAssistWorkspaceLegEvaluationV1 =
  | { outcome: "CAPTURE_INCOMPLETE" }
  | { outcome: "UNKNOWN_FRAME"; imageId: string }
  | { outcome: "EVALUATED"; result: RouteAssistCaptureEscalationResultV1 };

const ESCALATION_SEVERITY_RANK_V1 = ["PHOTO_SUFFICIENT", "WORLD_GEOMETRY_REQUIRED", "GUIDED_CONTINUATION_REQUIRED", "TARGETED_PHOTO_REQUIRED", "REVIEW_REQUIRED", "SWEEP_REQUIRED"] as const;

function worseEscalationV1(a: RouteAssistCaptureEscalationResultV1, b: RouteAssistCaptureEscalationResultV1): RouteAssistCaptureEscalationResultV1 {
  const rankA = ESCALATION_SEVERITY_RANK_V1.indexOf(a.escalation);
  const rankB = ESCALATION_SEVERITY_RANK_V1.indexOf(b.escalation);
  if (rankA === rankB) return { ...a, missingFactTypes: [...new Set([...a.missingFactTypes, ...b.missingFactTypes])] };
  return rankA > rankB ? a : b;
}

/**
 * The CAPTURE COMPLETENESS / ROUTE EVALUATION boundary. This is the only
 * entry point a caller should use to evaluate a leg once anchors are
 * placed on a captured workspace -- it refuses outright
 * (CAPTURE_INCOMPLETE) while workspace.captureComplete is false, no matter
 * what facts already happen to be written. There is deliberately no way to
 * reach evaluateRouteAssistPhotoEscalationV1's real result through this
 * function before that flag is true.
 *
 * SAME-FRAME LEGS (source and destination anchor on the same captured
 * frame -- the common case; multiple destinations were all placed on the
 * one first photo in the real-phone finding this corrects) delegate
 * directly to evaluateRouteAssistPhotoEscalationV1 using `legScopeId`
 * exactly as before. This is completely unchanged from the single-photo
 * tier -- existing behavior, existing tests, untouched.
 *
 * CROSS-FRAME LEGS (source and destination anchors on DIFFERENT captured
 * frames) rely on a key fact the workspace already guarantees by
 * construction: every consecutive frame pair between them was validated as
 * CONNECTED before either frame was ever added (addRouteAssistCapture
 * WorkspaceFrameV1). Re-checking that chain here (via the UNCHANGED
 * evaluateRouteAssistGuidedContinuationChainV1) is therefore a pure
 * consistency check, not new stitching logic. What genuinely differs
 * frame-to-frame is each endpoint frame's own LOCAL structural evidence --
 * is there a clear supported path from A to wherever this frame's content
 * ends, and from wherever the next frame's content begins to the real
 * destination. The caller is expected to have already applied each
 * relevant frame's OWN semantics into its own frame-scoped sub-leg id
 * (routeAssistFrameScopedLegIdV1) via the UNCHANGED livePhotoFactAdapter.ts
 * -- this function only reads whatever facts already exist there, exactly
 * like the single-frame case reads whatever the (one) frame's adapter call
 * already wrote. The overall outcome is the WORST (most escalated) of the
 * two endpoint frames' own local results, folded together with the
 * chain-connectivity result -- a genuinely unresolved link anywhere in the
 * span outranks anything either endpoint frame reports on its own.
 */
export function evaluateRouteAssistWorkspaceLegV1(args: {
  workspace: RouteAssistCaptureWorkspaceV1;
  store: RouteAssistFactStoreV1;
  legScopeId: string;
  sourceScopeId: string;
  destinationScopeId: string;
  sourceImageId: string;
  destinationImageId: string;
}): RouteAssistWorkspaceLegEvaluationV1 {
  if (!args.workspace.captureComplete) return { outcome: "CAPTURE_INCOMPLETE" };

  const sourceOrder = frameOrderForImageV1(args.workspace, args.sourceImageId);
  const destinationOrder = frameOrderForImageV1(args.workspace, args.destinationImageId);
  if (sourceOrder === null) return { outcome: "UNKNOWN_FRAME", imageId: args.sourceImageId };
  if (destinationOrder === null) return { outcome: "UNKNOWN_FRAME", imageId: args.destinationImageId };

  if (sourceOrder === destinationOrder) {
    const result = evaluateRouteAssistPhotoEscalationV1({ store: args.store, legScopeId: args.legScopeId, sourceScopeId: args.sourceScopeId, destinationScopeId: args.destinationScopeId });
    return { outcome: "EVALUATED", result };
  }

  const lo = Math.min(sourceOrder, destinationOrder);
  const hi = Math.max(sourceOrder, destinationOrder);
  const spanFrames: RouteAssistContinuationFrameV1[] = args.workspace.frames
    .filter((frame) => frame.order >= lo && frame.order <= hi)
    .map((frame) => ({ imageId: frame.imageId, order: frame.order }));

  const sourceFrameId = sourceOrder < destinationOrder ? args.sourceImageId : args.destinationImageId;
  const destinationFrameId = sourceOrder < destinationOrder ? args.destinationImageId : args.sourceImageId;
  const sourceFrameResult = evaluateRouteAssistPhotoEscalationV1({
    store: args.store,
    legScopeId: routeAssistFrameScopedLegIdV1(args.legScopeId, sourceFrameId),
    sourceScopeId: args.sourceScopeId,
    destinationScopeId: args.destinationScopeId,
  });
  const destinationFrameResult = evaluateRouteAssistPhotoEscalationV1({
    store: args.store,
    legScopeId: routeAssistFrameScopedLegIdV1(args.legScopeId, destinationFrameId),
    sourceScopeId: args.sourceScopeId,
    destinationScopeId: args.destinationScopeId,
  });
  const endpointResult = worseEscalationV1(sourceFrameResult, destinationFrameResult);

  const chain = evaluateRouteAssistGuidedContinuationChainV1({
    legScopeId: ROUTE_ASSIST_CAPTURE_WORKSPACE_SCOPE_V1,
    frames: spanFrames,
    overlapObservations: args.workspace.overlapLinks,
    lastFrameEscalation: endpointResult,
  });

  if (chain.outcome === "SWEEP_REQUIRED") return { outcome: "EVALUATED", result: { escalation: "SWEEP_REQUIRED", reason: chain.reason, missingFactTypes: [] } };
  if (chain.outcome === "GUIDED_CONTINUATION_REQUIRED") {
    // A cross-frame leg whose own frame chain is already known-connected
    // (by construction) should never re-ask for MORE continuation here --
    // this branch only fires if the defensive re-check above somehow
    // disagreed with the workspace's own recorded links, which is itself a
    // genuine inconsistency worth surfacing rather than silently resolving.
    return { outcome: "EVALUATED", result: { escalation: "REVIEW_REQUIRED", reason: `workspace overlap chain disagreement: ${chain.reason}`, missingFactTypes: [] } };
  }
  if (chain.outcome === "LEG_LOCAL") return { outcome: "EVALUATED", result: chain.escalation };
  // chain.outcome === "PHOTO_SUFFICIENT": the frame-to-frame chain itself is
  // fully connected, so the overall result is exactly the endpoint frames'
  // own local evidence, unchanged.
  return { outcome: "EVALUATED", result: endpointResult };
}
