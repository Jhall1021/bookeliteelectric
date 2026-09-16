import { analyzeRouteAssistVisibleSceneWithAiGatewayV1, type RouteAssistAiGatewayMediaV1 } from "./aiGatewayVisibleScene";
import type { RouteAssistHttpVisibleSceneRequestV1 } from "./httpVisibleSceneProvider";
import type { RouteAssistVisibleSceneProviderV1 } from "./visibleSceneProvider";

/**
 * Makes the built-in AI Gateway call satisfy the real provider interface.
 *
 * analyzeRouteAssistVisibleSceneWithAiGatewayV1 takes `{ request, media }` --
 * its own shape, not RouteAssistVisibleSceneProviderV1's `analyze(input)`.
 * That gap meant the only thing calling it in production
 * (route-assist-visible-scene/route.ts) never went through
 * runRouteAssistVisibleSceneProviderV1's validation wrapper -- the interface
 * and the thing that actually talks to Gemini agreed on the JSON shape by
 * convention, not by a contract the compiler enforced.
 *
 * This closes that gap for the photo-first live path: this factory's
 * `analyze(input)` performs the exact same points/segments -> pointAnchors/
 * segments conversion createRouteAssistHttpVisibleSceneProviderV1 already
 * does for the browser-facing transport (httpVisibleSceneProvider.ts), so a
 * caller can run this provider through runRouteAssistVisibleSceneProviderV1
 * and get full validation for free, the same way any other provider does.
 *
 * `media` is a closure argument, not part of `input`, because resolving
 * homeowner media into signed URLs is a server-side storage concern this
 * module knows nothing about -- the caller (the API route) resolves it once
 * and hands it to this factory.
 */
export function createRouteAssistAiGatewayVisibleSceneProviderV1(args: {
  media: readonly RouteAssistAiGatewayMediaV1[];
}): RouteAssistVisibleSceneProviderV1 {
  return {
    providerKey: "price2book.route-assist.ai-gateway.v1",
    async analyze(input) {
      const request: RouteAssistHttpVisibleSceneRequestV1 = {
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
        supplementalCaptureSets: [...(input.supplementalCaptureSets ?? [])],
        reviewCorrections: [...(input.reviewCorrections ?? [])],
      };
      return analyzeRouteAssistVisibleSceneWithAiGatewayV1({ request, media: args.media });
    },
  };
}
