import {
  selectRouteAssistAcquisitionPathV1,
  withRouteAssistWorldGeometryV1,
  type RouteAssistAcquisitionPathV1,
  type RouteAssistCaptureCapabilityV1,
} from "./captureCapability";

export type RouteAssistSpatialProviderKindV1 =
  | "APPLE_ROOMPLAN"
  | "ARCORE_WEBXR"
  | "OTHER_CALIBRATED_SPATIAL";

export type RouteAssistSpatialCapabilityClaimV1 = {
  version: 1;
  providerKind: RouteAssistSpatialProviderKindV1;
  providerKey: string;
  available: boolean;
  calibratedWorldGeometry: boolean;
  metricScale: boolean;
  stableCoordinateSystem: boolean;
};

export type RouteAssistSpatialCapabilityHandshakeV1 = {
  version: 1;
  providerKind: RouteAssistSpatialProviderKindV1;
  providerKey: string;
  grantsWorldGeometry: boolean;
  acquisition: RouteAssistAcquisitionPathV1;
};

/**
 * Spatial capability is earned by an explicit provider handshake, never by
 * device brand, user agent, camera inventory, motion sensors, or a claim that
 * a handset is depth-capable.
 *
 * Route Assist grants WORLD_GEOMETRY only when the provider is available and
 * explicitly supplies calibrated metric geometry in a stable coordinate
 * system. Anything weaker stays on the normal camera/review fallback path.
 * This handshake grants capture/measurement authority only; it cannot create
 * Routing V2 facts, materials, labor, pricing, or homeowner acceptance.
 */
export function resolveRouteAssistSpatialCapabilityV1(args: {
  baseCapability: RouteAssistCaptureCapabilityV1;
  claim: RouteAssistSpatialCapabilityClaimV1;
}): RouteAssistSpatialCapabilityHandshakeV1 {
  const grantsWorldGeometry = Boolean(
    args.claim.providerKey.trim() &&
    args.claim.available &&
    args.claim.calibratedWorldGeometry &&
    args.claim.metricScale &&
    args.claim.stableCoordinateSystem,
  );

  const capability = grantsWorldGeometry
    ? withRouteAssistWorldGeometryV1(args.baseCapability)
    : args.baseCapability;

  return {
    version: 1,
    providerKind: args.claim.providerKind,
    providerKey: args.claim.providerKey,
    grantsWorldGeometry,
    acquisition: selectRouteAssistAcquisitionPathV1(capability),
  };
}
