import assert from "node:assert/strict";
import {
  planRouteAssistRecaptureV1,
  buildRouteAssistSupplementalCaptureSetV1,
  persistRouteAssistTargetedSupplementV1,
} from "../lib/visual-assist/route-assist/targetedRecapture";
import { evaluateRouteAssistTargetedRecaptureLifecycleV1 } from "../lib/visual-assist/route-assist/targetedRecaptureLifecycle";
import { createRouteAssistHttpVisibleSceneProviderV1 } from "../lib/visual-assist/route-assist/httpVisibleSceneProvider";
import { runRouteAssistVisibleSceneProviderV1, type RouteAssistVisibleSceneProviderV1 } from "../lib/visual-assist/route-assist/visibleSceneProvider";
import { buildFixtureVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/fixtureVisibleSceneProvider";
import type { RouteAssistRecaptureIssueV1 } from "../lib/visual-assist/route-assist/recaptureIssue";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) { await fn(); passed += 1; console.log(`✓ ${name}`); }

const primary = ["frame-0", "frame-1", "frame-2"];
const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "graph" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "graph" },
];
const segments: RouteSegment[] = [{ id: "segment", fromPointId: "source", toPointId: "destination" }];

const doorwayIssue: RouteAssistRecaptureIssueV1 = {
  source: "SEMANTIC_PROVIDER",
  code: "DOORWAY_CONTEXT_INCOMPLETE",
  imageIds: ["frame-1"],
  homeownerMessage: "doorway needs another view",
};

await check("doorway quality issue creates targeted supplemental plan", () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  assert.equal(plan.mode, "TARGETED_SUPPLEMENT");
  assert.equal(plan.focus, "DOORWAY");
  assert.deepEqual(plan.preserveOriginalImageIds, primary);
  assert.deepEqual(plan.targetImageIds, ["frame-1"]);
  assert.equal(plan.requiresFreshProviderReview, true);
});

await check("structural capture failure requires full sweep and preserves no primary frames", () => {
  const issue: RouteAssistRecaptureIssueV1 = {
    source: "STRUCTURAL_CAPTURE",
    code: "TOO_FEW_FRAMES",
    imageIds: [],
    homeownerMessage: "scan again",
  };
  const plan = planRouteAssistRecaptureV1({ issue, originalImageIds: primary });
  assert.equal(plan.mode, "FULL_SWEEP");
  assert.deepEqual(plan.preserveOriginalImageIds, []);
});

await check("supplemental capture set preserves original sweep separately", () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const set = buildRouteAssistSupplementalCaptureSetV1({ requestId: "doorway-recapture-1", plan, supplementalImageIds: ["doorway-extra-a", "doorway-extra-b"] });
  assert.ok(set);
  assert.deepEqual(set.primarySweepImageIds, primary);
  assert.deepEqual(set.supplementalImageIds, ["doorway-extra-a", "doorway-extra-b"]);
  assert.equal(set.focus, "DOORWAY");
});

await check("supplemental evidence cannot collide with primary sweep identity", () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  assert.equal(buildRouteAssistSupplementalCaptureSetV1({ requestId: "bad", plan, supplementalImageIds: ["frame-1"] }), null);
});

await check("full-sweep plans cannot be converted into supplemental capture sets", () => {
  const issue: RouteAssistRecaptureIssueV1 = { source: "STRUCTURAL_CAPTURE", code: "FRAME_TOO_SMALL", imageIds: ["frame-0"], homeownerMessage: "retake" };
  const plan = planRouteAssistRecaptureV1({ issue, originalImageIds: primary });
  assert.equal(buildRouteAssistSupplementalCaptureSetV1({ requestId: "not-allowed", plan, supplementalImageIds: ["new-0"] }), null);
});

await check("targeted supplemental persistence preserves identity and dimensions", async () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const frames = [
    { imageId: "doorway-local-a", objectUrl: "blob:a", mimeType: "image/jpeg" as const, width: 1200, height: 900 },
    { imageId: "doorway-local-b", objectUrl: "blob:b", mimeType: "image/jpeg" as const, width: 1200, height: 900 },
  ];
  const persisted = await persistRouteAssistTargetedSupplementV1({
    requestId: "doorway-persist-1",
    plan,
    frames,
    persister: { async persist(frame) { return { imageId: frame.imageId, imageUrl: `https://example.invalid/${frame.imageId}.jpg`, mimeType: frame.mimeType, width: frame.width, height: frame.height }; } },
  });
  assert.ok(persisted);
  assert.deepEqual(persisted.captureSet.primarySweepImageIds, primary);
  assert.deepEqual(persisted.captureSet.supplementalImageIds, ["doorway-local-a", "doorway-local-b"]);
  assert.deepEqual(persisted.persistedImages.map((image) => image.width), [1200, 1200]);
});

