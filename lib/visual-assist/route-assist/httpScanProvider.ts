import type { RouteAssistScanEvidenceV1 } from "./scanEvidence";
import type { RouteAssistScanProviderInputV1, RouteAssistScanProviderV1 } from "./scanProvider";

export type RouteAssistHttpScanProviderRequestV1 = {
  version: 1;
  mode: RouteAssistScanProviderInputV1["mode"];
  destinationType: RouteAssistScanProviderInputV1["destinationType"];
  captureKind: RouteAssistScanProviderInputV1["captureKind"];
  pointIds: string[];
  segmentIds: string[];
  imageIds: string[];
};

export type RouteAssistHttpScanProviderTransportV1 = {
  /**
   * Network/SDK seam only. A concrete implementation may call a CV/spatial
   * service, but it must return the shared RouteAssistScanEvidenceV1 contract.
   */
  analyze(request: RouteAssistHttpScanProviderRequestV1): Promise<unknown>;
};

function evidenceShape(value: unknown): RouteAssistScanEvidenceV1 {
  if (!value || typeof value !== "object") throw new Error("invalid provider payload");
  const candidate = value as Partial<RouteAssistScanEvidenceV1>;
  if (candidate.version !== 1 || typeof candidate.sourcePointId !== "string" || typeof candidate.destinationPointId !== "string" || !Array.isArray(candidate.segments) || !Array.isArray(candidate.transitions)) {
    throw new Error("invalid provider evidence shape");
  }
  // The canonical scan-provider runner performs the full structural/provenance
  // validation against the authoritative graph. This adapter only prevents an
  // obviously unrelated network payload from crossing the SDK seam.
  return candidate as RouteAssistScanEvidenceV1;
}

/**
 * Provider-neutral adapter for a future web-compatible CV/spatial service.
 * It sends only opaque IDs plus capture mode/taxonomy. Durable image URLs are
 * intentionally NOT part of the provider contract; a server transport should
 * resolve approved imageIds to media after authorization.
 */
export function createRouteAssistHttpScanProviderV1(args: {
  providerKey: string;
  transport: RouteAssistHttpScanProviderTransportV1;
}): RouteAssistScanProviderV1 {
  return {
    providerKey: args.providerKey,
    async analyze(input) {
      const response = await args.transport.analyze({
        version: 1,
        mode: input.mode,
        destinationType: input.destinationType,
        captureKind: input.captureKind,
        pointIds: input.points.map((point) => point.id),
        segmentIds: input.segments.map((segment) => segment.id),
        imageIds: [...input.captureArtifacts.imageIds],
      });
      return evidenceShape(response);
    },
  };
}
