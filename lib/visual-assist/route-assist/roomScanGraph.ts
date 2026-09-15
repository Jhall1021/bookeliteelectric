import type { RouteAssistRoomScanCaptureV1 } from "@/components/route-assist/RouteAssistRoomScanCamera";
import type { RoutePoint, RouteSegment } from "./types";

export type RouteAssistRoomScanGraphV1 = {
  version: 1;
  points: RoutePoint[];
  segments: RouteSegment[];
};

/**
 * Turn the homeowner's explicit source/destination taps into the smallest
 * possible existing Route Assist graph.
 *
 * This does NOT convert semantic overlay steps into canonical waypoints. Until
 * a physical provider establishes those waypoints, the graph contains exactly
 * the endpoints the homeowner actually tapped. That prevents a review drawing
 * from becoming hidden geometry authority.
 *
 * V1 RouteAssistResult is one A->B path. Multiple destinations are deliberately
 * composed as independent ordered legs by `multiOutletPlan.ts`; this helper is
 * therefore single-leg and fails closed when given zero or multiple B anchors.
 */
export function roomScanCaptureToSingleLegGraphV1(
  capture: RouteAssistRoomScanCaptureV1,
): RouteAssistRoomScanGraphV1 | null {
  if (capture.version !== 1 || !capture.sourceAnchor || capture.destinationAnchors.length !== 1) return null;
  const source = capture.sourceAnchor;
  const destination = capture.destinationAnchors[0];
  if (
    !source.imageId || !destination.imageId ||
    !Number.isFinite(source.x) || !Number.isFinite(source.y) ||
    !Number.isFinite(destination.x) || !Number.isFinite(destination.y) ||
    source.x < 0 || source.x > 1 || source.y < 0 || source.y > 1 ||
    destination.x < 0 || destination.x > 1 || destination.y < 0 || destination.y > 1
  ) return null;

  const sourceId = "room-scan-source";
  const destinationId = "room-scan-destination";
  return {
    version: 1,
    points: [
      { id: sourceId, kind: "SOURCE", imageId: source.imageId, x: source.x, y: source.y },
      { id: destinationId, kind: "DESTINATION", imageId: destination.imageId, x: destination.x, y: destination.y },
    ],
    segments: [
      { id: "room-scan-route-1", fromPointId: sourceId, toPointId: destinationId },
    ],
  };
}
