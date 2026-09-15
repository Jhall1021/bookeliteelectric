import type { RouteAssistMetricReviewV1 } from "./metricReview";
import type {
  RouteAssistScanCandidateAcceptanceV1,
} from "./scanCandidateAcceptance";
import type { RouteAssistScanCandidatesV1 } from "./scanCandidates";
import type { RouteAssistVisibleTrimRouteProposalV1 } from "./visibleTrimRouteProposal";

export type RouteAssistVisibleRouteReviewDecisionV1 =
  | "ACCEPTED"
  | "ADJUSTMENT_REQUESTED"
  | "RECAPTURE_REQUESTED";

export type RouteAssistPhysicalFactReviewDecisionV1 =
  | "ACCEPTED"
  | "NOT_ACCEPTED";

export type RouteAssistReviewedAcceptancePlanV1 = {
  version: 1;
  status: "READY_FOR_EXPLICIT_SCAN_CANDIDATE_ACCEPTANCE" | "NOT_READY";
  acceptance: RouteAssistScanCandidateAcceptanceV1 | null;
  reasons: string[];
  /**
   * This plan does not apply candidates. The existing atomic scan-candidate
   * acceptance function remains the only authority that may update the Route
   * Assist graph, and Routing V2 remains downstream of that graph.
   */
  appliesGraphMutation: false;
};

/**
 * Convert an explicit homeowner route-review decision plus complete metric
 * review into an acceptance REQUEST for the existing scan-candidate seam.
 *
 * This intentionally accepts only measured segment lengths. Visible-scene
 * semantics, correction taps, supplemental-photo order, provider confidence,
 * surfaces, turns and obstacles are not promoted by this helper.
 */
export function buildRouteAssistReviewedAcceptancePlanV1(args: {
  proposal: RouteAssistVisibleTrimRouteProposalV1;
  routeReviewDecision: RouteAssistVisibleRouteReviewDecisionV1;
  metricReview: RouteAssistMetricReviewV1;
  candidates: RouteAssistScanCandidatesV1;
}): RouteAssistReviewedAcceptancePlanV1 {
  const reasons: string[] = [];

  if (args.proposal.status !== "REVIEW_REQUIRED" || args.proposal.problems.length) {
    reasons.push("visible route proposal is not reviewable");
  }
  if (args.routeReviewDecision !== "ACCEPTED") {
    reasons.push("homeowner has not explicitly accepted the current visible route proposal");
  }
  if (args.metricReview.status !== "COMPLETE_WORLD_GEOMETRY" || args.metricReview.measuredRouteLengthFt === null) {
    reasons.push("route does not have complete clear world-geometry measurement");
  }
  if (!args.candidates.completeMeasuredRouteLength) {
    reasons.push("scan candidates do not contain a complete measured route length");
  }

  const metricSegmentIds = args.metricReview.segments.map((segment) => segment.segmentId);
  const candidateMeasuredIds = args.candidates.segments
    .filter((segment) => segment.measuredLengthFt !== null)
    .map((segment) => segment.segmentId);

  if (
    metricSegmentIds.length !== candidateMeasuredIds.length ||
    metricSegmentIds.some((id, index) => id !== candidateMeasuredIds[index])
  ) {
    reasons.push("metric review and measured scan candidates do not describe the same ordered route segments");
  }

  const metricTotal = args.metricReview.measuredRouteLengthFt;
  const candidateTotal = args.candidates.completeMeasuredRouteLength?.valueFt ?? null;
  if (
    metricTotal !== null &&
    candidateTotal !== null &&
    Math.abs(metricTotal - candidateTotal) > 1e-9
  ) {
    reasons.push("metric review total does not match the complete scan-candidate total");
  }

  if (reasons.length) {
    return {
      version: 1,
      status: "NOT_READY",
      acceptance: null,
      reasons,
      appliesGraphMutation: false,
    };
  }

  return {
    version: 1,
    status: "READY_FOR_EXPLICIT_SCAN_CANDIDATE_ACCEPTANCE",
    acceptance: {
      measuredLengthSegmentIds: [...metricSegmentIds],
      surfaceSegmentIds: [],
      physicalTurnPointIds: [],
      routeObstaclePointIds: [],
    },
    reasons: [],
    appliesGraphMutation: false,
  };
}

/**
 * Build a separate explicit acceptance request for physical surface/turn facts.
 *
 * Only WORLD_GEOMETRY candidates are eligible. A VISIBLE_SCENE surface label
 * stays evidence-only even when clear, because image semantics alone do not
 * establish a physical plane. Obstacles are intentionally excluded here; a
 * doorway/window semantic observation is not automatically a physical turn.
 */
export function buildRouteAssistReviewedPhysicalFactAcceptancePlanV1(args: {
  candidates: RouteAssistScanCandidatesV1;
  reviewDecision: RouteAssistPhysicalFactReviewDecisionV1;
  reviewedSurfaceSegmentIds?: readonly string[];
  reviewedPhysicalTurnPointIds?: readonly string[];
}): RouteAssistReviewedAcceptancePlanV1 {
  if (args.reviewDecision !== "ACCEPTED") {
    return {
      version: 1,
      status: "NOT_READY",
      acceptance: null,
      reasons: ["physical route facts have not been explicitly accepted"],
      appliesGraphMutation: false,
    };
  }

  const requestedSurfaces = [...new Set(args.reviewedSurfaceSegmentIds ?? [])];
  const requestedTurns = [...new Set(args.reviewedPhysicalTurnPointIds ?? [])];
  const segmentById = new Map(args.candidates.segments.map((candidate) => [candidate.segmentId, candidate]));
  const transitionById = new Map(args.candidates.transitions.map((candidate) => [candidate.pointId, candidate]));
  const reasons: string[] = [];

  for (const segmentId of requestedSurfaces) {
    const surface = segmentById.get(segmentId)?.surface;
    if (!surface) reasons.push(`segment ${segmentId} has no reviewed surface candidate`);
    else if (surface.basis !== "WORLD_GEOMETRY") reasons.push(`segment ${segmentId} surface is not backed by world geometry`);
  }

  for (const pointId of requestedTurns) {
    const turn = transitionById.get(pointId)?.physicalTurn;
    if (!turn) reasons.push(`point ${pointId} has no reviewed physical-turn candidate`);
    else if (turn.basis !== "WORLD_GEOMETRY") reasons.push(`point ${pointId} physical turn is not backed by world geometry`);
  }

  if (reasons.length) {
    return {
      version: 1,
      status: "NOT_READY",
      acceptance: null,
      reasons,
      appliesGraphMutation: false,
    };
  }

  return {
    version: 1,
    status: "READY_FOR_EXPLICIT_SCAN_CANDIDATE_ACCEPTANCE",
    acceptance: {
      measuredLengthSegmentIds: [],
      surfaceSegmentIds: requestedSurfaces,
      physicalTurnPointIds: requestedTurns,
      routeObstaclePointIds: [],
    },
    reasons: [],
    appliesGraphMutation: false,
  };
}
