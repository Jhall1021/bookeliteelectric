import type { RouteAssistSweepCaptureHandoffV1 } from "./captureHandoff";
import { buildVisibleTrimRouteOverlayV1, type RouteAssistVisibleTrimRouteOverlayV1 } from "./visibleTrimRouteOverlay";
import { proposeVisibleTrimHuggingRouteV1, type RouteAssistVisibleTrimRouteProposalV1 } from "./visibleTrimRouteProposal";
import {
  runRouteAssistVisibleSceneProviderV1,
  type RouteAssistVisibleSceneProviderInputV1,
  type RouteAssistVisibleSceneProviderV1,
} from "./visibleSceneProvider";
import type { RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";

export type RouteAssistVisibleSceneReviewPipelineV1 = {
  providerKey: string;
  semantics: RouteAssistVisibleSceneSemanticsV1 | null;
  proposal: RouteAssistVisibleTrimRouteProposalV1 | null;
  overlay: RouteAssistVisibleTrimRouteOverlayV1 | null;
  problems: string[];
};

function failed(providerKey: string, problem: string): RouteAssistVisibleSceneReviewPipelineV1 {
  return { providerKey, semantics: null, proposal: null, overlay: null, problems: [problem] };
}

/**
 * Persisted browser sweep -> semantic CV -> review-only trim proposal ->
 * frame-local overlay.
 *
 * Stops before acceptance and before any canonical Routing V2 binding. The
 * resulting overlay is presentation/review evidence only.
 */
export async function preparePersistedSweepForVisibleSceneReviewV1(args: {
  handoff: RouteAssistSweepCaptureHandoffV1;
  provider: RouteAssistVisibleSceneProviderV1;
  providerInput: Omit<RouteAssistVisibleSceneProviderInputV1, "captureArtifacts">;
}): Promise<RouteAssistVisibleSceneReviewPipelineV1> {
  const frames = [...args.handoff.persistedFrames].sort((a, b) => a.sequence - b.sequence);
  if (!frames.length) return failed(args.provider.providerKey, "persisted sweep contains no frames");

  const frameIds = frames.map((frame) => frame.imageId);
  const artifactIds = args.handoff.captureArtifacts.imageIds;
  if (
    frameIds.length !== artifactIds.length ||
    frameIds.some((id, index) => id !== artifactIds[index])
  ) {
    return failed(args.provider.providerKey, "persisted sweep order or identity does not match capture artifacts");
  }
  if (new Set(frameIds).size !== frameIds.length) {
    return failed(args.provider.providerKey, "persisted sweep contains duplicate image identities");
  }
  if (args.handoff.reviewImage.imageId !== frameIds[frameIds.length - 1]) {
    return failed(args.provider.providerKey, "persisted sweep review image is not the final ordered frame");
  }

  const providerRun = await runRouteAssistVisibleSceneProviderV1(args.provider, {
    ...args.providerInput,
    captureArtifacts: {
      imageIds: [...frameIds],
      overlayImageIds: [...args.handoff.captureArtifacts.overlayImageIds],
    },
  });
  if (!providerRun.semantics) {
    return {
      providerKey: providerRun.providerKey,
      semantics: null,
      proposal: null,
      overlay: null,
      problems: providerRun.problems,
    };
  }

  const proposal = proposeVisibleTrimHuggingRouteV1({
    semantics: providerRun.semantics,
    expectedCaptureImageIds: frameIds,
    points: args.providerInput.points,
    segments: args.providerInput.segments,
  });
  if (proposal.status !== "REVIEW_REQUIRED") {
    return {
      providerKey: providerRun.providerKey,
      semantics: providerRun.semantics,
      proposal,
      overlay: null,
      problems: [...proposal.problems],
    };
  }

  const overlay = buildVisibleTrimRouteOverlayV1({
    semantics: providerRun.semantics,
    proposal,
  });
  if (!overlay) {
    return {
      providerKey: providerRun.providerKey,
      semantics: providerRun.semantics,
      proposal,
      overlay: null,
      problems: ["visible trim route could not be projected onto captured frames"],
    };
  }

  return {
    providerKey: providerRun.providerKey,
    semantics: providerRun.semantics,
    proposal,
    overlay,
    problems: [],
  };
}
