import type { RouteAssistCaptureArtifacts } from "./types";

export type RouteAssistLocalReviewFrameV1 = { imageId: string; objectUrl: string; mimeType: "image/jpeg"; width: number; height: number };
export type RouteAssistLocalSweepFrameV1 = RouteAssistLocalReviewFrameV1 & { capturedAt: string; sequence: number };
export type RouteAssistPersistedCaptureImageV1 = { imageId: string; imageUrl: string; mimeType: "image/jpeg"; width: number; height: number };
export type RouteAssistPersistedSweepFrameV1 = RouteAssistPersistedCaptureImageV1 & { capturedAt: string; sequence: number };
export type RouteAssistCaptureImagePersisterV1 = { persist(frame: RouteAssistLocalReviewFrameV1): Promise<RouteAssistPersistedCaptureImageV1> };
export type RouteAssistCaptureHandoffV1 = { version: 1; persistedImage: RouteAssistPersistedCaptureImageV1; captureArtifacts: RouteAssistCaptureArtifacts };
export type RouteAssistSweepCaptureHandoffV1 = { version: 1; persistedFrames: RouteAssistPersistedSweepFrameV1[]; reviewImage: RouteAssistPersistedCaptureImageV1; captureArtifacts: RouteAssistCaptureArtifacts };

function validPersistedImage(frame: RouteAssistLocalReviewFrameV1, persisted: RouteAssistPersistedCaptureImageV1): boolean {
  return Boolean(persisted.imageId && persisted.imageId === frame.imageId && persisted.imageUrl && persisted.mimeType === frame.mimeType && persisted.width === frame.width && persisted.height === frame.height && Number.isFinite(persisted.width) && persisted.width > 0 && Number.isFinite(persisted.height) && persisted.height > 0);
}

export async function persistRouteAssistReviewFrameV1(args: { frame: RouteAssistLocalReviewFrameV1; persister: RouteAssistCaptureImagePersisterV1 }): Promise<RouteAssistCaptureHandoffV1 | null> {
  let persisted: RouteAssistPersistedCaptureImageV1;
  try { persisted = await args.persister.persist({ ...args.frame }); } catch { return null; }
  if (!validPersistedImage(args.frame, persisted)) return null;
  return { version: 1, persistedImage: { ...persisted }, captureArtifacts: { imageIds: [persisted.imageId], overlayImageIds: [] } };
}

/**
 * Persist an ordinary-camera room sweep as one ordered, durable capture set.
 * Sequence and timestamps are provenance only; they do not imply spatial
 * adjacency or geometry. The handoff fails closed on gaps, duplicates,
 * backwards time, or partial persistence so providers never receive an
 * ambiguous subset masquerading as the complete homeowner sweep.
 */
export async function persistRouteAssistSweepCaptureV1(args: { frames: RouteAssistLocalSweepFrameV1[]; persister: RouteAssistCaptureImagePersisterV1 }): Promise<RouteAssistSweepCaptureHandoffV1 | null> {
  if (args.frames.length === 0) return null;
  const ordered = [...args.frames].sort((a, b) => a.sequence - b.sequence);
  const imageIds = new Set<string>();
  let priorCapturedAtMs: number | null = null;
  for (let index = 0; index < ordered.length; index++) {
    const frame = ordered[index];
    const capturedAtMs = Date.parse(frame.capturedAt);
    if (!frame.imageId || imageIds.has(frame.imageId) || !Number.isInteger(frame.sequence) || frame.sequence !== index || !Number.isFinite(capturedAtMs)) return null;
    if (priorCapturedAtMs != null && capturedAtMs < priorCapturedAtMs) return null;
    imageIds.add(frame.imageId); priorCapturedAtMs = capturedAtMs;
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
  return { version: 1, persistedFrames, reviewImage: { imageId: reviewImage.imageId, imageUrl: reviewImage.imageUrl, mimeType: reviewImage.mimeType, width: reviewImage.width, height: reviewImage.height }, captureArtifacts: { imageIds: persistedFrames.map((frame) => frame.imageId), overlayImageIds: [] } };
}
