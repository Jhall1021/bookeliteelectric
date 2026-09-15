import type { RouteAssistVisibleSceneProviderInputV1, RouteAssistVisibleSceneProviderV1 } from "./visibleSceneProvider";
import type { RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";

export type RouteAssistHttpVisibleSceneRequestV1 = {
  version: 1;
  mode: RouteAssistVisibleSceneProviderInputV1["mode"];
  destinationType: RouteAssistVisibleSceneProviderInputV1["destinationType"];
  pointIds: string[];
  segmentIds: string[];
  imageIds: string[];
};

export type RouteAssistHttpVisibleSceneTransportV1 = {
  /**
   * Network/SDK seam only. Server-side transport resolves authorized imageIds
   * to media; durable storage URLs never become part of the domain contract.
   */
  analyze(request: RouteAssistHttpVisibleSceneRequestV1): Promise<unknown>;
};

function semanticsShape(value: unknown): RouteAssistVisibleSceneSemanticsV1 {
  if (!value || typeof value !== "object") throw new Error("invalid visible-scene payload");
  const candidate = value as Partial<RouteAssistVisibleSceneSemanticsV1>;
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.captureImageIds) ||
    !Array.isArray(candidate.objects) ||
    !Array.isArray(candidate.segmentObservations)
  ) {
    throw new Error("invalid visible-scene semantics shape");
  }
  // Full graph/image/provenance validation happens in the provider runner.
  return candidate as RouteAssistVisibleSceneSemanticsV1;
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
        pointIds: input.points.map((point) => point.id),
        segmentIds: input.segments.map((segment) => segment.id),
        imageIds: [...input.captureArtifacts.imageIds],
      });
      return semanticsShape(response);
    },
  };
}
