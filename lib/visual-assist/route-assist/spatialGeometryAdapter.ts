import type {
  RouteAssistScanEvidenceV1,
  RouteScanObstacleContext,
  RouteSegmentOrientation,
} from "./scanEvidence";
import type { RoutePhysicalTurn, RouteSurface } from "./taxonomy";
import type { RoutePoint, RouteSegment } from "./types";
import type { RouteAssistSpatialCapabilityHandshakeV1 } from "./spatialCapability";

export type RouteAssistSpatialSegmentObservationV1 = {
  segmentId: string;
  measuredLengthFt?: number | null;
  surface?: Exclude<RouteSurface, "UNKNOWN"> | null;
  surfacePlaneId?: string | null;
  orientation?: RouteSegmentOrientation | null;
  confidence: number;
};

export type RouteAssistSpatialTransitionObservationV1 = {
  pointId: string;
  physicalTurn?: RoutePhysicalTurn | null;
  obstacleContext?: RouteScanObstacleContext | null;
  confidence: number;
};

export type RouteAssistMeasuredSpatialGeometryV1 = {
  version: 1;
  sourcePointId: string;
  destinationPointId: string;
  segments: RouteAssistSpatialSegmentObservationV1[];
  transitions: RouteAssistSpatialTransitionObservationV1[];
};

function confidence(value: number): number {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}

/**
 * Translate provider-neutral measured spatial geometry into the shared scan
 * evidence contract. RoomPlan, ARCore/WebXR and future calibrated providers
 * should adapt their SDK output into RouteAssistMeasuredSpatialGeometryV1 and
 * use this same translator rather than creating provider-specific Route Assist
 * facts or taxonomies.
 *
 * A successful spatial capability handshake is mandatory before metric values
 * may receive WORLD_GEOMETRY provenance. This function still does not validate
 * against the canonical graph, accept evidence, mutate Routing V2, or price.
 * The existing scan-provider runner remains responsible for graph validation.
 */
export function measuredSpatialGeometryToScanEvidenceV1(args: {
  handshake: RouteAssistSpatialCapabilityHandshakeV1;
  geometry: RouteAssistMeasuredSpatialGeometryV1;
  points: RoutePoint[];
  segments: RouteSegment[];
}): RouteAssistScanEvidenceV1 | null {
  if (!args.handshake.grantsWorldGeometry || args.handshake.acquisition.path !== "WORLD_GEOMETRY") return null;
  if (args.geometry.version !== 1 || args.points.length < 2 || args.segments.length < 1) return null;

  const pointIds = new Set(args.points.map((point) => point.id));
  const segmentIds = new Set(args.segments.map((segment) => segment.id));
  if (!pointIds.has(args.geometry.sourcePointId) || !pointIds.has(args.geometry.destinationPointId)) return null;
  if (args.geometry.segments.some((row) => !segmentIds.has(row.segmentId))) return null;
  if (args.geometry.transitions.some((row) => !pointIds.has(row.pointId))) return null;

  return {
    version: 1,
    sourcePointId: args.geometry.sourcePointId,
    destinationPointId: args.geometry.destinationPointId,
    segments: args.geometry.segments.map((row) => ({
      segmentId: row.segmentId,
      measuredLengthFt: row.measuredLengthFt == null ? undefined : {
        value: row.measuredLengthFt,
        confidence: confidence(row.confidence),
        visibility: "CLEAR",
        basis: "WORLD_GEOMETRY",
      },
      surface: row.surface == null ? undefined : {
        value: row.surface,
        confidence: confidence(row.confidence),
        visibility: "CLEAR",
        basis: "WORLD_GEOMETRY",
      },
      surfacePlaneId: row.surfacePlaneId == null ? undefined : {
        value: row.surfacePlaneId,
        confidence: confidence(row.confidence),
        visibility: "CLEAR",
        basis: "WORLD_GEOMETRY",
      },
      orientation: row.orientation == null ? undefined : {
        value: row.orientation,
        confidence: confidence(row.confidence),
        visibility: "CLEAR",
        basis: "WORLD_GEOMETRY",
      },
    })),
    transitions: args.geometry.transitions.map((row) => ({
      pointId: row.pointId,
      physicalTurn: row.physicalTurn == null ? undefined : {
        value: row.physicalTurn,
        confidence: confidence(row.confidence),
        visibility: "CLEAR",
        basis: "WORLD_GEOMETRY",
      },
      obstacleContext: row.obstacleContext == null ? undefined : {
        value: row.obstacleContext,
        confidence: confidence(row.confidence),
        visibility: "CLEAR",
        basis: "VISIBLE_SCENE",
      },
    })),
  };
}
