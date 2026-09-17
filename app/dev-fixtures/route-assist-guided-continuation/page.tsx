import { notFound } from "next/navigation";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";
import RouteAssistGuidedContinuationPreviewClient from "./RouteAssistGuidedContinuationPreviewClient";

/**
 * Preview-only test harness for the guided-continuation architecture pass:
 * captures frame 1 with the existing RouteAssistPhotoCapture component: when
 * that leg resolves to GUIDED_CONTINUATION_REQUIRED, this page guides a
 * second overlapping photo and calls the new frame-overlap endpoint
 * (frameOverlapAiGateway.ts) to prove the capture -> anchor -> capture ->
 * overlap-accepted/rejected pipeline live, on a real phone camera.
 *
 * This is architecture/proof only, not the final homeowner UX -- see the
 * component's own doc comment for exactly what this page does and does not
 * demonstrate.
 */
export const dynamic = "force-dynamic";

export default function RouteAssistGuidedContinuationPreviewPage() {
  if (!isRouteAssistPreviewAllowedV1()) notFound();
  return <RouteAssistGuidedContinuationPreviewClient />;
}
