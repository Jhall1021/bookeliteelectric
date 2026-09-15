import assert from "node:assert/strict";
import { evaluateRouteAssistCaptureReadinessV1 } from "../lib/visual-assist/route-assist/captureReadiness";
import { preparePersistedSweepForVisibleSceneReviewV1 } from "../lib/visual-assist/route-assist/visibleSceneReviewPipeline";
import type { RouteAssistSweepCaptureHandoffV1 } from "../lib/visual-assist/route-assist/captureHandoff";
import type { RouteAssistVisibleSceneProviderV1 } from "../lib/visual-assist/route-assist/visibleSceneProvider";

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => { passed += 1; console.log(`✓ ${name}`); });
}

function handoff(frameCount = 3, width = 1280, height = 720, spanMs = 1800): RouteAssistSweepCaptureHandoffV1 {
  const start = Date.parse("2026-09-15T20:00:00.000Z");
  const persistedFrames = Array.from({ length: frameCount }, (_, sequence) => ({
    imageId: `frame-${sequence}`,
    imageUrl: `https://example.invalid/frame-${sequence}.jpg`,
    mimeType: "image/jpeg" as const,
    width,
    height,
    capturedAt: new Date(start + (frameCount <= 1 ? 0 : (spanMs * sequence) / (frameCount - 1))).toISOString(),
    sequence,
  }));
  const review = persistedFrames[persistedFrames.length - 1];
  return {
    version: 1,
    persistedFrames,
    reviewImage: { imageId: review.imageId, imageUrl: review.imageUrl, mimeType: review.mimeType, width: review.width, height: review.height },
    captureArtifacts: { imageIds: persistedFrames.map((frame) => frame.imageId), overlayImageIds: [] },
  };
}

await check("three adequately sized ordered frames are structurally ready", () => {
  assert.equal(evaluateRouteAssistCaptureReadinessV1(handoff()).status, "READY_FOR_SEMANTIC_REVIEW");
});
await check("too few frames require recapture", () => {
  const result = evaluateRouteAssistCaptureReadinessV1(handoff(2));
  assert.equal(result.status, "RECAPTURE_REQUIRED");
  assert.ok(result.problems.some((problem) => problem.code === "TOO_FEW_FRAMES"));
});
await check("tiny persisted evidence requires recapture", () => {
  const result = evaluateRouteAssistCaptureReadinessV1(handoff(3, 200, 150));
  assert.ok(result.problems.some((problem) => problem.code === "FRAME_TOO_SMALL"));
});
await check("near-instant multi-frame sweep requires recapture", () => {
  const result = evaluateRouteAssistCaptureReadinessV1(handoff(3, 1280, 720, 200));
  assert.ok(result.problems.some((problem) => problem.code === "INSUFFICIENT_TEMPORAL_COVERAGE"));
});
await check("capture readiness creates no semantic or physical route facts", () => {
  const serialized = JSON.stringify(evaluateRouteAssistCaptureReadinessV1(handoff())).toLowerCase();
  for (const forbidden of ["price", "cost", "material", "labor", "footage", "obstacle", "routepoint", "routesegment"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
await check("semantic provider is not called when recapture is required", async () => {
  let calls = 0;
  const provider: RouteAssistVisibleSceneProviderV1 = {
    providerKey: "readiness-proof",
    async analyze() { calls += 1; throw new Error("provider must not be called"); },
  };
  const result = await preparePersistedSweepForVisibleSceneReviewV1({
    handoff: handoff(2),
    provider,
    providerInput: {
      version: 1,
      mode: "SURFACE",
      destinationType: "RECEPTACLE",
      points: [
        { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "graph" },
        { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "graph" },
      ],
      segments: [{ id: "segment", fromPointId: "source", toPointId: "destination" }],
      reviewCorrections: [],
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.semantics, null);
  assert.ok(result.problems.some((problem) => problem.startsWith("TOO_FEW_FRAMES:")));
});

console.log(`Route Assist capture readiness verification: ${passed} passed, 0 failed.`);
