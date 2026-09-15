import type { RouteScanObservation } from "./scanEvidence";

/** Cross-platform fallback when calibrated world geometry is unavailable. */
export type RouteAssistVisualScaleReferenceKindV1 = "KNOWN_OBJECT" | "HOMEOWNER_CONFIRMED_DIMENSION" | "VISUAL_ASSUMPTION";

export type RouteAssistVisualScaleReferenceV1 = {
  id: string;
  kind: RouteAssistVisualScaleReferenceKindV1;
  label: string;
  dimensionFt: number | null;
  confidence: number;
  provenance: string;
  /** Captured scene where this reference was actually observed, when applicable. */
  imageId?: string | null;
  /** Provider-local visible surface/plane identity, when established. */
  surfacePlaneId?: string | null;
};

export type RouteAssistVisualScaleEstimateV1 = {
  version: 1;
  estimatedLengthFt: number | null;
  confidence: number;
  referenceIds: string[];
  observation: RouteScanObservation<number>;
  needsHomeownerCalibration: boolean;
};

function usableReference(reference: RouteAssistVisualScaleReferenceV1): boolean {
  return reference.kind !== "VISUAL_ASSUMPTION" && reference.dimensionFt !== null && Number.isFinite(reference.dimensionFt) && reference.dimensionFt > 0 && Number.isFinite(reference.confidence) && reference.confidence >= 0.7 && reference.confidence <= 1;
}

function referenceApplies(reference: RouteAssistVisualScaleReferenceV1, imageId?: string | null, surfacePlaneId?: string | null): boolean {
  // Homeowner-confirmed room dimensions are explicit calibration facts and may
  // apply across the room sweep. Provider-detected objects are local evidence:
  // they must be tied to the same captured image and, when supplied, plane.
  if (reference.kind === "HOMEOWNER_CONFIRMED_DIMENSION") return true;
  if (!imageId || !reference.imageId || reference.imageId !== imageId) return false;
  if (surfacePlaneId && reference.surfacePlaneId !== surfacePlaneId) return false;
  return true;
}

/** Wrap a provider visual estimate in non-authoritative, provenance-scoped evidence. */
export function buildRouteAssistVisualScaleEstimateV1(args: {
  estimatedLengthFt: number | null;
  confidence: number;
  references: RouteAssistVisualScaleReferenceV1[];
  imageId?: string | null;
  surfacePlaneId?: string | null;
}): RouteAssistVisualScaleEstimateV1 {
  const references = args.references.filter((reference) => usableReference(reference) && referenceApplies(reference, args.imageId, args.surfacePlaneId));
  const validEstimate = args.estimatedLengthFt !== null && Number.isFinite(args.estimatedLengthFt) && args.estimatedLengthFt > 0 && Number.isFinite(args.confidence) && args.confidence >= 0 && args.confidence <= 1;
  const hasCalibration = references.length > 0;
  const value = validEstimate && hasCalibration ? args.estimatedLengthFt : null;
  const confidence = validEstimate && hasCalibration ? args.confidence : 0;
  return { version: 1, estimatedLengthFt: value, confidence, referenceIds: references.map((reference) => reference.id), observation: { value, confidence, visibility: value === null ? "NOT_VISIBLE" : "CLEAR", basis: "VISIBLE_SCENE" }, needsHomeownerCalibration: !hasCalibration };
}

export function homeownerCeilingHeightReferenceV1(heightFt: 8 | 9 | 10 | 12 | null): RouteAssistVisualScaleReferenceV1 | null {
  if (heightFt === null) return null;
  return { id: `homeowner-ceiling-${heightFt}ft`, kind: "HOMEOWNER_CONFIRMED_DIMENSION", label: "Ceiling height", dimensionFt: heightFt, confidence: 1, provenance: `Homeowner selected ${heightFt} ft ceiling height` };
}
