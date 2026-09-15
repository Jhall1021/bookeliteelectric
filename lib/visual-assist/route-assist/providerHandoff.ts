import type { RouteAssistCaptureHandoffV1 } from "./captureHandoff";
import { prepareRouteAssistScanReviewV1, type RouteAssistScanReviewPipelineV1 } from "./scanPipeline";
import type { RouteAssistScanProviderInputV1, RouteAssistScanProviderV1 } from "./scanProvider";

/**
 * Cross the durable-media -> provider-review boundary using the existing scan
 * pipeline. The persisted public URL remains presentation/storage metadata;
 * provider authority is still limited to captureArtifacts.imageIds plus the
 * existing Route Assist graph supplied in providerInput.
 *
 * This helper intentionally returns the review pipeline result and stops. It
 * cannot accept candidates, mutate the graph, bind Routing V2, compute
 * MaterialTakeoff, or affect pricing.
 */
export async function preparePersistedCaptureForRouteAssistReviewV1(args: {
  handoff: RouteAssistCaptureHandoffV1;
  provider: RouteAssistScanProviderV1;
  providerInput: Omit<RouteAssistScanProviderInputV1, "captureArtifacts">;
}): Promise<RouteAssistScanReviewPipelineV1> {
  const persistedId = args.handoff.persistedImage.imageId;
  const artifactIds = args.handoff.captureArtifacts.imageIds;

  if (artifactIds.length !== 1 || artifactIds[0] !== persistedId) {
    return {
      providerKey: args.provider.providerKey,
      evidence: null,
      candidates: null,
      review: null,
      problems: ["persisted capture identity does not match provider capture artifacts"],
    };
  }

  return prepareRouteAssistScanReviewV1(args.provider, {
    ...args.providerInput,
    captureArtifacts: {
      imageIds: [...artifactIds],
      overlayImageIds: [...args.handoff.captureArtifacts.overlayImageIds],
    },
  });
}
