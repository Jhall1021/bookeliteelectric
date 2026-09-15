import type {
  RouteAssistScanCandidatesV1,
  RouteScanCandidate,
} from "./scanCandidates";
import type { RouteAssistScanCandidateAcceptanceV1 } from "./scanCandidateAcceptance";
import type { RoutePhysicalTurn, RouteSurface } from "./taxonomy";
import type { RouteScanObstacleContext } from "./scanEvidence";

/**
 * UI-safe review projection for room-scan candidates.
 *
 * Nothing in this file accepts a candidate automatically. It only turns the
 * candidate set into stable review items and converts an explicit set of
 * reviewed item IDs into the existing atomic acceptance contract.
 */

export type RouteAssistScanReviewItemKindV1 =
  | "MEASURED_LENGTH"
  | "SURFACE"
  | "PHYSICAL_TURN"
  | "OBSTACLE";

export type RouteAssistScanReviewItemV1 = {
  id: string;
  kind: RouteAssistScanReviewItemKindV1;
  routeId: string;
  value: number | Exclude<RouteSurface, "UNKNOWN"> | RoutePhysicalTurn | RouteScanObstacleContext;
  confidence: number;
  basis: string;
  /** False means visible evidence may be shown but cannot enter the V1 graph. */
  canApplyToRouteGraph: boolean;
};

export type RouteAssistScanReviewV1 = {
  version: 1;
  sourcePointId: string;
  destinationPointId: string;
  completeMeasuredRouteLengthFt: number | null;
  items: RouteAssistScanReviewItemV1[];
  /**
   * Deterministic value snapshot used only for stale-review detection.
   *
   * This is NOT a signature or trust token. The server/domain always rebuilds
   * the review from canonical candidates and compares equality. Its purpose is
   * to prove the customer selected IDs against the same values they actually
   * saw, rather than against a later re-scan that reused the same route IDs.
   */
  fingerprint: string;
};

export type RouteAssistScanReviewAcceptanceBuild =
  | { ok: true; acceptance: RouteAssistScanCandidateAcceptanceV1 }
  | { ok: false; problems: string[] };

function reviewId(kind: RouteAssistScanReviewItemKindV1, routeId: string): string {
  return `${kind}:${routeId}`;
}

function pushCandidate<T extends RouteAssistScanReviewItemV1["value"]>(
  items: RouteAssistScanReviewItemV1[],
  kind: RouteAssistScanReviewItemKindV1,
  routeId: string,
  candidate: RouteScanCandidate<T> | null,
  canApplyToRouteGraph = true,
): void {
  if (!candidate) return;
  items.push({
    id: reviewId(kind, routeId),
    kind,
    routeId,
    value: candidate.value,
    confidence: candidate.confidence,
    basis: candidate.basis,
    canApplyToRouteGraph,
  });
}

function reviewFingerprint(
  sourcePointId: string,
  destinationPointId: string,
  completeMeasuredRouteLengthFt: number | null,
  items: RouteAssistScanReviewItemV1[],
): string {
  // Exact canonical serialization is intentionally preferable to a small
  // home-grown hash: equality detects every value/provenance change without
  // introducing collision semantics. The review is already customer-visible,
  // so this string contains no secret material.
  return JSON.stringify({
    version: 1,
    sourcePointId,
    destinationPointId,
    completeMeasuredRouteLengthFt,
    items: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      routeId: item.routeId,
      value: item.value,
      confidence: item.confidence,
      basis: item.basis,
      canApplyToRouteGraph: item.canApplyToRouteGraph,
    })),
  });
}

export function buildRouteAssistScanReviewV1(
  candidates: RouteAssistScanCandidatesV1,
): RouteAssistScanReviewV1 {
  const items: RouteAssistScanReviewItemV1[] = [];

  for (const segment of candidates.segments) {
    pushCandidate(items, "MEASURED_LENGTH", segment.segmentId, segment.measuredLengthFt);
    pushCandidate(items, "SURFACE", segment.segmentId, segment.surface);
  }

  for (const transition of candidates.transitions) {
    pushCandidate(items, "PHYSICAL_TURN", transition.pointId, transition.physicalTurn);
    if (transition.obstacleContext) {
      const obstacle = transition.obstacleContext.value;
      pushCandidate(
        items,
        "OBSTACLE",
        transition.pointId,
        transition.obstacleContext,
        obstacle === "DOORWAY" || obstacle === "WINDOW",
      );
    }
  }

  const completeMeasuredRouteLengthFt = candidates.completeMeasuredRouteLength?.valueFt ?? null;
  return {
    version: 1,
    sourcePointId: candidates.sourcePointId,
    destinationPointId: candidates.destinationPointId,
    completeMeasuredRouteLengthFt,
    items,
    fingerprint: reviewFingerprint(
      candidates.sourcePointId,
      candidates.destinationPointId,
      completeMeasuredRouteLengthFt,
      items,
    ),
  };
}

/**
 * Convert only EXPLICITLY accepted review items into the atomic graph-acceptance
 * contract. Unknown IDs or evidence that has no V1 graph mapping fail closed.
 */
export function buildRouteAssistScanAcceptanceFromReviewV1(
  review: RouteAssistScanReviewV1,
  acceptedReviewItemIds: string[],
): RouteAssistScanReviewAcceptanceBuild {
  const byId = new Map(review.items.map((item) => [item.id, item]));
  const uniqueIds = [...new Set(acceptedReviewItemIds)];
  const problems: string[] = [];

  const acceptance: RouteAssistScanCandidateAcceptanceV1 = {
    measuredLengthSegmentIds: [],
    surfaceSegmentIds: [],
    physicalTurnPointIds: [],
    routeObstaclePointIds: [],
  };

  for (const id of uniqueIds) {
    const item = byId.get(id);
    if (!item) {
      problems.push(`unknown scan review item ${id}`);
      continue;
    }
    if (!item.canApplyToRouteGraph) {
      problems.push(`scan review item ${id} has no Route Assist graph mapping`);
      continue;
    }

    switch (item.kind) {
      case "MEASURED_LENGTH":
        acceptance.measuredLengthSegmentIds!.push(item.routeId);
        break;
      case "SURFACE":
        acceptance.surfaceSegmentIds!.push(item.routeId);
        break;
      case "PHYSICAL_TURN":
        acceptance.physicalTurnPointIds!.push(item.routeId);
        break;
      case "OBSTACLE":
        acceptance.routeObstaclePointIds!.push(item.routeId);
        break;
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, acceptance };
}
