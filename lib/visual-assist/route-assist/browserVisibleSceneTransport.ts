import type { FetchFn } from "@/lib/routeAssistHandoffClient";
import type { RouteAssistPersistedSweepFrameV1 } from "./captureHandoff";
import type {
  RouteAssistHttpVisibleSceneRequestV1,
  RouteAssistHttpVisibleSceneTransportV1,
} from "./httpVisibleSceneProvider";
import type { RouteAssistSupplementalCaptureSetV1 } from "./targetedRecapture";

export type RouteAssistBrowserMediaBindingV1 = { imageId: string; mediaRef: string };

function collectPrimaryBindings(frames: readonly RouteAssistPersistedSweepFrameV1[]): RouteAssistBrowserMediaBindingV1[] | null {
  const result: RouteAssistBrowserMediaBindingV1[] = [];
  for (const frame of frames) {
    if (!frame.imageId || !frame.mediaRef) return null;
    result.push({ imageId: frame.imageId, mediaRef: frame.mediaRef });
  }
  return result;
}

/**
 * Browser-side transport for the server-owned semantic provider gateway.
 * It sends opaque private media references only; signed read URLs are created
 * by the server after it re-validates session/task ownership.
 */
export function createRouteAssistBrowserVisibleSceneTransportV1(args: {
  fetchFn: FetchFn;
  guidedFlowSessionId: string;
  taskId: string;
  primaryFrames: readonly RouteAssistPersistedSweepFrameV1[];
  supplementalMedia?: readonly RouteAssistBrowserMediaBindingV1[];
}): RouteAssistHttpVisibleSceneTransportV1 {
  return {
    async analyze(request: RouteAssistHttpVisibleSceneRequestV1): Promise<unknown> {
      const primary = collectPrimaryBindings(args.primaryFrames);
      if (!primary) throw new Error("Route Assist primary evidence is not durably stored");
      const supplemental = [...(args.supplementalMedia ?? [])];
      const all = [...primary, ...supplemental];
      const expectedIds = new Set([
        ...request.imageIds,
        ...request.supplementalCaptureSets.flatMap((set: RouteAssistSupplementalCaptureSetV1) => set.supplementalImageIds),
      ]);
      if (all.length !== expectedIds.size) throw new Error("Route Assist media bindings do not match provider request");
      const seen = new Set<string>();
      for (const binding of all) {
        if (!expectedIds.has(binding.imageId) || seen.has(binding.imageId) || !binding.mediaRef) {
          throw new Error("Route Assist media binding is invalid");
        }
        seen.add(binding.imageId);
      }

      const response = await args.fetchFn(
        `/api/guided-flow-sessions/${args.guidedFlowSessionId}/visual-assist-tasks/${args.taskId}/route-assist-visible-scene`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request, media: all }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? `Route Assist semantic request failed: ${response.status}`);
      return body;
    },
  };
}
