import type { RouteAssistRoomScanCaptureV1, RouteAssistRoomScanDestinationAnchorV1 } from "@/components/route-assist/RouteAssistRoomScanCamera";
import type { RoutePoint, RouteSegment } from "./types";

export type RouteAssistRoomScanGraphV1 = {
  version: 1;
  points: RoutePoint[];
  segments: RouteSegment[];
};

function validAnchor(anchor: { imageId: string; x: number; y: number }): boolean {
  return Boolean(
    anchor.imageId &&
    Number.isFinite(anchor.x) &&
    Number.isFinite(anchor.y) &&
    anchor.x >= 0 && anchor.x <= 1 &&
    anchor.y >= 0 && anchor.y <= 1
  );
}

function independentLeg(
  capture: RouteAssistRoomScanCaptureV1,
  destination: RouteAssistRoomScanDestinationAnchorV1,
  index: number,
): RouteAssistRoomScanGraphV1 | null {
  const source = capture.sourceAnchor;
  if (!source || !validAnchor(source) || !validAnchor(destination)) return null;
  const suffix = String(index + 1);
  const sourceId = `room-scan-source-${suffix}`;
  const destinationId = `room-scan-destination-${suffix}`;
  return {
    version: 1,
    points: [
      { id: sourceId, kind: "SOURCE", imageId: source.imageId, x: source.x, y: source.y },
      { id: destinationId, kind: "DESTINATION", imageId: destination.imageId, x: destination.x, y: destination.y },
    ],
    segments: [
      { id: `room-scan-route-${suffix}`, fromPointId: sourceId, toPointId: destinationId },
    ],
  };
}

/**
 * Turn homeowner endpoint taps into independent existing Route Assist paths.
 *
 * A RouteAssistResult is intentionally one SOURCE->DESTINATION path. A room
 * scan with multiple destinations therefore becomes independent legs sharing
 * only the homeowner's source intent. Shared-trunk reuse remains downstream in
 * `multiOutletPlan.ts`; this helper does not invent branch topology from image
 * coordinates or sweep order.
 */
export function roomScanCaptureToIndependentLegGraphsV1(
  capture: RouteAssistRoomScanCaptureV1,
): RouteAssistRoomScanGraphV1[] | null {
  if (capture.version !== 1 || !capture.sourceAnchor || capture.destinationAnchors.length === 0) return null;
  const graphs: RouteAssistRoomScanGraphV1[] = [];
  for (let index = 0; index < capture.destinationAnchors.length; index++) {
    const graph = independentLeg(capture, capture.destinationAnchors[index], index);
    if (!graph) return null;
    graphs.push(graph);
  }
  return graphs;
}

/**
 * Single-destination convenience for today's guided-flow task contract.
 * Multiple destinations fail closed here rather than forcing a branching graph
 * into a schema that deliberately models one ordered path at a time.
 */
export function roomScanCaptureToSingleLegGraphV1(
  capture: RouteAssistRoomScanCaptureV1,
): RouteAssistRoomScanGraphV1 | null {
  if (capture.destinationAnchors.length !== 1) return null;
  return roomScanCaptureToIndependentLegGraphsV1(capture)?.[0] ?? null;
}
