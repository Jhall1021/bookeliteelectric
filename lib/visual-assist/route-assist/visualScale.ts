import type { RouteScanObservation } from "./scanEvidence";

/**
 * Cross-platform fallback for devices/providers without calibrated world geometry.
 *
 * Visual scale is EVIDENCE, not metric authority. It may help a provider propose
 * route dimensions for homeowner review, but it must never be mislabeled as
 * WORLD_GEOMETRY or silently copied into canonical Routing V2 quantities.
 */
export type RouteAssistVisualScaleReferenceKindV1 =
  | "KNOWN_OBJECT"
  | "HOMEOWNER_CONFIRMED_DIMENSION"
  | "VISUAL_ASSUMPTION";

export type RouteAssistVisualScaleReferenceV1 = {
  id: string;
  kind: RouteAssistVisualScaleReferenceKindV1;
  label: string;
  /** Physical reference dimension in feet when actually known/confirmed. */
  dimensionFt: number | null;
  /** Provider confidence that the visible reference was identified correctly. */
  confidence: number;
  /** Human-readable provenance, e.g. "homeowner selected 8 ft ceiling". */
  provenance: string;
};

export type RouteAssistVisualScaleEstimateV1 = {
  version: 1;
  estimatedLengthFt: number | null;
  confidence: number;
  referenceIds: string[];
  /** Always VISIBLE_SCENE: visual calibration is never world-geometry authority. */
  observation: RouteScanObservation<number>;
  needsHomeownerCalibration: boolean;
};

function usableReference(reference: RouteAssistVisualScaleReferenceV1): boolean {
  return (
    reference.kind !== "VISUAL_ASSUMPTION" &&
    reference.dimensionFt !== null &&
    Number.isFinite(reference.dimensionFt) &&
    reference.dimensionFt > 0 &&
    Number.isFinite(reference.confidence) &&
    reference.confidence >= 0.7 &&
    reference.confidence <= 1
  );
}

/**
 * Wrap a provider's visually scaled estimate in deliberately non-authoritative
 * evidence. The geometry/math that produced `estimatedLengthFt` remains a
 * provider responsibility; this function only enforces provenance rules.
 */
export function buildRouteAssistVisualScaleEstimateV1(args: {
  estimatedLengthFt: number | null;
  confidence: number;
  references: RouteAssistVisualScaleReferenceV1[];
}): RouteAssistVisualScaleEstimateV1 {
  const references = args.references.filter(usableReference);
  const validEstimate =
    args.estimatedLengthFt !== null &&
    Number.isFinite(args.estimatedLengthFt) &&
    args.estimatedLengthFt > 0 &&
    Number.isFinite(args.confidence) &&
    args.confidence >= 0 &&
    args.confidence <= 1;

  const hasCalibration = references.length > 0;
  const value = validEstimate && hasCalibration ? args.estimatedLengthFt : null;
  const confidence = validEstimate && hasCalibration ? args.confidence : 0;

  return {
    version: 1,
    estimatedLengthFt: value,
    confidence,
    referenceIds: references.map((reference) => reference.id),
    observation: {
      value,
      confidence,
      visibility: value === null ? "UNCLEAR" : "CLEAR",
      basis: "VISIBLE_SCENE",
    },
    needsHomeownerCalibration: !hasCalibration,
  };
}

/**
 * Keep the homeowner fallback intentionally simple. This does not assume a
 * ceiling height from appearance; it records only an explicit answer.
 */
export function homeownerCeilingHeightReferenceV1(
  heightFt: 8 | 9 | 10 | 12 | null,
): RouteAssistVisualScaleReferenceV1 | null {
  if (heightFt === null) return null;
  return {
    id: `homeowner-ceiling-${heightFt}ft`,
    kind: "HOMEOWNER_CONFIRMED_DIMENSION",
    label: "Ceiling height",
    dimensionFt: heightFt,
    confidence: 1,
    provenance: `Homeowner selected ${heightFt} ft ceiling height`,
  };
}
