import { uploadPhoto } from "@/lib/upload";
import type {
  RouteAssistCaptureImagePersisterV1,
  RouteAssistLocalReviewFrameV1,
  RouteAssistPersistedCaptureImageV1,
} from "./captureHandoff";

function safeFileStem(imageId: string): string {
  const value = imageId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 96);
  return value || "route-assist-frame";
}

/**
 * Browser adapter over Price2Book's existing presigned R2 photo-upload path.
 * It only moves bytes. It does not analyze the image or create Route Assist
 * evidence. The stable Route Assist imageId remains application provenance;
 * the R2 public URL is only the durable media location.
 */
export const routeAssistBrowserCapturePersisterV1: RouteAssistCaptureImagePersisterV1 = {
  async persist(frame: RouteAssistLocalReviewFrameV1): Promise<RouteAssistPersistedCaptureImageV1> {
    const response = await fetch(frame.objectUrl);
    if (!response.ok) throw new Error("Could not read Route Assist review frame");
    const blob = await response.blob();
    if (blob.type && blob.type !== frame.mimeType) throw new Error("Route Assist review frame type changed");

    const file = new File([blob], `${safeFileStem(frame.imageId)}.jpg`, { type: frame.mimeType });
    const imageUrl = await uploadPhoto(file);
    if (!imageUrl) throw new Error("Route Assist review frame upload returned no URL");

    return {
      imageId: frame.imageId,
      imageUrl,
      mimeType: frame.mimeType,
      width: frame.width,
      height: frame.height,
    };
  },
};
