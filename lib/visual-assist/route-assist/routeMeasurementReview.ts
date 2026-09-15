import type { RouteAssistCaptureCapabilityV1 } from "./captureCapability";
import type { RouteAssistVisualScaleEstimateV1 } from "./visualScale";

export type RouteAssistMeasurementMethodV1 =
  | "WORLD_GEOMETRY"
  | "VISUAL_SCALE"
  | "UNAVAILABLE";

/**
 * Homeowner-facing measurement projection for a proposed route.
 *
 * This is deliberately separate from scan candidate acceptance. A visual-scale
 * estimate may be displayed and confirmed as the route the homeowner saw, but
 * it is not converted into a WORLD_GEOMETRY measured-length candidate merely
 * because the homeowner agrees with the proposed path.
 */
export type RouteAssistRouteMeasurementReviewV1 = {
  version: 1;
  method: RouteAssistMeasurementMethodV1;
  lengthFt: number | null;
  confidence: number;
  approximate: boolean;
  label: string;
  provenance: string;
  canBindAsMeasuredWorldGeometry: boolean;
};

export function buildRouteAssistRouteMeasurementReviewV1(args: {
  capability: RouteAssistCaptureCapabilityV1;
  worldGeometryLengthFt?: number | null;
  worldGeometryConfidence?: number | null;
  visualScale?: RouteAssistVisualScaleEstimateV1 | null;
}): RouteAssistRouteMeasurementReviewV1 {
  const worldLength = args.worldGeometryLengthFt ?? null;
  const worldConfidence = args.worldGeometryConfidence ?? 0;
  const validWorldMeasurement =
    args.capability.worldGeometryAvailable &&
    worldLength !== null &&
    Number.isFinite(worldLength) &&
    worldLength > 0 &&
    Number.isFinite(worldConfidence) &&
    worldConfidence >= 0 &&
    worldConfidence <= 1;

  if (validWorldMeasurement) {
    return {
      version: 1,
      method: "WORLD_GEOMETRY",
      lengthFt: worldLength,
      confidence: worldConfidence,
      approximate: false,
      label: `${worldLength.toFixed(1)} ft measured route`,
      provenance: "Measured by calibrated world geometry",
      canBindAsMeasuredWorldGeometry: true,
    };
  }

  const visual = args.visualScale ?? null;
  if (visual?.estimatedLengthFt !== null && visual.estimatedLengthFt !== undefined) {
    return {
      version: 1,
      method: "VISUAL_SCALE",
      lengthFt: visual.estimatedLengthFt,
      confidence: visual.confidence,
      approximate: true,
      label: `Approximately ${visual.estimatedLengthFt.toFixed(1)} ft proposed route`,
      provenance:
        visual.referenceIds.length > 0
          ? `Estimated from visual scale reference${visual.referenceIds.length === 1 ? "" : "s"}: ${visual.referenceIds.join(", ")}`
          : "Estimated from visible-scene scale",
      // Critical boundary: customer review of an estimated route does not turn
      // visible-scene evidence into calibrated world geometry.
      canBindAsMeasuredWorldGeometry: false,
    };
  }

  return {
    version: 1,
    method: "UNAVAILABLE",
    lengthFt: null,
    confidence: 0,
    approximate: true,
    label: "Route distance needs confirmation",
    provenance: "No trustworthy route scale is available yet",
    canBindAsMeasuredWorldGeometry: false,
  };
}
