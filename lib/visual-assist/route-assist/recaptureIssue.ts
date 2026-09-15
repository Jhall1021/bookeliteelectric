import type { RouteAssistCaptureReadinessProblemV1 } from "./captureReadiness";
import {
  homeownerCopyForVisibleSceneQualityIssueV1,
  type RouteAssistVisibleSceneQualityIssueV1,
} from "./visibleSceneQuality";

export type RouteAssistRecaptureIssueV1 =
  | {
      source: "STRUCTURAL_CAPTURE";
      code: RouteAssistCaptureReadinessProblemV1["code"];
      imageIds: string[];
      homeownerMessage: string;
    }
  | {
      source: "SEMANTIC_PROVIDER";
      code: RouteAssistVisibleSceneQualityIssueV1["code"];
      imageIds: string[];
      homeownerMessage: string;
    };

function homeownerCopyForCaptureProblem(problem: RouteAssistCaptureReadinessProblemV1): string {
  if (problem.code === "TOO_FEW_FRAMES" || problem.code === "INSUFFICIENT_TEMPORAL_COVERAGE") {
    return "Move a little more slowly from the existing source toward the new location so Route Assist can capture enough of the visible path.";
  }
  if (problem.code === "FRAME_TOO_SMALL") {
    return "Try the scan again with the normal rear camera and keep the visible wall, trim, source, and destination in view.";
  }
  return "Route Assist could not use this capture reliably. Please retake the room sweep instead of guessing.";
}

export function recaptureIssueFromCaptureReadinessV1(
  problem: RouteAssistCaptureReadinessProblemV1,
): RouteAssistRecaptureIssueV1 {
  return {
    source: "STRUCTURAL_CAPTURE",
    code: problem.code,
    imageIds: problem.imageId ? [problem.imageId] : [],
    homeownerMessage: homeownerCopyForCaptureProblem(problem),
  };
}

export function recaptureIssueFromVisibleSceneQualityV1(
  issue: RouteAssistVisibleSceneQualityIssueV1,
): RouteAssistRecaptureIssueV1 {
  return {
    source: "SEMANTIC_PROVIDER",
    code: issue.code,
    imageIds: [...issue.imageIds],
    homeownerMessage: homeownerCopyForVisibleSceneQualityIssueV1(issue),
  };
}