await check("targeted supplemental persistence fails closed if persister mutates dimensions", async () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const persisted = await persistRouteAssistTargetedSupplementV1({
    requestId: "doorway-persist-bad",
    plan,
    frames: [{ imageId: "doorway-local", objectUrl: "blob:a", mimeType: "image/jpeg", width: 1200, height: 900 }],
    persister: { async persist(frame) { return { imageId: frame.imageId, imageUrl: "https://example.invalid/a.jpg", mimeType: frame.mimeType, width: 600, height: frame.height }; } },
  });
  assert.equal(persisted, null);
});

await check("provider receives primary sweep and supplement as distinct provenance", async () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const set = buildRouteAssistSupplementalCaptureSetV1({ requestId: "doorway-recapture-2", plan, supplementalImageIds: ["doorway-extra"] });
  assert.ok(set);
  let observed = false;
  const provider: RouteAssistVisibleSceneProviderV1 = {
    providerKey: "targeted-recapture-proof",
    async analyze(input) {
      observed = true;
      assert.deepEqual(input.captureArtifacts.imageIds, primary);
      assert.deepEqual(input.supplementalCaptureSets?.[0].primarySweepImageIds, primary);
      assert.deepEqual(input.supplementalCaptureSets?.[0].supplementalImageIds, ["doorway-extra"]);
      const semantics = buildFixtureVisibleSceneSemanticsV1({ captureImageIds: [...input.captureArtifacts.imageIds], sourcePointId: "source", destinationPointId: "destination", segmentId: "segment" });
      assert.ok(semantics);
      return semantics;
    },
  };
  const result = await runRouteAssistVisibleSceneProviderV1(provider, {
    version: 1,
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points,
    segments,
    captureArtifacts: { imageIds: [...primary], overlayImageIds: [] },
    supplementalCaptureSets: [set],
    reviewCorrections: [],
  });
  assert.equal(observed, true);
  assert.ok(result.semantics);
});

await check("supplemental photo chronology is erased before provider execution", async () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const set = buildRouteAssistSupplementalCaptureSetV1({ requestId: "unordered-proof", plan, supplementalImageIds: ["supp-z", "supp-a", "supp-m"] });
  assert.ok(set);
  let observed: string[] | undefined;
  const provider: RouteAssistVisibleSceneProviderV1 = {
    providerKey: "supplement-order-proof",
    async analyze(input) {
      observed = [...(input.supplementalCaptureSets?.[0].supplementalImageIds ?? [])];
      const semantics = buildFixtureVisibleSceneSemanticsV1({ captureImageIds: [...input.captureArtifacts.imageIds], sourcePointId: "source", destinationPointId: "destination", segmentId: "segment" });
      assert.ok(semantics);
      return semantics;
    },
  };
  await runRouteAssistVisibleSceneProviderV1(provider, {
    version: 1,
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points,
    segments,
    captureArtifacts: { imageIds: [...primary], overlayImageIds: [] },
    supplementalCaptureSets: [set],
    reviewCorrections: [],
  });
  assert.deepEqual(observed, ["supp-a", "supp-m", "supp-z"]);
});

await check("supplemental image cannot become a canonical scene-frame reference", async () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const set = buildRouteAssistSupplementalCaptureSetV1({ requestId: "scene-frame-proof", plan, supplementalImageIds: ["doorway-extra"] });
  assert.ok(set);
  const provider: RouteAssistVisibleSceneProviderV1 = {
    providerKey: "supplement-scene-frame-proof",
    async analyze(input) {
      const semantics = buildFixtureVisibleSceneSemanticsV1({ captureImageIds: [...input.captureArtifacts.imageIds], sourcePointId: "source", destinationPointId: "destination", segmentId: "segment" });
      assert.ok(semantics);
      return {
        ...semantics,
        objects: semantics.objects.map((object, index) => index === 0 ? { ...object, imageId: "doorway-extra" } : object),
      };
    },
  };
  const result = await runRouteAssistVisibleSceneProviderV1(provider, {
    version: 1,
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points,
    segments,
    captureArtifacts: { imageIds: [...primary], overlayImageIds: [] },
    supplementalCaptureSets: [set],
    reviewCorrections: [],
  });
  assert.equal(result.semantics, null);
  assert.ok(result.problems.some((problem) => problem.includes("unknown image doorway-extra")));
});

