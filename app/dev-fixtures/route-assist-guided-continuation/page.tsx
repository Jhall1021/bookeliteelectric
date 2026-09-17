import { notFound } from "next/navigation";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";
import RouteAssistGuidedContinuationPreviewClient from "./RouteAssistGuidedContinuationPreviewClient";

/**
 * Preview-only test harness for the capture-the-work-area-first architecture
 * pass: captures the whole work area first (one photo, or several guided,
 * overlap-validated continuation photos), only THEN lets the homeowner
 * place source/destination anchors across whichever frames they actually
 * appear on, and only THEN evaluates route topology -- see
 * captureWorkspace.ts for the capture-completeness / route-evaluation
 * boundary this proves, and the client component's own doc comment for the
 * full three-stage flow.
 *
 * This is architecture/proof only, not the final homeowner UX.
 */
export const dynamic = "force-dynamic";

export default function RouteAssistGuidedContinuationPreviewPage() {
  if (!isRouteAssistPreviewAllowedV1()) notFound();
  return <RouteAssistGuidedContinuationPreviewClient />;
}
