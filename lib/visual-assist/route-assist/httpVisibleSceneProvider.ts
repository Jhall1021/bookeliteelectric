import type { RouteAssistVisibleSceneProviderInputV1, RouteAssistVisibleSceneProviderV1 } from "./visibleSceneProvider";
import type { RouteAssistReviewCorrectionV1 } from "./routeReviewCorrection";
import type { RouteAssistSupplementalCaptureSetV1 } from "./targetedRecapture";
import type { RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";

export type RouteAssistHttpVisibleSceneRequestV1 = {
  version: 1;
  mode: RouteAssistVisibleSceneProviderInputV1["mode"];
  destinationType: RouteAssistVisibleSceneProviderInputV1["destinationType"];
  /**
   * Homeowner-placed image-plane intent. These coordinates help the provider
   * locate the selected source/destination but are not metric geometry and do
   * not become accepted Route Assist facts merely because they were sent.
   */
  pointAnchors: Array<{
    pointId: string;
    kind: RouteAssistVisibleSceneProviderInputV1["points"][number]["kind"];
    imageId: string;
    x: number;
    y: number;
  }>;
  segments: Array<{ segmentId: string; fromPointId: string; toPointId: string }>;
  /** Ordered primary sweep image identities. */
  imageIds: string[];
  /** Supplemental recapture evidence remains separately labeled; no sweep adjacency is implied. */
  supplementalCaptureSets: RouteAssistSupplementalCaptureSetV1[];
  reviewCorrections: RouteAssistReviewCorrectionV1[];
};

export type RouteAssistHttpVisibleSceneTransportV1 = {
  /**
   * Network/SDK seam only. Server-side transport resolves authorized imageIds
   * to media; durable storage URLs never become part of the domain contract.
   * Homeowner corrections are review intent only and supplemental captures are
   * additional evidence only; neither may be treated as accepted geometry or
   * measurement authority by the transport/provider.
   */
  analyze(request: RouteAssistHttpVisibleSceneRequestV1): Promise<unknown>;
};

function semanticsShape(value: unknown): RouteAssistVisibleSceneSemanticsV1 {
  if (!value || typeof value !== "object") throw new Error("invalid visible-scene payload");
  const candidate = value as Partial<RouteAssistVisibleSceneSemanticsV1>;
  if (candidate.version !== 1 || !Array.isArray(candidate.captureImageIds) || !Array.isArray(candidate.objects) || !Array.isArray(candidate.segmentObservations)) throw new Error("invalid visible-scene semantics shape");
  return candidate as RouteAssistVisibleSceneSemanticsV1;
}

function canonicalSupplementalSets(
  sets: readonly RouteAssistSupplementalCaptureSetV1[] | undefined,
): RouteAssistSupplementalCaptureSetV1[] {
  return (sets ?? [])
    .map((set) => ({
      ...set,
      primarySweepImageIds: [...set.primarySweepImageIds],
      supplementalImageIds: [...set.supplementalImageIds].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.requestId.localeCompare(b.requestId));
}

/** Provider-neutral HTTP adapter for ordinary-camera semantic CV. */
export function createRouteAssistHttpVisibleSceneProviderV1(args: {
  providerKey: string;
  transport: RouteAssistHttpVisibleSceneTransportV1;
}): RouteAssistVisibleSceneProviderV1 {
  return {
    providerKey: args.providerKey,
    async analyze(input) {
      const response = await args.transport.analyze({
        version: 1,
        mode: input.mode,
        destinationType: input.destinationType,
        pointAnchors: input.points.map((point) => ({
          pointId: point.id,
          kind: point.kind,
          imageId: point.imageId,
          x: point.x,
          y: point.y,
        })),
        segments: input.segments.map((segment) => ({
          segmentId: segment.id,
          fromPointId: segment.fromPointId,
          toPointId: segment.toPointId,
        })),
        imageIds: [...input.captureArtifacts.imageIds],
        supplementalCaptureSets: canonicalSupplementalSets(input.supplementalCaptureSets),
        reviewCorrections: (input.reviewCorrections ?? []).map((correction) => ({ ...correction, point: { ...correction.point } })),
      });
      return semanticsShape(response);
    },
  };
}
