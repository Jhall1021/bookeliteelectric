import {
  writeRouteAssistFactV1,
  type RouteAssistFactStoreV1,
  type RouteAssistFactTypeV1,
  type RouteAssistFactV1,
  type RouteAssistFactValueV1,
  type RouteAssistFactWriteResultV1,
} from "./factModel";

/**
 * The minimal architecture for LATER targeted-photo capture (see
 * captureEscalation.ts's TARGETED_PHOTO_REQUIRED). Not a second Route Assist
 * architecture: a sibling request/response shape next to the existing
 * whole-scene RouteAssistVisibleSceneProviderV1 (visibleSceneProvider.ts),
 * feeding the same kind of provenance-checked write path every other fact
 * write goes through.
 *
 * The request names exactly ONE fact to resolve, against exactly ONE new
 * image, and carries the already-locked facts as READ-ONLY context. There is
 * no field anywhere in RouteAssistFactResolutionResponseV1 a provider could
 * populate to claim a different fact than the one it was asked about, or to
 * touch a locked one -- the same structural discipline factModel.ts uses,
 * extended to the wire shape a provider actually receives and returns.
 *
 * This slice does not wire a live provider or build the capture UI for this
 * -- see docs/design or the implementation report for what's deferred. What
 * exists here is proven end-to-end against a fixture provider in
 * scripts/verify-route-assist-photo-first.ts.
 */
export type RouteAssistFactResolutionRequestV1 = {
  version: 1;
  targetFactType: RouteAssistFactTypeV1;
  scopeId: string;
  imageId: string;
  imageUrl: string;
  /** Read-only. A provider may use these to orient itself; nothing here is a channel to rewrite one. */
  lockedFacts: readonly RouteAssistFactV1[];
};

export type RouteAssistFactResolutionResponseV1 = {
  version: 1;
  /** Must echo the request's targetFactType/scopeId exactly -- applyRouteAssistFactResolutionV1 refuses otherwise. A provider cannot redirect its own answer onto a different fact. */
  targetFactType: RouteAssistFactTypeV1;
  scopeId: string;
  /** null = the provider could not resolve this fact from the supplied image (e.g. still occluded). Not an error -- a legitimate "still missing" answer. */
  value: RouteAssistFactValueV1 | null;
  evidenceImageIds: string[];
};

export type RouteAssistFactResolutionProviderV1 = {
  providerKey: string;
  resolve(request: RouteAssistFactResolutionRequestV1): Promise<RouteAssistFactResolutionResponseV1>;
};

export type RouteAssistFactResolutionOutcomeV1 =
  | { outcome: "NO_VALUE_RETURNED"; store: RouteAssistFactStoreV1 }
  | RouteAssistFactWriteResultV1;

/**
 * Apply a fact-resolution response to the store. Every locked-fact refusal
 * this can produce comes from writeRouteAssistFactV1 itself -- this function
 * adds exactly one more structural check on top: the response must answer
 * the SAME fact it was asked about, or it is refused before writeRouteAssist
 * FactV1 is even called.
 */
export function applyRouteAssistFactResolutionV1(
  store: RouteAssistFactStoreV1,
  request: RouteAssistFactResolutionRequestV1,
  response: RouteAssistFactResolutionResponseV1,
  providerKey: string,
): RouteAssistFactResolutionOutcomeV1 {
  if (response.targetFactType !== request.targetFactType || response.scopeId !== request.scopeId) {
    return {
      outcome: "REFUSED_PROVENANCE",
      store,
      problem: `fact resolution response (${response.targetFactType}:${response.scopeId}) does not match the fact it was asked to resolve (${request.targetFactType}:${request.scopeId})`,
    };
  }
  if (response.value === null) return { outcome: "NO_VALUE_RETURNED", store };

  return writeRouteAssistFactV1(store, {
    type: request.targetFactType,
    scopeId: request.scopeId,
    value: response.value,
    evidenceImageIds: response.evidenceImageIds,
    provenance: { source: "VISION_PROVIDER", providerKey, at: new Date().toISOString() },
    lockOnWrite: true,
  });
}
