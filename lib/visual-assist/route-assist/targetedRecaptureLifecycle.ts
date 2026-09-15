import type { RouteAssistSupplementalCaptureSetV1, RouteAssistTargetedRecaptureFocusV1 } from "./targetedRecapture";
import type { RouteAssistVisibleSceneQualityIssueCodeV1, RouteAssistVisibleSceneQualityIssueV1 } from "./visibleSceneQuality";

export type RouteAssistTargetedRecaptureLifecycleV1 = {
  version: 1;
  requestId: string;
  focus: RouteAssistTargetedRecaptureFocusV1;
  status: "RESOLVED_FOR_PROVIDER_REVIEW" | "STILL_REQUIRED";
  remainingQualityCodes: RouteAssistVisibleSceneQualityIssueCodeV1[];
  /** Evidence sufficiency only. This is never homeowner confirmation or route acceptance. */
  requiresFreshRouteReview: true;
};

function qualityCodeForFocus(focus: RouteAssistTargetedRecaptureFocusV1): RouteAssistVisibleSceneQualityIssueCodeV1 {
  if (focus === "SOURCE") return "SOURCE_NOT_CLEAR";
  if (focus === "DESTINATION") return "DESTINATION_NOT_CLEAR";
  if (focus === "DOORWAY") return "DOORWAY_CONTEXT_INCOMPLETE";
  return "INSUFFICIENT_VISIBLE_ROUTE_CONTEXT";
}

/**
 * Compare a completed supplemental request with a fresh provider-quality result.
 * Absence of the request's corresponding quality code means only that the
 * provider no longer requests that targeted recapture. It does not establish
 * physical geometry, measurement, homeowner confirmation, or Routing V2 facts.
 */
export function evaluateRouteAssistTargetedRecaptureLifecycleV1(args: {
  captureSet: RouteAssistSupplementalCaptureSetV1;
  qualityIssues: readonly RouteAssistVisibleSceneQualityIssueV1[];
}): RouteAssistTargetedRecaptureLifecycleV1 {
  const relevantCode = qualityCodeForFocus(args.captureSet.focus);
  const remaining = args.qualityIssues
    .filter((issue) => issue.code === relevantCode)
    .map((issue) => issue.code);

  return {
    version: 1,
    requestId: args.captureSet.requestId,
    focus: args.captureSet.focus,
    status: remaining.length ? "STILL_REQUIRED" : "RESOLVED_FOR_PROVIDER_REVIEW",
    remainingQualityCodes: remaining,
    requiresFreshRouteReview: true,
  };
}
