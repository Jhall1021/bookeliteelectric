import type { RouteAssistScanEvidenceV1, RouteScanObstacleContext, RouteSegmentOrientation } from "./scanEvidence";
import type { RouteSurface } from "./taxonomy";
import type { RoutePoint, RouteSegment } from "./types";
import { buildRouteAssistVisualScaleEstimateV1, type RouteAssistVisualScaleReferenceV1 } from "./visualScale";

export type RouteAssistVisualSceneSegmentV1 = {
  segmentId: string;
  /** Captured scene used for this visual estimate. Required for estimated length. */
  imageId?: string | null;
  /** Provider-local visible surface/plane identity, if established. */
  surfacePlaneId?: string | null;
  estimatedLengthFt?: number | null;
  surface?: Exclude<RouteSurface, "UNKNOWN"> | null;
  orientation?: RouteSegmentOrientation | null;
  confidence: number;
};
export type RouteAssistVisualSceneTransitionV1 = { pointId: string; imageId?: string | null; obstacleContext?: RouteScanObstacleContext | null; confidence: number };
export type RouteAssistVisualSceneAnalysisV1 = { version: 1; sourcePointId: string; destinationPointId: string; /** Ordered durable image IDs supplied to the provider. */ captureImageIds?: string[]; scaleReferences: RouteAssistVisualScaleReferenceV1[]; segments: RouteAssistVisualSceneSegmentV1[]; transitions: RouteAssistVisualSceneTransitionV1[] };
export type RouteAssistVisualSceneResultV1 = { version: 1; evidence: RouteAssistScanEvidenceV1; estimatedSegmentLengths: Array<{ segmentId: string; imageId: string | null; estimatedLengthFt: number | null; confidence: number; referenceIds: string[]; needsHomeownerCalibration: boolean }>; needsHomeownerCalibration: boolean };
function validConfidence(value: number): number { return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0; }

/** Universal camera/CV adapter. Visible semantics may enter review as VISIBLE_SCENE; visually calibrated lengths remain separate from measuredLengthFt. */
export function visualSceneAnalysisToRouteAssistEvidenceV1(args: { analysis: RouteAssistVisualSceneAnalysisV1; points: RoutePoint[]; segments: RouteSegment[] }): RouteAssistVisualSceneResultV1 | null {
  const { analysis } = args;
  if (analysis.version !== 1 || !analysis.sourcePointId || !analysis.destinationPointId) return null;
  const pointIds = new Set(args.points.map((point) => point.id)); const segmentIds = new Set(args.segments.map((segment) => segment.id));
  if (!pointIds.has(analysis.sourcePointId) || !pointIds.has(analysis.destinationPointId)) return null;
  if (analysis.segments.some((row) => !segmentIds.has(row.segmentId)) || analysis.transitions.some((row) => !pointIds.has(row.pointId))) return null;

  const captureIds = analysis.captureImageIds ?? [];
  if (captureIds.length !== new Set(captureIds).size) return null;
  const captureIdSet = new Set(captureIds);
  const references = analysis.scaleReferences;
  if (references.some((reference) => reference.imageId && !captureIdSet.has(reference.imageId))) return null;
  if (analysis.segments.some((row) => row.imageId && !captureIdSet.has(row.imageId))) return null;
  if (analysis.transitions.some((row) => row.imageId && !captureIdSet.has(row.imageId))) return null;

  const estimatedSegmentLengths = analysis.segments.map((row) => {
    // A provider-detected visual estimate without a scene identity is deliberately
    // uncalibrated. This prevents a known object in frame A from scaling frame B.
    const estimate = buildRouteAssistVisualScaleEstimateV1({ estimatedLengthFt: row.imageId ? row.estimatedLengthFt ?? null : null, confidence: validConfidence(row.confidence), references, imageId: row.imageId ?? null, surfacePlaneId: row.surfacePlaneId ?? null });
    return { segmentId: row.segmentId, imageId: row.imageId ?? null, estimatedLengthFt: estimate.estimatedLengthFt, confidence: estimate.confidence, referenceIds: estimate.referenceIds, needsHomeownerCalibration: estimate.needsHomeownerCalibration };
  });

  return {
    version: 1,
    evidence: {
      version: 1, sourcePointId: analysis.sourcePointId, destinationPointId: analysis.destinationPointId,
      segments: analysis.segments.map((row) => ({ segmentId: row.segmentId, surface: row.surface == null ? undefined : { value: row.surface, confidence: validConfidence(row.confidence), visibility: "CLEAR", basis: "VISIBLE_SCENE" } })),
      transitions: analysis.transitions.map((row) => ({ pointId: row.pointId, obstacleContext: row.obstacleContext == null ? undefined : { value: row.obstacleContext, confidence: validConfidence(row.confidence), visibility: "CLEAR", basis: "VISIBLE_SCENE" } })),
    },
    estimatedSegmentLengths,
    needsHomeownerCalibration: estimatedSegmentLengths.some((row) => row.needsHomeownerCalibration),
  };
}
