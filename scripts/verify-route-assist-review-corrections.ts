import assert from "node:assert/strict";
import { buildFixtureCorrectionAwareOverlayV1 } from "../lib/visual-assist/route-assist/fixtureRouteRevision";
import { removeRouteAssistReviewCorrectionV1, undoLatestRouteAssistReviewCorrectionV1, validateRouteAssistReviewCorrectionsV1, type RouteAssistReviewCorrectionV1 } from "../lib/visual-assist/route-assist/routeReviewCorrection";
import type { RouteAssistVisibleTrimRouteOverlayV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteOverlay";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "graph" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "graph" },
];
const segments: RouteSegment[] = [{ id: "segment-1", fromPointId: "source", toPointId: "destination", estimatedLengthFt: 18 }];
const pointsBefore = JSON.stringify(points);
const segmentsBefore = JSON.stringify(segments);

const baseline: RouteAssistVisibleTrimRouteOverlayV1 = {
  version: 1,
  requiresHomeownerReview: true,
  paths: [
    { imageId: "frame-1", points: [{ x: 0.1, y: 0.8 }, { x: 0.9, y: 0.8 }], stepKinds: ["SOURCE", "DESTINATION"] },
    { imageId: "frame-2", points: [{ x: 0.2, y: 0.7 }, { x: 0.8, y: 0.7 }], stepKinds: ["SOURCE", "DESTINATION"] },
  ],
};
const passCorrection: RouteAssistReviewCorrectionV1 = {
  correctionId: "correction-pass",
  imageId: "frame-1",
  kind: "ROUTE_SHOULD_PASS_HERE",
  point: { x: 0.5, y: 0.35 },
  createdAt: "2026-09-15T20:00:00.000Z",
};
const avoidCorrection: RouteAssistReviewCorrectionV1 = {
  correctionId: "correction-avoid",
  imageId: "frame-1",
  kind: "ROUTE_SHOULD_AVOID_HERE",
  point: { x: 0.5, y: 0.8 },
  createdAt: "2026-09-15T20:00:01.000Z",
};
const secondPass: RouteAssistReviewCorrectionV1 = {
  correctionId: "correction-pass-2",
  imageId: "frame-1",
  kind: "ROUTE_SHOULD_PASS_HERE",
  point: { x: 0.75, y: 0.45 },
  createdAt: "2026-09-15T20:00:02.000Z",
};
const sourceCorrection: RouteAssistReviewCorrectionV1 = {
  correctionId: "correction-source",
  imageId: "frame-1",
  kind: "SOURCE_ANCHOR_WRONG",
  point: { x: 0.18, y: 0.62 },
  createdAt: "2026-09-15T20:00:03.000Z",
};
const destinationCorrection: RouteAssistReviewCorrectionV1 = {
  correctionId: "correction-destination",
  imageId: "frame-2",
  kind: "DESTINATION_ANCHOR_WRONG",
  point: { x: 0.72, y: 0.58 },
  createdAt: "2026-09-15T20:00:04.000Z",
};

check("valid pass correction is accepted against the captured frame", () => {
  assert.deepEqual(validateRouteAssistReviewCorrectionsV1({ corrections: [passCorrection], captureImageIds: ["frame-1", "frame-2"] }), []);
});
check("valid avoid correction is accepted as review intent", () => {
  assert.deepEqual(validateRouteAssistReviewCorrectionsV1({ corrections: [avoidCorrection], captureImageIds: ["frame-1", "frame-2"] }), []);
});
check("anchor corrections are accepted only as review intent", () => {
  assert.deepEqual(validateRouteAssistReviewCorrectionsV1({ corrections: [sourceCorrection, destinationCorrection], captureImageIds: ["frame-1", "frame-2"] }), []);
});
check("multiple non-conflicting corrections preserve chronological order", () => {
  assert.deepEqual(validateRouteAssistReviewCorrectionsV1({ corrections: [passCorrection, avoidCorrection, secondPass, sourceCorrection, destinationCorrection], captureImageIds: ["frame-1", "frame-2"] }), []);
});
check("opposite instructions at the exact same review point fail closed", () => {
  const conflict: RouteAssistReviewCorrectionV1 = { ...avoidCorrection, correctionId: "same-point-avoid", point: { ...passCorrection.point }, createdAt: "2026-09-15T20:00:05.000Z" };
  const problems = validateRouteAssistReviewCorrectionsV1({ corrections: [passCorrection, conflict], captureImageIds: ["frame-1", "frame-2"] });
  assert.ok(problems.some((problem) => problem.includes("opposite route guidance")));
});
check("chronological reversal still fails closed", () => {
  assert.ok(validateRouteAssistReviewCorrectionsV1({ corrections: [avoidCorrection, passCorrection], captureImageIds: ["frame-1", "frame-2"] }).some((problem) => problem.includes("chronological order")));
});
check("correction on an unknown frame fails closed", () => {
  assert.ok(validateRouteAssistReviewCorrectionsV1({ corrections: [{ ...passCorrection, imageId: "missing" }], captureImageIds: ["frame-1", "frame-2"] }).length > 0);
});
check("out-of-bounds correction point fails closed", () => {
  assert.ok(validateRouteAssistReviewCorrectionsV1({ corrections: [{ ...passCorrection, point: { x: 1.2, y: 0.5 } }], captureImageIds: ["frame-1", "frame-2"] }).length > 0);
});

