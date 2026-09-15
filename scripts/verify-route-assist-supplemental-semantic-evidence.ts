import assert from "node:assert/strict";
import { proposeVisibleTrimHuggingRouteV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteProposal";
import { buildVisibleTrimRouteOverlayV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteOverlay";
import { validateRouteAssistVisibleSceneSemanticsV1, type RouteAssistVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/visualSceneSemantics";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

const primary = ["frame-source", "frame-door", "frame-destination"];
const supplemental = ["supp-right", "supp-top", "supp-left"];
const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "graph" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "graph" },
];
const segments: RouteSegment[] = [{ id: "segment", fromPointId: "source", toPointId: "destination" }];

const semantics: RouteAssistVisibleSceneSemanticsV1 = {
  version: 1,
  captureImageIds: [...primary],
  objects: [
    { id: "source-object", kind: "SOURCE_RECEPTACLE", imageId: "frame-source", confidence: 0.99, box: { x: 0.1, y: 0.5, width: 0.1, height: 0.15 }, pointId: "source" },
    { id: "baseboard-a", kind: "BASEBOARD_OR_TRIM", imageId: "frame-source", confidence: 0.98, box: { x: 0.1, y: 0.85, width: 0.8, height: 0.05 } },
    { id: "doorway", kind: "DOORWAY", imageId: "frame-door", confidence: 0.97, box: { x: 0.3, y: 0.2, width: 0.4, height: 0.68 } },
    { id: "baseboard-b", kind: "BASEBOARD_OR_TRIM", imageId: "frame-destination", confidence: 0.98, box: { x: 0.05, y: 0.85, width: 0.8, height: 0.05 } },
    { id: "destination-object", kind: "DESTINATION_MARKER", imageId: "frame-destination", confidence: 0.99, box: { x: 0.8, y: 0.5, width: 0.1, height: 0.15 }, pointId: "destination" },
    { id: "left-casing", kind: "DOOR_SIDE_CASING", imageId: "supp-left", confidence: 0.96, box: { x: 0.12, y: 0.15, width: 0.05, height: 0.72 } },
    { id: "top-casing", kind: "DOOR_TOP_CASING", imageId: "supp-top", confidence: 0.96, box: { x: 0.2, y: 0.12, width: 0.6, height: 0.05 } },
    { id: "right-casing", kind: "DOOR_SIDE_CASING", imageId: "supp-right", confidence: 0.96, box: { x: 0.82, y: 0.15, width: 0.05, height: 0.72 } },
  ],
  segmentObservations: [{ segmentId: "segment", imageId: "frame-door", objectIds: ["doorway"], confidence: 0.95 }],
  doorwayGroups: [{ id: "door-group", doorwayObjectId: "doorway", leftCasingObjectId: "left-casing", topCasingObjectId: "top-casing", rightCasingObjectId: "right-casing", entrySide: "LEFT" }],
};

check("supplemental scene objects are valid only when explicitly authorized", () => {
  const rejected = validateRouteAssistVisibleSceneSemanticsV1({ semantics, expectedCaptureImageIds: primary, points, segments });
  assert.ok(rejected.some((problem) => problem.includes("unknown image")));
  const accepted = validateRouteAssistVisibleSceneSemanticsV1({ semantics, expectedCaptureImageIds: primary, authorizedSupplementalImageIds: supplemental, points, segments });
  assert.deepEqual(accepted, []);
});

function proposalFor(supplementIds: string[]) {
  return proposeVisibleTrimHuggingRouteV1({ semantics, expectedCaptureImageIds: primary, authorizedSupplementalImageIds: supplementIds, points, segments });
}

check("supplemental casing evidence can complete a doorway review proposal", () => {
  const proposal = proposalFor(supplemental);
  assert.equal(proposal.status, "REVIEW_REQUIRED");
  assert.deepEqual(proposal.steps.map((step) => step.kind), ["SOURCE", "BASEBOARD", "DOOR_SIDE_UP", "DOOR_TOP", "DOOR_SIDE_DOWN", "BASEBOARD", "DESTINATION"]);
});

check("supplemental image array order cannot change route proposal topology", () => {
  const a = proposalFor(["supp-left", "supp-top", "supp-right"]);
  const b = proposalFor(["supp-right", "supp-left", "supp-top"]);
  assert.deepEqual(a.steps, b.steps);
  assert.deepEqual(a.trimBoundaries, b.trimBoundaries);
});

check("primary source and destination ordering cannot be supplied only by supplemental photos", () => {
  const altered: RouteAssistVisibleSceneSemanticsV1 = {
    ...semantics,
    objects: semantics.objects.map((object) => object.id === "source-object" ? { ...object, imageId: "supp-left" } : object),
  };
  const proposal = proposeVisibleTrimHuggingRouteV1({ semantics: altered, expectedCaptureImageIds: primary, authorizedSupplementalImageIds: supplemental, points, segments });
  assert.equal(proposal.status, "INSUFFICIENT_VISIBLE_EVIDENCE");
  assert.ok(proposal.problems.some((problem) => problem.includes("primary sweep")));
});

check("overlay labels supplemental paths and never draws cross-frame polylines", () => {
  const proposal = proposalFor(supplemental);
  const overlay = buildVisibleTrimRouteOverlayV1({ semantics, proposal, authorizedSupplementalImageIds: supplemental });
  assert.ok(overlay);
  const supplementalPaths = overlay.paths.filter((path) => path.evidenceRole === "SUPPLEMENTAL_RECAPTURE");
  assert.equal(supplementalPaths.length, 3);
  assert.ok(supplementalPaths.every((path) => path.points.length === 1));
  assert.ok(overlay.paths.filter((path) => path.evidenceRole === "PRIMARY_SWEEP").length >= 2);
});

check("supplemental evidence still creates no measurement or pricing authority", () => {
  const proposal = proposalFor(supplemental);
  const serialized = JSON.stringify({ semantics, proposal }).toLowerCase();
  for (const forbidden of ["lengthft", "footage", "price", "cost", "materialtakeoff", "laborcents"]) assert.equal(serialized.includes(forbidden), false);
});

console.log(`Route Assist supplemental semantic evidence verification: ${passed} passed, 0 failed.`);
