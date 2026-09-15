import { alignRouteAssistScanEvidenceV1, isClearWorldGeometryObservation, type RouteAssistScanEvidenceV1 } from "./scanEvidence";
import type { RoutePoint, RouteSegment } from "./types";
import type { RouteAssistVisibleTrimRouteProposalV1 } from "./visibleTrimRouteProposal";

export type RouteAssistMetricReviewSegmentV1 = {
  segmentId: string;
  measuredLengthFt: number | null;
  measurementStatus: "CLEAR_WORLD_GEOMETRY" | "UNRESOLVED";
};

export type RouteAssistMetricReviewV1 = {
  version: 1;
  status: "COMPLETE_WORLD_GEOMETRY" | "INCOMPLETE_WORLD_GEOMETRY";
  segments: RouteAssistMetricReviewSegmentV1[];
  /** Present only when every ordered route segment has clear WORLD_GEOMETRY length. */
  measuredRouteLengthFt: number | null;
  requiresHomeownerRouteReview: true;
  /** This is review evidence only; a separate acceptance policy still owns canonical binding. */
  readyForCanonicalBinding: false;
};

/**
 * Join an already reviewable visible-route proposal with validated metric scan
 * evidence without mutating either side or binding anything into Routing V2.
 *
 * Visible-image geometry, semantic confidence, customer corrections, and
 * supplemental-photo order can never create footage here. The only accepted
 * length source is a CLEAR WORLD_GEOMETRY measuredLengthFt observation on the
 * existing Route Assist segment. Partial measurement stays partial: no missing
 * leg is estimated and no route total is produced until every segment resolves.
 */
export function buildRouteAssistMetricReviewV1(args: {
  proposal: RouteAssistVisibleTrimRouteProposalV1;
  points: RoutePoint[];
  segments: RouteSegment[];
  scanEvidence: RouteAssistScanEvidenceV1;
}): RouteAssistMetricReviewV1 | null {
  if (args.proposal.status !== "REVIEW_REQUIRED" || args.proposal.problems.length) return null;

  const aligned = alignRouteAssistScanEvidenceV1(args.points, args.segments, args.scanEvidence);
  if (!aligned.ordered || !aligned.validation.valid) return null;

  const segments: RouteAssistMetricReviewSegmentV1[] = aligned.ordered.segments.map(({ segmentId, evidence }) => {
    const measurement = evidence?.measuredLengthFt;
    if (!isClearWorldGeometryObservation(measurement)) {
      return { segmentId, measuredLengthFt: null, measurementStatus: "UNRESOLVED" as const };
    }
    return {
      segmentId,
      measuredLengthFt: measurement.value,
      measurementStatus: "CLEAR_WORLD_GEOMETRY" as const,
    };
  });

  const complete = segments.length > 0 && segments.every((segment) => segment.measurementStatus === "CLEAR_WORLD_GEOMETRY");
  const measuredRouteLengthFt = complete
    ? segments.reduce((total, segment) => total + (segment.measuredLengthFt ?? 0), 0)
    : null;

  return {
    version: 1,
    status: complete ? "COMPLETE_WORLD_GEOMETRY" : "INCOMPLETE_WORLD_GEOMETRY",
    segments,
    measuredRouteLengthFt,
    requiresHomeownerRouteReview: true,
    readyForCanonicalBinding: false,
  };
}
