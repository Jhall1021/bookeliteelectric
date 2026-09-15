import {
  validateRouteAssistScanEvidenceV1,
  type RouteAssistScanEvidenceV1,
  type RouteScanObservation,
} from "./scanEvidence";
import type { RouteAssistDestinationType, RouteAssistMode } from "./taxonomy";
import type { RouteAssistCaptureArtifacts, RoutePoint, RouteSegment } from "./types";

/**
 * Runtime seam for a real room-scan / world-geometry provider.
 *
 * AUTHORITY BOUNDARY:
 *
 *   provider -> RouteAssistScanEvidenceV1 -> validation -> candidates
 *            -> explicit acceptance -> Route Assist graph -> Routing V2
 *
 * A provider never returns canonical Routing V2 answers, MaterialTakeoff
 * inputs, labor, pricing, or a replacement route graph. It may only describe
 * evidence against point/segment IDs that already exist in Route Assist.
 */

export type RouteAssistScanCaptureKindV1 =
  /** Normal homeowner room scan. Hidden concealed paths remain unobservable. */
  | "ORDINARY_ROOM_SCAN"
  /** A deliberately captured route that is physically exposed/visible. */
  | "EXPOSED_ROUTE_SCAN";

export type RouteAssistScanProviderInputV1 = {
  version: 1;
  mode: RouteAssistMode;
  destinationType: RouteAssistDestinationType;
  captureKind: RouteAssistScanCaptureKindV1;
  points: readonly RoutePoint[];
  segments: readonly RouteSegment[];
  captureArtifacts: Readonly<RouteAssistCaptureArtifacts>;
};

export type RouteAssistScanProviderV1 = {
  /** Stable implementation identity for diagnostics only; never pricing input. */
  providerKey: string;
  /**
   * Provider adapters must parse their own SDK/network payload into the shared
   * evidence contract. This runner still validates the evidence against the
   * authoritative Route Assist graph before anything downstream can see it.
   */
  analyze(input: RouteAssistScanProviderInputV1): Promise<RouteAssistScanEvidenceV1>;
};

export type RouteAssistScanProviderRunV1 = {
  providerKey: string;
  evidence: RouteAssistScanEvidenceV1 | null;
  problems: string[];
};

function validProviderKey(value: string): boolean {
  return value.length > 0 && value.length <= 80 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function concealedOrdinaryScanProblems(
  input: RouteAssistScanProviderInputV1,
  evidence: RouteAssistScanEvidenceV1,
): string[] {
  if (input.mode !== "CONCEALED" || input.captureKind !== "ORDINARY_ROOM_SCAN") return [];

  const problems: string[] = [];
  for (const segment of evidence.segments) {
    if (segment.measuredLengthFt?.value != null) {
      problems.push(
        `segment ${segment.segmentId} measuredLengthFt: ordinary room scan cannot establish concealed-route footage`,
      );
    }
  }
  for (const transition of evidence.transitions) {
    if (transition.physicalTurn?.value != null) {
      problems.push(
        `transition ${transition.pointId} physicalTurn: physical raceway fitting geometry is not a concealed-route fact`,
      );
    }
  }
  return problems;
}

function providerInputSnapshot(
  input: RouteAssistScanProviderInputV1,
): RouteAssistScanProviderInputV1 {
  // Give the provider detached copies so an adapter cannot mutate the caller's
  // authoritative Route Assist graph by retaining references and casting away
  // readonly. The evidence it returns still has to reference these same IDs.
  return {
    version: 1,
    mode: input.mode,
    destinationType: input.destinationType,
    captureKind: input.captureKind,
    points: input.points.map((point) => ({ ...point })),
    segments: input.segments.map((segment) => ({ ...segment })),
    captureArtifacts: {
      imageIds: [...input.captureArtifacts.imageIds],
      overlayImageIds: [...input.captureArtifacts.overlayImageIds],
    },
  };
}

function observationSnapshot<T>(
  observation: RouteScanObservation<T> | null | undefined,
): RouteScanObservation<T> | null | undefined {
  if (observation == null) return observation;
  return { ...observation };
}

function providerEvidenceSnapshot(
  evidence: RouteAssistScanEvidenceV1,
): RouteAssistScanEvidenceV1 {
  // The provider owns the object it returned and may retain that reference.
  // Validate and expose only our detached snapshot so a later provider-side
  // mutation cannot rewrite evidence that already crossed this authority gate.
  return {
    version: evidence.version,
    sourcePointId: evidence.sourcePointId,
    destinationPointId: evidence.destinationPointId,
    segments: evidence.segments.map((segment) => ({
      ...segment,
      measuredLengthFt: observationSnapshot(segment.measuredLengthFt),
      surface: observationSnapshot(segment.surface),
      surfacePlaneId: observationSnapshot(segment.surfacePlaneId),
      orientation: observationSnapshot(segment.orientation),
    })),
    transitions: evidence.transitions.map((transition) => ({
      ...transition,
      physicalTurn: observationSnapshot(transition.physicalTurn),
      obstacleContext: observationSnapshot(transition.obstacleContext),
    })),
  };
}

/**
 * Run one provider and stop at validated evidence.
 *
 * Provider confidence is never thresholded here. Validation checks structural
 * coherence/provenance against the existing graph; candidate extraction and
 * explicit acceptance remain separate downstream steps.
 */
export async function runRouteAssistScanProviderV1(
  provider: RouteAssistScanProviderV1,
  input: RouteAssistScanProviderInputV1,
): Promise<RouteAssistScanProviderRunV1> {
  if (!validProviderKey(provider.providerKey)) {
    return {
      providerKey: provider.providerKey,
      evidence: null,
      problems: ["providerKey must be a short opaque identifier"],
    };
  }

  let providerEvidence: RouteAssistScanEvidenceV1;
  try {
    providerEvidence = await provider.analyze(providerInputSnapshot(input));
  } catch {
    return {
      providerKey: provider.providerKey,
      evidence: null,
      problems: ["scan provider failed without producing evidence"],
    };
  }

  let evidence: RouteAssistScanEvidenceV1;
  try {
    evidence = providerEvidenceSnapshot(providerEvidence);
  } catch {
    // TypeScript cannot make a network/SDK response trustworthy at runtime.
    // A provider adapter that returns null, missing arrays, or another malformed
    // shape is bad evidence, not an exception that should escape into Route Assist.
    return {
      providerKey: provider.providerKey,
      evidence: null,
      problems: ["scan provider returned malformed evidence"],
    };
  }

  const validation = validateRouteAssistScanEvidenceV1(
    [...input.points],
    [...input.segments],
    evidence,
  );
  const policyProblems = concealedOrdinaryScanProblems(input, evidence);
  const problems = [...validation.problems, ...policyProblems];

  return {
    providerKey: provider.providerKey,
    evidence: problems.length === 0 ? evidence : null,
    problems,
  };
}