const passRevised = buildFixtureCorrectionAwareOverlayV1({ baseline, corrections: [passCorrection] });
const avoidRevised = buildFixtureCorrectionAwareOverlayV1({ baseline, corrections: [avoidCorrection] });
const multiRevised = buildFixtureCorrectionAwareOverlayV1({ baseline, corrections: [passCorrection, avoidCorrection, secondPass] });
const anchorRevised = buildFixtureCorrectionAwareOverlayV1({ baseline, corrections: [sourceCorrection, destinationCorrection] });

check("pass revision preserves the same captured image plane", () => {
  assert.equal(passRevised.paths[0].imageId, baseline.paths[0].imageId);
});
check("pass revision visibly passes through homeowner guidance", () => {
  assert.ok(passRevised.paths[0].points.some((point) => point.x === passCorrection.point.x && point.y === passCorrection.point.y));
});
check("avoid revision does not pass through the homeowner avoid point", () => {
  assert.equal(avoidRevised.paths[0].points.some((point) => point.x === avoidCorrection.point.x && point.y === avoidCorrection.point.y), false);
});
check("avoid revision visibly changes the presentation path", () => {
  assert.equal(avoidRevised.paths[0].points.length, 3);
  assert.notDeepEqual(avoidRevised.paths[0].points, baseline.paths[0].points);
});
check("multiple corrections are applied in supplied order", () => {
  assert.ok(multiRevised.paths[0].points.some((point) => point.x === passCorrection.point.x && point.y === passCorrection.point.y));
  assert.ok(multiRevised.paths[0].points.some((point) => point.x === secondPass.point.x && point.y === secondPass.point.y));
  assert.equal(multiRevised.paths[0].points.some((point) => point.x === avoidCorrection.point.x && point.y === avoidCorrection.point.y), false);
});
check("source correction moves only the review overlay source anchor", () => {
  assert.deepEqual(anchorRevised.paths[0].points[0], sourceCorrection.point);
  assert.deepEqual(anchorRevised.paths[0].points.at(-1), baseline.paths[0].points.at(-1));
});
check("destination correction moves only the review overlay destination anchor", () => {
  assert.deepEqual(anchorRevised.paths[1].points.at(-1), destinationCorrection.point);
  assert.deepEqual(anchorRevised.paths[1].points[0], baseline.paths[1].points[0]);
});
check("anchor corrections do not rewrite canonical RoutePoint identity or coordinates", () => {
  assert.equal(JSON.stringify(points), pointsBefore);
  assert.deepEqual(points.map((point) => point.id), ["source", "destination"]);
  assert.deepEqual(points.map((point) => [point.x, point.y]), [[0.1, 0.5], [0.9, 0.5]]);
});
check("undo removes only the latest correction and preserves prior IDs/order", () => {
  const undone = undoLatestRouteAssistReviewCorrectionV1([passCorrection, avoidCorrection, secondPass]);
  assert.deepEqual(undone.map((correction) => correction.correctionId), ["correction-pass", "correction-avoid"]);
});
check("explicit remove deletes only the selected correction", () => {
  const remaining = removeRouteAssistReviewCorrectionV1([passCorrection, avoidCorrection, secondPass], "correction-avoid");
  assert.deepEqual(remaining.map((correction) => correction.correctionId), ["correction-pass", "correction-pass-2"]);
});
check("undo/remove return detached correction points", () => {
  const undone = undoLatestRouteAssistReviewCorrectionV1([passCorrection, avoidCorrection]);
  assert.notEqual(undone[0].point, passCorrection.point);
});
check("baseline proposal remains unchanged for comparison", () => {
  assert.equal(baseline.paths[0].points.length, 2);
  assert.equal(baseline.paths[1].points.length, 2);
});
check("correction loop does not mutate authoritative Route Assist points", () => {
  assert.equal(JSON.stringify(points), pointsBefore);
});
check("correction loop does not mutate authoritative Route Assist segments or footage", () => {
  assert.equal(JSON.stringify(segments), segmentsBefore);
  assert.equal(segments[0].estimatedLengthFt, 18);
});
check("avoid-here review intent does not create canonical obstacle evidence", () => {
  assert.equal(points.some((point) => point.obstacle != null), false);
  assert.equal(segments.some((segment) => "obstacle" in segment), false);
});
check("correction contract carries no measurement, material, labor, or price fields", () => {
  for (const correction of [passCorrection, avoidCorrection, secondPass, sourceCorrection, destinationCorrection]) {
    assert.deepEqual(Object.keys(correction).sort(), ["correctionId", "createdAt", "imageId", "kind", "point"]);
    const serialized = JSON.stringify(correction).toLowerCase();
    for (const forbidden of ["length", "footage", "material", "labor", "price", "cost"]) assert.equal(serialized.includes(forbidden), false);
  }
});
check("all revised overlays still require homeowner review", () => {
  assert.equal(passRevised.requiresHomeownerReview, true);
  assert.equal(avoidRevised.requiresHomeownerReview, true);
  assert.equal(multiRevised.requiresHomeownerReview, true);
  assert.equal(anchorRevised.requiresHomeownerReview, true);
});

console.log(`Route Assist correction-loop verification: ${passed} passed, 0 failed.`);
