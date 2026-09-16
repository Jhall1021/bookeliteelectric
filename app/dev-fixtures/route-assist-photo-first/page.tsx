import { notFound } from "next/navigation";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";
import RouteAssistPhotoFirstPreviewClient from "./RouteAssistPhotoFirstPreviewClient";

/**
 * Preview-only test harness for the already-built live photo-first Route
 * Assist path (RouteAssistPhotoCapture -> the photo-first-interpret dev
 * endpoint -> livePhotoFactAdapter -> evaluateRouteAssistPhotoEscalationV1).
 * No redesign here -- this page exists only to put the existing component on
 * a real phone camera.
 *
 * Gated at the PAGE level (this is a server component, evaluated on the
 * request) using the same isRouteAssistPreviewAllowedV1() the dev-fixtures
 * API routes already use, so this fails closed on its own -- reaching the
 * page never depended on the API route's own gate to keep it out of
 * production.
 */
export const dynamic = "force-dynamic";

export default function RouteAssistPhotoFirstPreviewPage() {
  if (!isRouteAssistPreviewAllowedV1()) notFound();
  return <RouteAssistPhotoFirstPreviewClient />;
}
