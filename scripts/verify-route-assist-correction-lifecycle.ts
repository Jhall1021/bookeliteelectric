import assert from "node:assert/strict";
import { evaluateRouteAssistReviewCorrectionLifecycleV1, unresolvedRouteAssistReviewCorrectionsV1 } from "../lib/visual-assist/route-assist/routeReviewCorrectionLifecycle";
import type { RouteAssistReviewCorrectionV1 } from "../lib/visual-assist/route-assist/routeReviewCorrection";
import type { RouteAssistVisibleTrimRouteOverlayV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteOverlay";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed += 1; console.log(`✓ ${name}`); }

const corrections: RouteAssistReviewCorrectionV1[] = [
  { correctionId: "pass", imageId: "frame-1", kind: "ROUTE_SHOULD_PASS_HERE", point: { x: 0.50, y: 0.40 }, createdAt: "2026-09-15T20:00:00.000Z" },
  { correctionId: "avoid", imageId: "frame-1", kind: "ROUTE_SHOULD_AVOID_HERE", point: { x: 0.50, y: 0.42 }, createdAt: "2026-09-15T20:00:01.000Z" },
  { correctionId: "old-source", imageId: "frame-1", kind: "SOURCE_ANCHOR_WRONG", point: { x: 0.12, y: 0.62 }, createdAt: "2026-09-15T20:00:02.000Z" },
  { correctionId: "new-source", imageId: "frame-1", kind: "SOURCE_ANCHOR_WRONG", point: { x: 0.18, y: 0.60 }, createdAt: "2026-09-15T20:00:03.000Z" },
  { correctionId: "destination", imageId: "frame-1", kind: "DESTINATION_ANCHOR_WRONG", point: { x: 0.88, y: 0.60 }, createdAt: "2026-09-15T20:00:04.000Z" },
];

const overlay: RouteAssistVisibleTrimRouteOverlayV1 = {
  version: 1,
  requiresHomeownerReview: true,
  paths: [{
    imageId: "frame-1",
    points: [
      { x: 0.18, y: 0.60 },
      { x: 0.50, y: 0.40 },
      { x: 0.72, y: 0.55 },
      { x: 0.88, y: 0.60 },
    ],
    stepKinds: ["SOURCE", "BASEBOARD", "BASEBOARD", "DESTINATION"],
  }],
};

const resolutions = evaluateRouteAssistReviewCorrectionLifecycleV1({ corrections, revisedOverlay: overlay });
const byId = new Map(resolutions.map((resolution) => [resolution.correctionId, resolution]));

check("pass-here can be satisfied only in the revised proposal", () => {
  assert.equal(byId.get("pass")?.status, "SATISFIED_IN_REVISED_PROPOSAL");
});
check("avoid-here remains unresolved when the revised proposal still passes too close", () => {
  assert.equal(byId.get("avoid")?.status, "UNRESOLVED");
});
check("older source-anchor correction is superseded, not deleted", () => {
  assert.equal(byId.get("old-source")?.status, "SUPERSEDED");
  assert.ok(corrections.some((correction) => correction.correctionId === "old-source"));
});
check("newer source-anchor correction can be satisfied in the proposal", () => {
  assert.equal(byId.get("new-source")?.status, "SATISFIED_IN_REVISED_PROPOSAL");
});
check("destination-anchor correction can be satisfied in the proposal", () => {
  assert.equal(byId.get("destination")?.status, "SATISFIED_IN_REVISED_PROPOSAL");
});
check("only unresolved guidance is eligible for the next provider revision", () => {
  assert.deepEqual(unresolvedRouteAssistReviewCorrectionsV1({ corrections, resolutions }).map((correction) => correction.correctionId), ["avoid"]);
});
check("a missing review path keeps instructions unresolved rather than guessing", () => {
  const missing = evaluateRouteAssistReviewCorrectionLifecycleV1({ corrections: [corrections[0]], revisedOverlay: { version: 1, requiresHomeownerReview: true, paths: [] } });
  assert.equal(missing[0].status, "UNRESOLVED");
});
check("proposal satisfaction is not route acceptance", () => {
  assert.equal(overlay.requiresHomeownerReview, true);
  assert.equal(JSON.stringify(resolutions).includes("CONFIRMED"), false);
  assert.equal(JSON.stringify(resolutions).includes("ACCEPTED"), false);
});
check("lifecycle contract contains no pricing, material, labor, footage, or obstacle authority", () => {
  const serialized = JSON.stringify(resolutions).toLowerCase();
  for (const forbidden of ["price", "cost", "material", "labor", "footage", "obstacle"]) assert.equal(serialized.includes(forbidden), false);
});

console.log(`Route Assist correction lifecycle verification: ${passed} passed, 0 failed.`);
