import assert from "node:assert/strict";
import { preparePersistedSweepForVisibleSceneReviewV1 } from "../lib/visual-assist/route-assist/visibleSceneReviewPipeline";
import { buildFixtureVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/fixtureVisibleSceneProvider";
import type { RouteAssistSweepCaptureHandoffV1 } from "../lib/visual-assist/route-assist/captureHandoff";
import type { RouteAssistVisibleSceneProviderV1 } from "../lib/visual-assist/route-assist/visibleSceneProvider";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn(); passed += 1; console.log(`✓ ${name}`);
}

const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "graph" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "graph" },
];
const segments: RouteSegment[] = [{ id: "segment", fromPointId: "source", toPointId: "destination" }];

function handoff(): RouteAssistSweepCaptureHandoffV1 {
  const frames = [0, 1, 2].map((sequence) => ({
    imageId: `frame-${sequence}`,
    imageUrl: `https://example.invalid/frame-${sequence}.jpg`,
    mimeType: "image/jpeg" as const,
    width: 1280,
    height: 720,
    capturedAt: new Date(Date.parse("2026-09-15T20:00:00.000Z") + sequence * 900).toISOString(),
    sequence,
  }));
  return {
    version: 1,
    persistedFrames: frames,
    reviewImage: { imageId: frames[2].imageId, imageUrl: frames[2].imageUrl, mimeType: frames[2].mimeType, width: frames[2].width, height: frames[2].height },
    captureArtifacts: { imageIds: frames.map((frame) => frame.imageId), overlayImageIds: [] },
  };
}

function providerWithIssue(code: "SOURCE_NOT_CLEAR" | "DESTINATION_NOT_CLEAR" | "DOORWAY_CONTEXT_INCOMPLETE" | "INSUFFICIENT_VISIBLE_ROUTE_CONTEXT", imageIds = ["frame-1"]): RouteAssistVisibleSceneProviderV1 {
  return {
    providerKey: `quality-${code.toLowerCase()}`,
    async analyze(input) {
      const semantics = buildFixtureVisibleSceneSemanticsV1({
        captureImageIds: [...input.captureArtifacts.imageIds],
        sourcePointId: "source",
        destinationPointId: "destination",
        segmentId: "segment",
      });
      assert.ok(semantics);
      return { ...semantics, qualityIssues: [{ code, imageIds: [...imageIds] }] };
    },
  };
}

const providerInput = {
  version: 1 as const,
  mode: "SURFACE" as const,
  destinationType: "RECEPTACLE" as const,
  points,
  segments,
  reviewCorrections: [],
};

await check("source-not-clear produces structured targeted recapture and no route proposal", async () => {
  const result = await preparePersistedSweepForVisibleSceneReviewV1({ handoff: handoff(), provider: providerWithIssue("SOURCE_NOT_CLEAR"), providerInput });
  assert.ok(result.semantics);
  assert.equal(result.proposal, null);
  assert.equal(result.overlay, null);
  assert.deepEqual(result.recaptureIssues.map((issue) => [issue.source, issue.code]), [["SEMANTIC_PROVIDER", "SOURCE_NOT_CLEAR"]]);
  assert.equal(result.recaptureIssues[0].imageIds[0], "frame-1");
  assert.ok(result.recaptureIssues[0].homeownerMessage.includes("existing outlet or source"));
});

await check("destination-not-clear produces targeted recapture and no route proposal", async () => {
  const result = await preparePersistedSweepForVisibleSceneReviewV1({ handoff: handoff(), provider: providerWithIssue("DESTINATION_NOT_CLEAR"), providerInput });
  assert.equal(result.proposal, null);
  assert.equal(result.recaptureIssues[0].code, "DESTINATION_NOT_CLEAR");
  assert.ok(result.recaptureIssues[0].homeownerMessage.includes("new location"));
});

await check("doorway-incomplete asks for doorway recapture rather than guessing topology", async () => {
  const result = await preparePersistedSweepForVisibleSceneReviewV1({ handoff: handoff(), provider: providerWithIssue("DOORWAY_CONTEXT_INCOMPLETE"), providerInput });
  assert.equal(result.overlay, null);
  assert.equal(result.recaptureIssues[0].code, "DOORWAY_CONTEXT_INCOMPLETE");
  assert.ok(result.recaptureIssues[0].homeownerMessage.includes("both sides and the top trim"));
});

await check("quality issue cannot reference an unknown capture image", async () => {
  const result = await preparePersistedSweepForVisibleSceneReviewV1({ handoff: handoff(), provider: providerWithIssue("SOURCE_NOT_CLEAR", ["not-a-frame"]), providerInput });
  assert.equal(result.semantics, null);
  assert.equal(result.recaptureIssues.length, 0);
  assert.ok(result.problems.some((problem) => problem.includes("references unknown image")));
});

await check("quality findings do not mutate canonical Route Assist geometry", async () => {
  const before = JSON.stringify({ points, segments });
  await preparePersistedSweepForVisibleSceneReviewV1({ handoff: handoff(), provider: providerWithIssue("INSUFFICIENT_VISIBLE_ROUTE_CONTEXT"), providerInput });
  assert.equal(JSON.stringify({ points, segments }), before);
});

await check("quality contract carries no measurement, material, labor or pricing authority", async () => {
  const result = await preparePersistedSweepForVisibleSceneReviewV1({ handoff: handoff(), provider: providerWithIssue("INSUFFICIENT_VISIBLE_ROUTE_CONTEXT"), providerInput });
  const serialized = JSON.stringify(result.recaptureIssues).toLowerCase();
  for (const forbidden of ["footage", "lengthft", "material", "labor", "price", "cost", "routingv2"]) assert.equal(serialized.includes(forbidden), false);
});

console.log(`Route Assist visible-scene quality verification: ${passed} passed, 0 failed.`);
