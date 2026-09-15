import type { RouteAssistCaptureReadinessProblemV1 } from "./captureReadiness";
import { homeownerCopyForCaptureReadinessProblemV1 } from "./captureReadinessCopy";
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

export function recaptureIssueFromCaptureReadinessV1(
  problem: RouteAssistCaptureReadinessProblemV1,
): RouteAssistRecaptureIssueV1 {
  return {
    source: "STRUCTURAL_CAPTURE",
    code: problem.code,
    imageIds: problem.imageId ? [problem.imageId] : [],
    homeownerMessage: homeownerCopyForCaptureReadinessProblemV1(problem),
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
