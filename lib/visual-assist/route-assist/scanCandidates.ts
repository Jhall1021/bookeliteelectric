import {
  alignRouteAssistScanEvidenceV1,
  isClearWorldGeometryObservation,
  type RouteAssistScanEvidenceV1,
  type RouteScanEvidenceBasis,
  type RouteSegmentOrientation,
  type RouteScanObstacleContext,
} from "./scanEvidence";
import type { RoutePhysicalTurn, RouteSurface } from "./taxonomy";
import type { RoutePoint, RouteSegment } from "./types";

/**
 * Reviewable physical candidates extracted from validated room-scan evidence.
 *
 * IMPORTANT AUTHORITY BOUNDARY:
 *
 *   scan evidence -> candidates -> [separate reviewed promotion policy]
 *                  -> Route Assist / Routing V2 facts
 *
 * This module deliberately owns only the first arrow. A candidate is NOT a
 * canonical Routing V2 answer, component quantity, material takeoff line, labor
 * input or price input. Provider confidence is preserved as evidence and is
 * never compared with a threshold here.
 */

export type RouteScanCandidate<T> = {
  value: T;
  /** Provider/runtime confidence, carried through verbatim as evidence only. */
  confidence: number;
  basis: RouteScanEvidenceBasis;
};

export type RouteScanSegmentCandidatesV1 = {
  segmentId: string;
  /** Metric authority requires CLEAR + WORLD_GEOMETRY. */
  measuredLengthFt: RouteScanCandidate<number> | null;
  /** A visibly established surface may come from scene or world evidence. */
  surface: RouteScanCandidate<Exclude<RouteSurface, "UNKNOWN">> | null;
  /** Plane identity is meaningful only from CLEAR + WORLD_GEOMETRY. */
  surfacePlaneId: RouteScanCandidate<string> | null;
  /** World-frame orientation is meaningful only from CLEAR + WORLD_GEOMETRY. */
  orientation: RouteScanCandidate<RouteSegmentOrientation> | null;
};

export type RouteScanTransitionCandidatesV1 = {
  pointId: string;
  /** Physical fitting geometry requires CLEAR + WORLD_GEOMETRY. */
  physicalTurn: RouteScanCandidate<RoutePhysicalTurn> | null;
  /** Visible obstacle context is evidence, not a fitting/material decision. */
  obstacleContext: RouteScanCandidate<RouteScanObstacleContext> | null;
};

export type CompleteMeasuredRouteLengthCandidateV1 = {
  /**
   * Sum of EVERY ordered route segment's clear world-geometry measurement.
   * Never rounded here. If one segment is missing, partial, scene-only or
   * otherwise unsupported, this aggregate is null rather than an estimate.
   */
  valueFt: number;
  segments: Array<{ segmentId: string; valueFt: number; confidence: number }>;
};

export type RouteAssistScanCandidatesV1 = {
  version: 1;
  sourcePointId: string;
  destinationPointId: string;
  segments: RouteScanSegmentCandidatesV1[];
  transitions: RouteScanTransitionCandidatesV1[];
  completeMeasuredRouteLength: CompleteMeasuredRouteLengthCandidateV1 | null;
};

export type RouteAssistScanCandidateExtraction = {
  candidates: RouteAssistScanCandidatesV1 | null;
  problems: string[];
};

function clearCandidate<T>(
  observation:
    | { value: T | null; confidence: number; visibility: "CLEAR" | "PARTIAL" | "NOT_VISIBLE"; basis: RouteScanEvidenceBasis }
    | null
    | undefined,
): RouteScanCandidate<T> | null {
  if (!observation || observation.value === null || observation.visibility !== "CLEAR") return null;
  return { value: observation.value, confidence: observation.confidence, basis: observation.basis };
}

function clearWorldCandidate<T>(
  observation:
    | { value: T | null; confidence: number; visibility: "CLEAR" | "PARTIAL" | "NOT_VISIBLE"; basis: RouteScanEvidenceBasis }
    | null
    | undefined,
): RouteScanCandidate<T> | null {
  if (!isClearWorldGeometryObservation(observation)) return null;
  return { value: observation.value, confidence: observation.confidence, basis: observation.basis };
}

/**
 * Extract what a coherent scan actually observed, without promoting it.
 *
 * Validation/alignment happens first, against the existing Route Assist graph.
 * Invalid evidence returns no candidate set at all: a row referring to the
 * wrong segment/point is not made "mostly usable" by dropping the bad piece.
 *
 * CLEAR is required for a candidate because PARTIAL means the scan itself says
 * the observation is incomplete. Confidence is intentionally NOT consulted.
 */
export function extractRouteAssistScanCandidatesV1(
  points: RoutePoint[],
  segments: RouteSegment[],
  evidence: RouteAssistScanEvidenceV1,
): RouteAssistScanCandidateExtraction {
  const aligned = alignRouteAssistScanEvidenceV1(points, segments, evidence);
  if (!aligned.validation.valid || !aligned.ordered) {
    return { candidates: null, problems: aligned.validation.problems };
  }

  const segmentCandidates: RouteScanSegmentCandidatesV1[] = aligned.ordered.segments.map(({ segmentId, evidence: row }) => ({
    segmentId,
    measuredLengthFt: clearWorldCandidate(row?.measuredLengthFt),
    surface: clearCandidate(row?.surface),
    surfacePlaneId: clearWorldCandidate(row?.surfacePlaneId),
    orientation: clearWorldCandidate(row?.orientation),
  }));

  const transitionCandidates: RouteScanTransitionCandidatesV1[] = aligned.ordered.transitions.map(({ pointId, evidence: row }) => ({
    pointId,
    physicalTurn: clearWorldCandidate(row?.physicalTurn),
    obstacleContext: clearCandidate(row?.obstacleContext),
  }));

  // Exact aggregate only when EVERY leg is measured by clear world geometry.
  // An empty route cannot produce a meaningful measured length candidate.
  const completeLengths = segmentCandidates.length > 0 && segmentCandidates.every((segment) => segment.measuredLengthFt !== null);
  const completeMeasuredRouteLength = completeLengths
    ? {
        valueFt: segmentCandidates.reduce((sum, segment) => sum + segment.measuredLengthFt!.value, 0),
        segments: segmentCandidates.map((segment) => ({
          segmentId: segment.segmentId,
          valueFt: segment.measuredLengthFt!.value,
          confidence: segment.measuredLengthFt!.confidence,
        })),
      }
    : null;

  return {
    problems: [],
    candidates: {
      version: 1,
      sourcePointId: aligned.ordered.sourcePointId,
      destinationPointId: aligned.ordered.destinationPointId,
      segments: segmentCandidates,
      transitions: transitionCandidates,
      completeMeasuredRouteLength,
    },
  };
}
