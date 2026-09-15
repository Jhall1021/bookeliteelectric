import type { RouteAssistRecaptureIssueV1 } from "./recaptureIssue";

export type RouteAssistTargetedRecaptureFocusV1 =
  | "SOURCE"
  | "DESTINATION"
  | "DOORWAY"
  | "VISIBLE_ROUTE_CONTEXT";

export type RouteAssistRecapturePlanV1 =
  | {
      version: 1;
      mode: "FULL_SWEEP";
      focus: null;
      preserveOriginalImageIds: string[];
      targetImageIds: string[];
      requiresFreshProviderReview: true;
    }
  | {
      version: 1;
      mode: "TARGETED_SUPPLEMENT";
      focus: RouteAssistTargetedRecaptureFocusV1;
      preserveOriginalImageIds: string[];
      /** Existing images associated with the deficiency; context only, never replacement instructions. */
      targetImageIds: string[];
      requiresFreshProviderReview: true;
    };

/**
 * Convert a structured recapture issue into capture intent only.
 *
 * Targeted supplemental captures never replace, reorder, or reinterpret the
 * original ordered sweep. They are additional evidence for a fresh provider
 * review. Structural capture failures require a new full sweep because the
 * primary evidence set itself is not trustworthy enough to preserve.
 */
export function planRouteAssistRecaptureV1(args: {
  issue: RouteAssistRecaptureIssueV1;
  originalImageIds: readonly string[];
}): RouteAssistRecapturePlanV1 {
  const original = [...args.originalImageIds];

  if (args.issue.source === "STRUCTURAL_CAPTURE") {
    return {
      version: 1,
      mode: "FULL_SWEEP",
      focus: null,
      preserveOriginalImageIds: [],
      targetImageIds: [...args.issue.imageIds],
      requiresFreshProviderReview: true,
    };
  }

  const focus: RouteAssistTargetedRecaptureFocusV1 =
    args.issue.code === "SOURCE_NOT_CLEAR"
      ? "SOURCE"
      : args.issue.code === "DESTINATION_NOT_CLEAR"
        ? "DESTINATION"
        : args.issue.code === "DOORWAY_CONTEXT_INCOMPLETE"
          ? "DOORWAY"
          : "VISIBLE_ROUTE_CONTEXT";

  return {
    version: 1,
    mode: "TARGETED_SUPPLEMENT",
    focus,
    preserveOriginalImageIds: original,
    targetImageIds: [...args.issue.imageIds],
    requiresFreshProviderReview: true,
  };
}

export type RouteAssistSupplementalCaptureSetV1 = {
  version: 1;
  requestId: string;
  focus: RouteAssistTargetedRecaptureFocusV1;
  /** Original primary sweep remains authoritative for order/provenance. */
  primarySweepImageIds: string[];
  /** Newly captured supplemental images. They have no implied adjacency to the primary sweep or each other. */
  supplementalImageIds: string[];
};

function uniqueNonEmpty(values: readonly string[]): boolean {
  return values.length > 0 && new Set(values).size === values.length && values.every((value) => value.length > 0);
}

/**
 * Bind completed supplemental media to the request without merging it into the
 * original sweep ordering. Fails closed on duplicate/colliding identities.
 */
export function buildRouteAssistSupplementalCaptureSetV1(args: {
  requestId: string;
  plan: RouteAssistRecapturePlanV1;
  supplementalImageIds: readonly string[];
}): RouteAssistSupplementalCaptureSetV1 | null {
  if (args.plan.mode !== "TARGETED_SUPPLEMENT") return null;
  if (!args.requestId || args.requestId.length > 100) return null;
  if (!uniqueNonEmpty(args.plan.preserveOriginalImageIds) || !uniqueNonEmpty(args.supplementalImageIds)) return null;
  const primary = new Set(args.plan.preserveOriginalImageIds);
  if (args.supplementalImageIds.some((id) => primary.has(id))) return null;

  return {
    version: 1,
    requestId: args.requestId,
    focus: args.plan.focus,
    primarySweepImageIds: [...args.plan.preserveOriginalImageIds],
    supplementalImageIds: [...args.supplementalImageIds],
  };
}
