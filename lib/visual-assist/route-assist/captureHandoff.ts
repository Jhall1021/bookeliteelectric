import type { RouteAssistCaptureArtifacts } from "./types";

export type RouteAssistLocalReviewFrameV1 = {
  imageId: string;
  objectUrl: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

export type RouteAssistLocalSweepFrameV1 = RouteAssistLocalReviewFrameV1 & {
  capturedAt: string;
  sequence: number;
};

export type RouteAssistPersistedCaptureImageV1 = {
  imageId: string;
  imageUrl: string;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};

export type RouteAssistPersistedSweepFrameV1 = RouteAssistPersistedCaptureImageV1 & {
  capturedAt: string;
  sequence: number;
};

export type RouteAssistCaptureImagePersisterV1 = {
  /** Storage only: implementations may not analyze media or return route facts. */
  persist(frame: RouteAssistLocalReviewFrameV1): Promise<RouteAssistPersistedCaptureImageV1>;
};

export type RouteAssistCaptureHandoffV1 = {
  version: 1;
  persistedImage: RouteAssistPersistedCaptureImageV1;
  captureArtifacts: RouteAssistCaptureArtifacts;
};

export type RouteAssistSweepCaptureHandoffV1 = {
  version: 1;
  persistedFrames: RouteAssistPersistedSweepFrameV1[];
  /** Final ordered frame, retained as the default review scene. */
  reviewImage: RouteAssistPersistedCaptureImageV1;
  captureArtifacts: RouteAssistCaptureArtifacts;
};

function validPersistedImage(frame: RouteAssistLocalReviewFrameV1, persisted: RouteAssistPersistedCaptureImageV1): boolean {
  return Boolean(
    persisted.imageId && persisted.imageId === frame.imageId && persisted.imageUrl &&
    persisted.mimeType === frame.mimeType && persisted.width === frame.width && persisted.height === frame.height &&
    Number.isFinite(persisted.width) && persisted.width > 0 && Number.isFinite(persisted.height) && persisted.height > 0,
  );
}

/** Preserve the original single-frame handoff for existing callers. */
export async function persistRouteAssistReviewFrameV1(args: {
  frame: RouteAssistLocalReviewFrameV1;
  persister: RouteAssistCaptureImagePersisterV1;
}): Promise<RouteAssistCaptureHandoffV1 | null> {
  let persisted: RouteAssistPersistedCaptureImageV1;
  try { persisted = await args.persister.persist({ ...args.frame }); } catch { return null; }
  if (!validPersistedImage(args.frame, persisted)) return null;
  return { version: 1, persistedImage: { ...persisted }, captureArtifacts: { imageIds: [persisted.imageId], overlayImageIds: [] } };
}

/**
 * Persist an ordinary-camera room sweep as one ordered, durable capture set.
 *
 * Order and stable image identity are part of media provenance only. They do
 * not establish geometry, distance, obstacle identity, route topology or any
 * pricing fact. The entire handoff fails closed if any frame cannot be stored
 * faithfully; a partial sweep is never silently presented to a CV provider as
 * the homeowner's complete capture.
 */
export async function persistRouteAssistSweepCaptureV1(args: {
  frames: RouteAssistLocalSweepFrameV1[];
  persister: RouteAssistCaptureImagePersisterV1;
}): Promise<RouteAssistSweepCaptureHandoffV1 | null> {
  if (args.frames.length === 0) return null;
  const ordered = [...args.frames].sort((a, b) => a.sequence - b.sequence);
  const sequences = new Set<number>();
  const imageIds = new Set<string>();
  for (const frame of ordered) {
    if (!frame.imageId || imageIds.has(frame.imageId) || sequences.has(frame.sequence) || !Number.isInteger(frame.sequence) || frame.sequence < 0 || !frame.capturedAt) return null;
    imageIds.add(frame.imageId); sequences.add(frame.sequence);
  }

  const persistedFrames: RouteAssistPersistedSweepFrameV1[] = [];
  for (const frame of ordered) {
    let persisted: RouteAssistPersistedCaptureImageV1;
    try { persisted = await args.persister.persist(frame); } catch { return null; }
    if (!validPersistedImage(frame, persisted)) return null;
    persistedFrames.push({ ...persisted, capturedAt: frame.capturedAt, sequence: frame.sequence });
  }

  const reviewImage = persistedFrames[persistedFrames.length - 1];
  if (!reviewImage) return null;
  return {
    version: 1,
    persistedFrames,
    reviewImage: { imageId: reviewImage.imageId, imageUrl: reviewImage.imageUrl, mimeType: reviewImage.mimeType, width: reviewImage.width, height: reviewImage.height },
    captureArtifacts: { imageIds: persistedFrames.map((frame) => frame.imageId), overlayImageIds: [] },
  };
}
