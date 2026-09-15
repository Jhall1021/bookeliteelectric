import type { FetchFn } from "@/lib/routeAssistHandoffClient";
import type {
  RouteAssistCaptureImagePersisterV1,
  RouteAssistLocalReviewFrameV1,
  RouteAssistPersistedCaptureImageV1,
} from "./captureHandoff";

function safeFileStem(imageId: string): string {
  const value = imageId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 96);
  return value || "route-assist-frame";
}

async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Route Assist media request failed: ${res.status}`);
  return body as T;
}

/**
 * Browser persister for production Route Assist evidence.
 *
 * Bytes upload directly to R2 using a task-scoped signed PUT. The durable
 * identity is `mediaRef`; `imageUrl` intentionally remains the original local
 * object URL so the homeowner can review the exact captured frame without
 * making private evidence publicly readable.
 */
export function createPrivateRouteAssistBrowserCapturePersisterV1(args: {
  fetchFn: FetchFn;
  guidedFlowSessionId: string;
  taskId: string;
}): RouteAssistCaptureImagePersisterV1 {
  return {
    async persist(frame: RouteAssistLocalReviewFrameV1): Promise<RouteAssistPersistedCaptureImageV1> {
      const source = await fetch(frame.objectUrl);
      if (!source.ok) throw new Error("Could not read Route Assist review frame");
      const blob = await source.blob();
      if (blob.type && blob.type !== frame.mimeType) throw new Error("Route Assist review frame type changed");

      const authorization = await args.fetchFn(
        `/api/guided-flow-sessions/${args.guidedFlowSessionId}/visual-assist-tasks/${args.taskId}/route-assist-media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: `${safeFileStem(frame.imageId)}.jpg`,
            contentType: frame.mimeType,
          }),
        },
      );
      const { uploadUrl, mediaRef } = await asJson<{ uploadUrl: string; mediaRef: string }>(authorization);
      if (!uploadUrl || !mediaRef) throw new Error("Route Assist media authorization was incomplete");

      const upload = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": frame.mimeType },
        body: blob,
      });
      if (!upload.ok) throw new Error(`Route Assist media upload failed: ${upload.status}`);

      return {
        imageId: frame.imageId,
        imageUrl: frame.objectUrl,
        mediaRef,
        mimeType: frame.mimeType,
        width: frame.width,
        height: frame.height,
      };
    },
  };
}
