import type { RouteAssistScanCandidatesV1 } from "./scanCandidates";
import {
  applyAcceptedRouteAssistScanCandidatesV1,
  type RouteAssistScanCandidateAcceptanceResult,
} from "./scanCandidateAcceptance";
import {
  buildRouteAssistScanAcceptanceFromReviewV1,
  buildRouteAssistScanReviewV1,
} from "./scanReview";
import type { RoutePoint, RouteSegment } from "./types";

/**
 * Apply explicit UI review selections without trusting the UI to send back
 * candidate values or an acceptance object.
 *
 * The caller sends only stable review-item IDs. We rebuild the review from the
 * canonical candidate set, derive the acceptance contract locally, then use the
 * existing atomic graph-acceptance function. A browser therefore cannot change
 * 5.125 ft into 15.125 ft or turn LARGE_OPENING into DOORWAY by editing JSON.
 *
 * Still stops before RouteAssistResult confirmation and Routing V2 binding.
 */
export function applyRouteAssistScanReviewSelectionV1(
  points: RoutePoint[],
  segments: RouteSegment[],
  candidates: RouteAssistScanCandidatesV1,
  acceptedReviewItemIds: string[],
): RouteAssistScanCandidateAcceptanceResult {
  const review = buildRouteAssistScanReviewV1(candidates);
  const built = buildRouteAssistScanAcceptanceFromReviewV1(review, acceptedReviewItemIds);
  if (!built.ok) return built;

  return applyAcceptedRouteAssistScanCandidatesV1(
    points,
    segments,
    candidates,
    built.acceptance,
  );
}
