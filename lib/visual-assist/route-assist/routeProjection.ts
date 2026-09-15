export type RouteAssistProjectionPointV1 = {
  id: string;
  x: number;
  y: number;
};

export type RouteAssistProjectedRouteV1 = {
  version: 1;
  points: RouteAssistProjectionPointV1[];
  polylinePoints: string;
};

/**
 * UI projection only. Coordinates must already be derived from reviewable scene
 * geometry; this helper does not infer physical dimensions or manufacture route
 * facts. It normalizes ordered points into an SVG viewport while preserving the
 * route's order and shape.
 */
export function projectOrderedRouteToViewportV1(args: {
  points: RouteAssistProjectionPointV1[];
  viewportWidth?: number;
  viewportHeight?: number;
  padding?: number;
}): RouteAssistProjectedRouteV1 | null {
  const width = args.viewportWidth ?? 400;
  const height = args.viewportHeight ?? 300;
  const padding = args.padding ?? 24;
  const points = args.points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );

  if (points.length < 2 || width <= padding * 2 || height <= padding * 2) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sourceWidth = maxX - minX;
  const sourceHeight = maxY - minY;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;

  const scaleX = sourceWidth > 0 ? availableWidth / sourceWidth : Number.POSITIVE_INFINITY;
  const scaleY = sourceHeight > 0 ? availableHeight / sourceHeight : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = padding + (availableWidth - renderedWidth) / 2;
  const offsetY = padding + (availableHeight - renderedHeight) / 2;

  const projected = points.map((point) => ({
    id: point.id,
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale,
  }));

  return {
    version: 1,
    points: projected,
    polylinePoints: projected.map((point) => `${point.x},${point.y}`).join(" "),
  };
}
