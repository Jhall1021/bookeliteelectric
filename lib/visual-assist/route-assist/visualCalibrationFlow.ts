import {
  decideRouteAssistCalibrationV1,
  type RouteAssistCalibrationDecisionV1,
  type RouteAssistCaptureCapabilityV1,
} from "./captureCapability";
import {
  homeownerCeilingHeightReferenceV1,
  type RouteAssistVisualScaleReferenceV1,
} from "./visualScale";

export type RouteAssistVisualCalibrationStateV1 = {
  version: 1;
  decision: RouteAssistCalibrationDecisionV1;
  usableReferences: RouteAssistVisualScaleReferenceV1[];
};

function usableAutomaticReference(reference: RouteAssistVisualScaleReferenceV1): boolean {
  return (
    reference.kind === "KNOWN_OBJECT" &&
    reference.dimensionFt !== null &&
    Number.isFinite(reference.dimensionFt) &&
    reference.dimensionFt > 0 &&
    Number.isFinite(reference.confidence) &&
    reference.confidence >= 0.7 &&
    reference.confidence <= 1
  );
}

/**
 * First calibration checkpoint after visual analysis.
 *
 * A trustworthy world-geometry provider suppresses calibration entirely.
 * Otherwise Route Assist accepts only strong known-object references discovered
 * by the visual provider. Appearance-only assumptions never count. If none are
 * usable, the homeowner gets one simple calibration question rather than a
 * chain of technical measurements.
 */
export function evaluateRouteAssistAutomaticCalibrationV1(args: {
  capability: RouteAssistCaptureCapabilityV1;
  visualReferenceAttempted: boolean;
  references: RouteAssistVisualScaleReferenceV1[];
}): RouteAssistVisualCalibrationStateV1 {
  const usableReferences = args.references.filter(usableAutomaticReference);
  return {
    version: 1,
    usableReferences,
    decision: decideRouteAssistCalibrationV1({
      capability: args.capability,
      visualReferenceAttempted: args.visualReferenceAttempted,
      visualReferenceUsable: usableReferences.length > 0,
    }),
  };
}

/**
 * Resolve the homeowner fallback with a deliberately bounded answer set.
 * `null` means "Not sure" and creates no calibration evidence.
 */
export function resolveRouteAssistHomeownerCalibrationV1(args: {
  capability: RouteAssistCaptureCapabilityV1;
  ceilingHeightFt: 8 | 9 | 10 | 12 | null;
}): RouteAssistVisualCalibrationStateV1 {
  if (args.capability.worldGeometryAvailable) {
    return {
      version: 1,
      usableReferences: [],
      decision: { mode: "WORLD_GEOMETRY", askHomeownerForScale: false },
    };
  }

  const reference = homeownerCeilingHeightReferenceV1(args.ceilingHeightFt);
  if (!reference) {
    return {
      version: 1,
      usableReferences: [],
      decision: { mode: "ASK_HOMEOWNER_FOR_SCALE", askHomeownerForScale: true },
    };
  }

  return {
    version: 1,
    usableReferences: [reference],
    decision: { mode: "TRY_VISUAL_REFERENCE", askHomeownerForScale: false },
  };
}
