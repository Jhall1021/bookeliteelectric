import type { RoutePhysicalTurn, RouteSurface } from "./taxonomy";
import type { RouteScanObstacleContext, RouteSegmentOrientation } from "./scanEvidence";
import type { RouteAssistMeasuredSpatialGeometryV1 } from "./spatialGeometryAdapter";

/**
 * Price2Book-side contract for a native Apple RoomPlan bridge.
 *
 * The native bridge owns Apple SDK interaction and coordinate conversion. It
 * must map RoomPlan output to the existing Route Assist graph IDs before this
 * adapter is called. This keeps Apple SDK types out of the shared web/domain
 * layer and prevents RoomPlan from becoming a second route taxonomy.
 */
export type RouteAssistRoomPlanBridgeV1 = {
  version: 1;
  calibrated: boolean;
  metricScale: boolean;
  stableCoordinateSystem: boolean;
  sourcePointId: string;
  destinationPointId: string;
  segments: Array<{
    segmentId: string;
    /** Metric length measured along the proposed physical route segment. */
    lengthMeters?: number | null;
    surface?: Exclude<RouteSurface, "UNKNOWN"> | null;
    surfacePlaneId?: string | null;
    orientation?: RouteSegmentOrientation | null;
    confidence: number;
  }>;
  transitions: Array<{
    pointId: string;
    physicalTurn?: RoutePhysicalTurn | null;
    /** Semantic classification of a visible opening/obstruction. */
    obstacleContext?: RouteScanObstacleContext | null;
    confidence: number;
  }>;
};

const FEET_PER_METER = 3.280839895013123;

/**
 * Convert the native RoomPlan bridge payload to Price2Book's provider-neutral
 * measured geometry contract. This is unit/taxonomy adaptation only.
 *
 * It deliberately does NOT decide that RoomPlan is trustworthy merely because
 * the payload exists. The separate spatial capability handshake must grant
 * WORLD_GEOMETRY before these measurements can become scan evidence.
 */
export function roomPlanBridgeToMeasuredSpatialGeometryV1(
  bridge: RouteAssistRoomPlanBridgeV1,
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