await check("invalid supplemental provenance fails before provider execution", async () => {
  let calls = 0;
  const provider: RouteAssistVisibleSceneProviderV1 = {
    providerKey: "targeted-recapture-invalid-proof",
    async analyze() { calls += 1; throw new Error("must not run"); },
  };
  const result = await runRouteAssistVisibleSceneProviderV1(provider, {
    version: 1,
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points,
    segments,
    captureArtifacts: { imageIds: [...primary], overlayImageIds: [] },
    supplementalCaptureSets: [{ version: 1, requestId: "bad", focus: "DOORWAY", primarySweepImageIds: [...primary].reverse(), supplementalImageIds: ["extra"] }],
    reviewCorrections: [],
  });
  assert.equal(calls, 0);
  assert.equal(result.semantics, null);
  assert.ok(result.problems.some((problem) => problem.includes("exact primary sweep")));
});

await check("resolved supplemental evidence still requires fresh route review", () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const set = buildRouteAssistSupplementalCaptureSetV1({ requestId: "lifecycle-resolved", plan, supplementalImageIds: ["doorway-extra"] });
  assert.ok(set);
  const lifecycle = evaluateRouteAssistTargetedRecaptureLifecycleV1({ request: set, latestQualityIssues: [] });
  assert.equal(lifecycle.status, "RESOLVED_FOR_PROVIDER_REVIEW");
  assert.equal(lifecycle.requiresFreshRouteReview, true);
});

await check("matching provider quality issue keeps targeted request open", () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const set = buildRouteAssistSupplementalCaptureSetV1({ requestId: "lifecycle-open", plan, supplementalImageIds: ["doorway-extra"] });
  assert.ok(set);
  const lifecycle = evaluateRouteAssistTargetedRecaptureLifecycleV1({ request: set, latestQualityIssues: [{ code: "DOORWAY_CONTEXT_INCOMPLETE", imageIds: ["frame-1"] }] });
  assert.equal(lifecycle.status, "STILL_REQUIRED");
});

await check("HTTP transport receives supplemental ids but no durable storage URLs", async () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const set = buildRouteAssistSupplementalCaptureSetV1({ requestId: "http-supplement", plan, supplementalImageIds: ["doorway-z", "doorway-a"] });
  assert.ok(set);
  let requestText = "";
  const provider = createRouteAssistHttpVisibleSceneProviderV1({
    providerKey: "http-targeted-proof",
    transport: {
      async analyze(request) {
        requestText = JSON.stringify(request);
        assert.deepEqual(request.imageIds, primary);
        assert.deepEqual(request.supplementalCaptureSets[0].supplementalImageIds, ["doorway-a", "doorway-z"]);
        const semantics = buildFixtureVisibleSceneSemanticsV1({ captureImageIds: [...request.imageIds], sourcePointId: "source", destinationPointId: "destination", segmentId: "segment" });
        assert.ok(semantics);
        return semantics;
      },
    },
  });
  const result = await runRouteAssistVisibleSceneProviderV1(provider, {
    version: 1,
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points,
    segments,
    captureArtifacts: { imageIds: [...primary], overlayImageIds: [] },
    supplementalCaptureSets: [set],
    reviewCorrections: [],
  });
  assert.ok(result.semantics);
  assert.equal(requestText.includes("https://"), false);
  assert.equal(requestText.includes("imageUrl"), false);
});

await check("targeted recapture contract contains no geometry, measurement, pricing or material authority", () => {
  const plan = planRouteAssistRecaptureV1({ issue: doorwayIssue, originalImageIds: primary });
  const serialized = JSON.stringify(plan).toLowerCase();
  for (const forbidden of ["lengthft", "footage", "price", "cost", "material", "labor", "routepoint", "routesegment", "obstacle"]) assert.equal(serialized.includes(forbidden), false);
});

console.log(`Route Assist targeted recapture verification: ${passed} passed, 0 failed.`);
