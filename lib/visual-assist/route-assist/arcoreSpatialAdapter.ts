import type { RoutePhysicalTurn, RouteSurface } from "./taxonomy";
import type { RouteScanObstacleContext, RouteSegmentOrientation } from "./scanEvidence";
import type { RouteAssistMeasuredSpatialGeometryV1 } from "./spatialGeometryAdapter";

/**
 * Price2Book-side bridge contract for an Android calibrated spatial runtime.
 * The concrete runtime may be ARCore-native or a web spatial implementation,
 * but this shared layer deliberately does not depend on an SDK-specific type.
 *
 * The runtime must align observations to the existing Route Assist graph IDs;
 * it may not create a competing route graph or material/pricing taxonomy.
 */
export type RouteAssistAndroidSpatialBridgeV1 = {
  version: 1;
  calibrated: boolean;
  metricScale: boolean;
  stableCoordinateSystem: boolean;
  sourcePointId: string;
  destinationPointId: string;
  segments: Array<{
    segmentId: string;
    lengthMeters?: number | null;
    surface?: Exclude<RouteSurface, "UNKNOWN"> | null;
    surfacePlaneId?: string | null;
    orientation?: RouteSegmentOrientation | null;
    confidence: number;
  }>;
  transitions: Array<{
    pointId: string;
    physicalTurn?: RoutePhysicalTurn | null;
    obstacleContext?: RouteScanObstacleContext | null;
    confidence: number;
  }>;
};

const FEET_PER_METER = 3.280839895013123;

/**
 * Convert Android spatial output into the exact same provider-neutral measured
 * geometry contract used by the RoomPlan bridge. No Android-specific geometry
 * survives this boundary.
 *
 * Capability authority remains separate: a successful bridge payload does not
 * itself grant WORLD_GEOMETRY. The spatial capability handshake must do that.
 */
export function androidSpatialBridgeToMeasuredSpatialGeometryV1(
  bridge: RouteAssistAndroidSpatialBridgeV1,
): RouteAssistMeasuredSpatialGeometryV1 | null {
  if (
    bridge.version !== 1 ||
    !bridge.calibrated ||
    !bridge.metricScale ||
    !bridge.stableCoordinateSystem ||
    !bridge.sourcePointId ||
    !bridge.destinationPointId
  ) return null;

  const segments = bridge.segments.map((segment) => {
    if (segment.lengthMeters != null && (!Number.isFinite(segment.lengthMeters) || segment.lengthMeters <= 0)) return null;
    return {
      segmentId: segment.segmentId,
      measuredLengthFt: segment.lengthMeters == null ? undefined : segment.lengthMeters * FEET_PER_METER,
      surface: segment.surface,
      surfacePlaneId: segment.surfacePlaneId,
      orientation: segment.orientation,
      confidence: segment.confidence,
    };
  });
  if (segments.some((segment) => segment === null)) return null;

  return {
    version: 1,
    sourcePointId: bridge.sourcePointId,
    destinationPointId: bridge.destinationPointId,
    segments: segments as RouteAssistMeasuredSpatialGeometryV1["segments"],
    transitions: bridge.transitions.map((transition) => ({
      pointId: transition.pointId,
      physicalTurn: transition.physicalTurn,
      obstacleContext: transition.obstacleContext,
      confidence: transition.confidence,
    })),
  };
}
