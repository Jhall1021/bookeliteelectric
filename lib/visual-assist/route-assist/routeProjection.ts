import { buildOrderedRouteGeometryV1 } from "./orderedGeometry";
import type { RoutePoint, RouteSegment } from "./types";

export type RouteAssistProjectionPointV1 = { id: string; x: number; y: number };
export type RouteAssistProjectedRouteV1 = { version: 1; points: RouteAssistProjectionPointV1[]; polylinePoints: string };

/** Adapt the canonical graph to ordered image-space points for rendering. */
export function projectionPointsFromRouteGraphV1(points: RoutePoint[], segments: RouteSegment[]): RouteAssistProjectionPointV1[] | null {
  const ordered = buildOrderedRouteGeometryV1(points, segments);
  if (!ordered) return null;
  const byId = new Map(points.map((point) => [point.id, point]));
  const orderedPoints = ordered.pointIds.map((pointId) => byId.get(pointId));
  if (orderedPoints.some((point) => !point)) return null;

  // One SVG coordinate plane cannot honestly join points from different photos.
  const imageIds = new Set(orderedPoints.map((point) => point!.imageId));
  if (imageIds.size !== 1) return null;

  const result = orderedPoints.map((point) => ({ id: point!.id, x: point!.x, y: point!.y }));
  if (result.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null;
  return result;
}

/** UI projection only; preserves route order/shape and creates no physical facts. */
export function projectOrderedRouteToViewportV1(args: { points: RouteAssistProjectionPointV1[]; viewportWidth?: number; viewportHeight?: number; padding?: number }): RouteAssistProjectedRouteV1 | null {
  const width = args.viewportWidth ?? 400;
  const height = args.viewportHeight ?? 300;
  const padding = args.padding ?? 24;
  const points = args.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 2 || width <= padding * 2 || height <= padding * 2) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sourceWidth = maxX - minX, sourceHeight = maxY - minY;
  const availableWidth = width - padding * 2, availableHeight = height - padding * 2;
  const scaleX = sourceWidth > 0 ? availableWidth / sourceWidth : Number.POSITIVE_INFINITY;
  const scaleY = sourceHeight > 0 ? availableHeight / sourceHeight : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const renderedWidth = sourceWidth * scale, renderedHeight = sourceHeight * scale;
  const offsetX = padding + (availableWidth - renderedWidth) / 2;
  const offsetY = padding + (availableHeight - renderedHeight) / 2;
  const projected = points.map((point) => ({ id: point.id, x: offsetX + (point.x - minX) * scale, y: offsetY + (point.y - minY) * scale }));
  return { version: 1, points: projected, polylinePoints: projected.map((point) => `${point.x},${point.y}`).join(" ") };
}
