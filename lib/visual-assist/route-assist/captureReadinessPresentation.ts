import type { RouteAssistCaptureReadinessV1 } from "./captureReadiness";

export type RouteAssistCaptureReadinessMessageV1 = {
  title: string;
  body: string;
};

/** Homeowner copy only; this does not reinterpret evidence or change readiness. */
export function routeAssistCaptureReadinessMessageV1(
  readiness: RouteAssistCaptureReadinessV1,
): RouteAssistCaptureReadinessMessageV1 | null {
  if (readiness.status === "READY_FOR_SEMANTIC_REVIEW") return null;

  const codes = new Set(readiness.problems.map((problem) => problem.code));
  if (codes.has("TOO_FEW_FRAMES") || codes.has("INSUFFICIENT_TEMPORAL_COVERAGE")) {
    return {
      title: "Scan the route again",
      body: "Move a little more slowly from the existing source toward the new location so Route Assist can capture enough of the visible path.",
    };
  }
  if (codes.has("FRAME_TOO_SMALL")) {
    return {
      title: "Camera capture was too small",
      body: "Try the scan again with the normal rear camera and keep the visible wall, trim, source, and destination in view.",
    };
  }
  return {
    title: "Scan the route again",
    body: "Route Assist could not use this capture reliably. Please retake the room sweep instead of guessing.",
  };
}
