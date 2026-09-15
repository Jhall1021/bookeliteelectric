import type { RouteAssistCaptureArtifacts } from "./types";

export type RouteAssistLocalReviewFrameV1 = {
  imageId: string;
  objectUrl: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

export type RouteAssistPersistedCaptureImageV1 = {
  imageId: string;
  imageUrl: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

export type RouteAssistCaptureImagePersisterV1 = {
  /**
   * Storage adapter only. Implementations may upload to the application's
   * approved media store but may not analyze the image or return route facts.
   */
  persist(frame: RouteAssistLocalReviewFrameV1): Promise<RouteAssistPersistedCaptureImageV1>;
};

export type RouteAssistCaptureHandoffV1 = {
  version: 1;
  persistedImage: RouteAssistPersistedCaptureImageV1;
  captureArtifacts: RouteAssistCaptureArtifacts;
};

function validPersistedImage(frame: RouteAssistLocalReviewFrameV1, persisted: RouteAssistPersistedCaptureImageV1): boolean {
  return Boolean(
    persisted.imageId &&
      persisted.imageId === frame.imageId &&
      persisted.imageUrl &&
      persisted.mimeType === frame.mimeType &&
      persisted.width === frame.width &&
      persisted.height === frame.height &&
      Number.isFinite(persisted.width) &&
      persisted.width > 0 &&
      Number.isFinite(persisted.height) &&
      persisted.height > 0,
  );
}

/**
 * Cross the browser-local -> durable-media boundary without granting the
 * storage adapter any geometry authority. The same stable imageId is retained
 * so provider evidence, RoutePoint.imageId, capture artifacts and review
 * overlays can all refer to one captured scene.
 */
export async function persistRouteAssistReviewFrameV1(args: {
  frame: RouteAssistLocalReviewFrameV1;
  persister: RouteAssistCaptureImagePersisterV1;
}): Promise<RouteAssistCaptureHandoffV1 | null> {
  let persisted: RouteAssistPersistedCaptureImageV1;
  try {
    persisted = await args.persister.persist({ ...args.frame });
  } catch {
    return null;
  }
  if (!validPersistedImage(args.frame, persisted)) return null;
  return {
    version: 1,
    persistedImage: { ...persisted },
    captureArtifacts: { imageIds: [persisted.imageId], overlayImageIds: [] },
  };
}
