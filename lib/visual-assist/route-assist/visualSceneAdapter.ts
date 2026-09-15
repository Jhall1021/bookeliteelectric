import type {
  RouteAssistScanEvidenceV1,
  RouteScanObstacleContext,
  RouteSegmentOrientation,
} from "./scanEvidence";
import type { RouteSurface } from "./taxonomy";
import type { RoutePoint, RouteSegment } from "./types";
import {
  buildRouteAssistVisualScaleEstimateV1,
  type RouteAssistVisualScaleReferenceV1,
} from "./visualScale";

export type RouteAssistVisualSceneSegmentV1 = {
  segmentId: string;
  /** Provider-estimated visible route length. Never world-geometry authority. */
  estimatedLengthFt?: number | null;
  surface?: Exclude<RouteSurface, "UNKNOWN"> | null;
  orientation?: RouteSegmentOrientation | null;
  confidence: number;
};

export type RouteAssistVisualSceneTransitionV1 = {
  pointId: string;
  obstacleContext?: RouteScanObstacleContext | null;
  confidence: number;
};

export type RouteAssistVisualSceneAnalysisV1 = {
  version: 1;
  sourcePointId: string;
  destinationPointId: string;
  scaleReferences: RouteAssistVisualScaleReferenceV1[];
  segments: RouteAssistVisualSceneSegmentV1[];
  transitions: RouteAssistVisualSceneTransitionV1[];
};

export type RouteAssistVisualSceneResultV1 = {
  version: 1;
  evidence: RouteAssistScanEvidenceV1;
  estimatedSegmentLengths: Array<{
    segmentId: string;
    estimatedLengthFt: number | null;
    confidence: number;
    referenceIds: string[];
    needsHomeownerCalibration: boolean;
  }>;
  needsHomeownerCalibration: boolean;
};

function validConfidence(value: number): number {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}

/**
 * Universal camera/CV adapter for devices without trustworthy world geometry.
 *
 * Visible semantics (wall/floor/ceiling, orientation, doorway/window/obstacle)
 * may enter the normal scan-evidence review pipeline as VISIBLE_SCENE evidence.
 * Visually calibrated lengths are intentionally kept OUT of measuredLengthFt,
 * because that canonical evidence field requires WORLD_GEOMETRY. They travel as
 * separate review estimates with explicit scale provenance instead.
 *
 * This function never infers hidden wiring, physical raceway turns, concealed
 * route footage, materials, labor or price.
 */
export function visualSceneAnalysisToRouteAssistEvidenceV1(args: {
  analysis: RouteAssistVisualSceneAnalysisV1;
  points: RoutePoint[];
  segments: RouteSegment[];
}): RouteAssistVisualSceneResultV1 | null {
  const { analysis } = args;
  if (analysis.version !== 1 || !analysis.sourcePointId || !analysis.destinationPointId) return null;

  const pointIds = new Set(args.points.map((point) => point.id));
  const segmentIds = new Set(args.segments.map((segment) => segment.id));
  if (!pointIds.has(analysis.sourcePointId) || !pointIds.has(analysis.destinationPointId)) return null;
  if (analysis.segments.some((row) => !segmentIds.has(row.segmentId))) return null;
  if (analysis.transitions.some((row) => !pointIds.has(row.pointId))) return null;

  const estimatedSegmentLengths = analysis.segments.map((row) => {
    const estimate = buildRouteAssistVisualScaleEstimateV1({
      estimatedLengthFt: row.estimatedLengthFt ?? null,
      confidence: validConfidence(row.confidence),
      references: analysis.scaleReferences,
    });
    return {
      segmentId: row.segmentId,
      estimatedLengthFt: estimate.estimatedLengthFt,
      confidence: estimate.confidence,
      referenceIds: estimate.referenceIds,
      needsHomeownerCalibration: estimate.needsHomeownerCalibration,
    };
  });

  return {
    version: 1,
    evidence: {
      version: 1,
      sourcePointId: analysis.sourcePointId,
      destinationPointId: analysis.destinationPointId,
      segments: analysis.segments.map((row) => ({
        segmentId: row.segmentId,
        surface: row.surface == null ? undefined : {
          value: row.surface,
          confidence: validConfidence(row.confidence),
          visibility: "CLEAR",
          basis: "VISIBLE_SCENE",
        },
        // Orientation from an ordinary scene is useful for review but is not
        // world-frame authority, so do not place it in the canonical
        // orientation field (which correctly requires WORLD_GEOMETRY).
      })),
      transitions: analysis.transitions.map((row) => ({
        pointId: row.pointId,
        obstacleContext: row.obstacleContext == null ? undefined : {
          value: row.obstacleContext,
          confidence: validConfidence(row.confidence),
          visibility: "CLEAR",
          basis: "VISIBLE_SCENE",
        },
      })),
    },
    estimatedSegmentLengths,
    needsHomeownerCalibration: estimatedSegmentLengths.some((row) => row.needsHomeownerCalibration),
  };
}
