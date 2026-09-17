import { notFound } from "next/navigation";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";
import RouteAssistGuidedContinuationPreviewClient from "./RouteAssistGuidedContinuationPreviewClient";

/**
 * Preview-only test harness for the stitched-workspace architecture pass:
 * captures the whole work area first (one photo, or several live-guided,
 * overlap-AND-coverage-validated continuation photos), registers them into
 * ONE connected workspace, and only then lets the homeowner place devices
 * directly on that unified workspace (in workspace coordinates, never on
 * individual frames) before evaluating route topology -- see
 * stitchedWorkspace.ts for the registration/coordinate model and the
 * capture-completeness / route-evaluation boundary this proves, and the
 * client component's own doc comment for the full two-stage flow.
 *
 * This is architecture/proof only, not the final homeowner UX.
 */
export const dynamic = "force-dynamic";

export default function RouteAssistGuidedContinuationPreviewPage() {
  if (!isRouteAssistPreviewAllowedV1()) notFound();
  return <RouteAssistGuidedContinuationPreviewClient />;
}
