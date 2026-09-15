import assert from "node:assert/strict";
import {
  roomScanCaptureToIndependentLegGraphsV1,
  roomScanCaptureToSingleLegGraphV1,
} from "../lib/visual-assist/route-assist/roomScanGraph";
import type { RouteAssistRoomScanCaptureV1 } from "../components/route-assist/RouteAssistRoomScanCamera";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

function capture(destinations = 1): RouteAssistRoomScanCaptureV1 {
  return {
    version: 1,
    captureKind: "ORDINARY_ROOM_SCAN",
    capturedAt: "2026-09-15T20:00:00.000Z",
    sourceLabel: "existing outlet",
    destinationLabels: Array.from({ length: destinations }, (_, index) => `new outlet ${index + 1}`),
    sourceAnchor: { imageId: "frame-source", x: 0.2, y: 0.6 },
    destinationAnchors: Array.from({ length: destinations }, (_, index) => ({
      id: `destination-${index + 1}`,
      label: `new outlet ${index + 1}`,
      imageId: "frame-destination",
      x: 0.6 + index * 0.1,
      y: 0.55,
    })),
    camera: { facingMode: "environment", width: 1200, height: 1600 },
    sweepFrames: [],
    reviewFrame: null,
  };
}

check("single destination creates only explicit endpoint geometry", () => {
  const graph = roomScanCaptureToSingleLegGraphV1(capture(1));
  assert.ok(graph);
  assert.equal(graph.points.length, 2);
  assert.equal(graph.segments.length, 1);
  assert.equal(graph.points[0].kind, "SOURCE");
  assert.equal(graph.points[1].kind, "DESTINATION");
  assert.equal(graph.segments[0].estimatedLengthFt, undefined);
  assert.equal(graph.points[0].physicalTurn, undefined);
  assert.equal(graph.points[1].obstacle, undefined);
});

check("multi destination capture becomes independent ordered legs without branching inference", () => {
  const graphs = roomScanCaptureToIndependentLegGraphsV1(capture(3));
  assert.ok(graphs);
  assert.equal(graphs.length, 3);
  assert.equal(graphs.every((graph) => graph.points.length === 2 && graph.segments.length === 1), true);
  assert.equal(graphs.every((graph) => graph.points[0].x === 0.2 && graph.points[0].y === 0.6), true);
  assert.equal(new Set(graphs.map((graph) => graph.segments[0].id)).size, 3);
});

check("single-leg helper refuses a multi-destination capture", () => {
  assert.equal(roomScanCaptureToSingleLegGraphV1(capture(2)), null);
});

check("out-of-range image coordinates fail closed", () => {
  const bad = capture(1);
  bad.destinationAnchors[0].x = 1.2;
  assert.equal(roomScanCaptureToIndependentLegGraphsV1(bad), null);
});

check("room scan graph contains no material labor price or inferred metric authority", () => {
  const graphs = roomScanCaptureToIndependentLegGraphsV1(capture(2));
  assert.ok(graphs);
  const serialized = JSON.stringify(graphs).toLowerCase();
  for (const forbidden of ["price", "cost", "material", "labor", "estimatedlengthft", "physicalturn", "obstacle"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

console.log(`Route Assist room-scan graph verification: ${passed} passed, 0 failed.`);
