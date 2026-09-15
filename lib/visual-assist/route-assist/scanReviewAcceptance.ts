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
 * The caller sends only stable review-item IDs plus the fingerprint of the
 * exact review values the customer saw. We rebuild the review from the
 * canonical candidate set, require that fingerprint to match, derive the
 * acceptance contract locally, then use the existing atomic graph-acceptance
 * function. A browser therefore cannot change 5.125 ft into 15.125 ft, turn
 * LARGE_OPENING into DOORWAY, or submit an old checkbox selection after a
 * re-scan changed the value behind the same route ID.
 *
 * Still stops before RouteAssistResult confirmation and Routing V2 binding.
 */
export function applyRouteAssistScanReviewSelectionV1(
  points: RoutePoint[],
  segments: RouteSegment[],
  candidates: RouteAssistScanCandidatesV1,
  acceptedReviewItemIds: string[],
  expectedReviewFingerprint: string,
): RouteAssistScanCandidateAcceptanceResult {
  const review = buildRouteAssistScanReviewV1(candidates);
  if (review.fingerprint !== expectedReviewFingerprint) {
    return {
      ok: false,
      problems: ["scan review changed after it was shown; review the current scan facts before accepting them"],
    };
  }

  const built = buildRouteAssistScanAcceptanceFromReviewV1(review, acceptedReviewItemIds);
  if (!built.ok) return built;

  return applyAcceptedRouteAssistScanCandidatesV1(
    points,
    segments,
    candidates,
    built.acceptance,
  );
}
