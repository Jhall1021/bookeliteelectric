export const ROUTE_ASSIST_VISIBLE_SCENE_QUALITY_ISSUES_V1 = [
  "SOURCE_NOT_CLEAR",
  "DESTINATION_NOT_CLEAR",
  "DOORWAY_CONTEXT_INCOMPLETE",
  "INSUFFICIENT_VISIBLE_ROUTE_CONTEXT",
] as const;

export type RouteAssistVisibleSceneQualityIssueCodeV1 =
  (typeof ROUTE_ASSIST_VISIBLE_SCENE_QUALITY_ISSUES_V1)[number];

/**
 * A provider-declared deficiency in the visible evidence set.
 *
 * This is recapture/review evidence only. It cannot establish geometry,
 * obstacle identity, footage, hidden topology, material, labor, or pricing.
 */
export type RouteAssistVisibleSceneQualityIssueV1 = {
  code: RouteAssistVisibleSceneQualityIssueCodeV1;
  /** Captured frames that demonstrate the deficiency, when the provider can identify them. */
  imageIds: string[];
};

export function homeownerCopyForVisibleSceneQualityIssueV1(
  issue: RouteAssistVisibleSceneQualityIssueV1,
): string {
  if (issue.code === "SOURCE_NOT_CLEAR") return "Scan again and keep the existing outlet or source clearly visible.";
  if (issue.code === "DESTINATION_NOT_CLEAR") return "Scan again and keep the new location clearly visible.";
  if (issue.code === "DOORWAY_CONTEXT_INCOMPLETE") return "Scan the doorway again so both sides and the top trim are visible.";
  return "Scan a little more of the route so Route Assist can see the full visible path.";
}
