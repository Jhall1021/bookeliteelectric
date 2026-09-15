import type { RouteAssistCaptureHandoffV1, RouteAssistSweepCaptureHandoffV1 } from "./captureHandoff";
import { prepareRouteAssistScanReviewV1, type RouteAssistScanReviewPipelineV1 } from "./scanPipeline";
import type { RouteAssistScanProviderInputV1, RouteAssistScanProviderV1 } from "./scanProvider";

function failed(providerKey: string, problem: string): RouteAssistScanReviewPipelineV1 {
  return { providerKey, evidence: null, candidates: null, review: null, problems: [problem] };
}

/** Existing single-scene durable-media -> provider-review boundary. */
export async function preparePersistedCaptureForRouteAssistReviewV1(args: {
  handoff: RouteAssistCaptureHandoffV1;
  provider: RouteAssistScanProviderV1;
  providerInput: Omit<RouteAssistScanProviderInputV1, "captureArtifacts">;
}): Promise<RouteAssistScanReviewPipelineV1> {
  const persistedId = args.handoff.persistedImage.imageId;
  const artifactIds = args.handoff.captureArtifacts.imageIds;
  if (artifactIds.length !== 1 || artifactIds[0] !== persistedId) return failed(args.provider.providerKey, "persisted capture identity does not match provider capture artifacts");
  return prepareRouteAssistScanReviewV1(args.provider, { ...args.providerInput, captureArtifacts: { imageIds: [...artifactIds], overlayImageIds: [...args.handoff.captureArtifacts.overlayImageIds] } });
}

/**
 * Ordered room-sweep durable-media -> provider-review boundary.
 *
 * The provider receives only the stable image IDs, in the exact persisted sweep
 * order, through the existing captureArtifacts contract. Durable URLs stay out
 * of the domain/provider input so storage location cannot become geometry
 * authority. This function stops at reviewable candidates exactly like the
 * single-scene path; it cannot accept evidence or affect Routing V2, materials,
 * labor, pricing, onboarding, or decision-tree behavior.
 */
export async function preparePersistedSweepForRouteAssistReviewV1(args: {
  handoff: RouteAssistSweepCaptureHandoffV1;
  provider: RouteAssistScanProviderV1;
  providerInput: Omit<RouteAssistScanProviderInputV1, "captureArtifacts">;
}): Promise<RouteAssistScanReviewPipelineV1> {
  const frames = [...args.handoff.persistedFrames].sort((a, b) => a.sequence - b.sequence);
  if (frames.length === 0) return failed(args.provider.providerKey, "persisted sweep contains no frames");

  const frameIds = frames.map((frame) => frame.imageId);
  const artifactIds = args.handoff.captureArtifacts.imageIds;
  if (frameIds.length !== artifactIds.length || frameIds.some((id, index) => id !== artifactIds[index])) {
    return failed(args.provider.providerKey, "persisted sweep order or identity does not match provider capture artifacts");
  }
  if (new Set(frameIds).size !== frameIds.length) return failed(args.provider.providerKey, "persisted sweep contains duplicate image identities");

  const reviewId = args.handoff.reviewImage.imageId;
  if (reviewId !== frameIds[frameIds.length - 1]) return failed(args.provider.providerKey, "persisted sweep review image is not the final ordered frame");

  return prepareRouteAssistScanReviewV1(args.provider, {
    ...args.providerInput,
    captureArtifacts: { imageIds: [...frameIds], overlayImageIds: [...args.handoff.captureArtifacts.overlayImageIds] },
  });
}
