import type { RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";

/**
 * Development-fixture-only synthetic CV output. It lets the browser capture
 * fixture exercise the real semantics -> trim proposal -> overlay -> review
 * chain before a network CV provider is attached. It creates no measurements.
 */
export function buildFixtureVisibleSceneSemanticsV1(args: {
  captureImageIds: string[];
  sourcePointId: string;
  destinationPointId: string;
  segmentId: string;
}): RouteAssistVisibleSceneSemanticsV1 | null {
  const ids = args.captureImageIds;
  if (ids.length < 3) return null;
  const first = ids[0]; const middle = ids[Math.floor(ids.length / 2)]; const last = ids[ids.length - 1];
  return {
    version: 1,
    captureImageIds: [...ids],
    objects: [
      { id: "fixture-source", kind: "SOURCE_RECEPTACLE", imageId: first, confidence: 0.99, box: { x: 0.12, y: 0.55, width: 0.10, height: 0.18 }, pointId: args.sourcePointId },
      { id: "fixture-baseboard-a", kind: "BASEBOARD_OR_TRIM", imageId: first, confidence: 0.98, box: { x: 0.15, y: 0.84, width: 0.75, height: 0.06 } },
      { id: "fixture-doorway", kind: "DOORWAY", imageId: middle, confidence: 0.98, box: { x: 0.30, y: 0.18, width: 0.42, height: 0.70 } },
      { id: "fixture-door-left", kind: "DOOR_SIDE_CASING", imageId: middle, confidence: 0.97, box: { x: 0.28, y: 0.18, width: 0.04, height: 0.70 } },
      { id: "fixture-door-top", kind: "DOOR_TOP_CASING", imageId: middle, confidence: 0.97, box: { x: 0.28, y: 0.16, width: 0.46, height: 0.05 } },
      { id: "fixture-door-right", kind: "DOOR_SIDE_CASING", imageId: middle, confidence: 0.97, box: { x: 0.72, y: 0.18, width: 0.04, height: 0.70 } },
      { id: "fixture-baseboard-b", kind: "BASEBOARD_OR_TRIM", imageId: last, confidence: 0.98, box: { x: 0.08, y: 0.84, width: 0.75, height: 0.06 } },
      { id: "fixture-destination", kind: "DESTINATION_MARKER", imageId: last, confidence: 0.99, box: { x: 0.72, y: 0.50, width: 0.10, height: 0.18 }, pointId: args.destinationPointId },
    ],
    segmentObservations: [{ segmentId: args.segmentId, imageId: middle, objectIds: ["fixture-doorway", "fixture-door-left", "fixture-door-top", "fixture-door-right"], confidence: 0.96 }],
    doorwayGroups: [{ id: "fixture-doorway-group", doorwayObjectId: "fixture-doorway", leftCasingObjectId: "fixture-door-left", topCasingObjectId: "fixture-door-top", rightCasingObjectId: "fixture-door-right", entrySide: "LEFT" }],
  };
}
