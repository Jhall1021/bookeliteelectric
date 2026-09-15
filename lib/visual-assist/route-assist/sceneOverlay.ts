import { projectionPointsFromRouteGraphV1, type RouteAssistProjectionPointV1 } from "./routeProjection";
import type { RoutePoint, RouteSegment } from "./types";

export type RouteAssistSceneOverlayV1 = {
  version: 1;
  imageId: string;
  imageUrl: string;
  orderedRoutePoints: RouteAssistProjectionPointV1[];
};

/**
 * Bind a canonical single-image Route Assist graph to the exact captured scene
 * it was drawn on. This is presentation provenance only: it creates no route
 * facts, measurements, obstacle classifications, acceptance, materials or price.
 *
 * Fail closed when the graph cannot be projected to one image or the caller's
 * scene image does not match the persisted RoutePoint.imageId.
 */
export function buildRouteAssistSceneOverlayV1(args: {
  points: RoutePoint[];
  segments: RouteSegment[];
  imageId: string;
  imageUrl: string;
}): RouteAssistSceneOverlayV1 | null {
  if (!args.imageId || !args.imageUrl) return null;
  const orderedRoutePoints = projectionPointsFromRouteGraphV1(args.points, args.segments);
  if (!orderedRoutePoints) return null;

  const graphImageIds = new Set(args.points.map((point) => point.imageId));
  if (graphImageIds.size !== 1 || !graphImageIds.has(args.imageId)) return null;

  return {
    version: 1,
    imageId: args.imageId,
    imageUrl: args.imageUrl,
    orderedRoutePoints,
  };
}
