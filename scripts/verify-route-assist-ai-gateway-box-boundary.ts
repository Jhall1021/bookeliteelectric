/**
 * Proves the AI Gateway provider-boundary box correction.
 *
 * Real phone evidence: after the normalized-box prompt was strengthened,
 * the model still returned boxes like doorway: x=301, y=247, width=353,
 * height=625 -- clearly a 0..1000 image-coordinate convention, not the
 * requested [0,1] floats -- and one object was even mixed-scale within
 * itself (x=0.165, y=718). The fix is architectural, not a heuristic
 * repair: analyzeRouteAssistVisibleSceneWithAiGatewayV1 now expects the
 * model to emit boxes in a strict integer 0..1000 coordinate system (its
 * OWN provider-local contract, RouteAssistAiGatewayBoxV1), validates that
 * contract itself at this boundary, and only then deterministically
 * divides by 1000 into the canonical [0,1] shape every other Route Assist
 * consumer has always used. A box that fails the provider-local contract
 * is rejected outright -- there is no "if it looks too big, divide by
 * 1000" guess anywhere in this path.
 *
 * Same technique as scripts/verify-release-control.ts: the network
 * boundary (global fetch) is stubbed directly, run via tsx, no mock
 * framework, no change to the function's real signature or behavior.
 *
 * Run: npx tsx scripts/verify-route-assist-ai-gateway-box-boundary.ts
 */
import assert from "node:assert/strict";
import { analyzeRouteAssistVisibleSceneWithAiGatewayV1 } from "../lib/visual-assist/route-assist/aiGatewayVisibleScene";
import type { RouteAssistHttpVisibleSceneRequestV1 } from "../lib/visual-assist/route-assist/httpVisibleSceneProvider";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const IMAGE = "photo-1";
const REQUEST: RouteAssistHttpVisibleSceneRequestV1 = {
  version: 1,
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  pointAnchors: [
    { pointId: "A", kind: "SOURCE", imageId: IMAGE, x: 0.1, y: 0.5 },
    { pointId: "B", kind: "DESTINATION", imageId: IMAGE, x: 0.8, y: 0.5 },
  ],
  segments: [{ segmentId: "leg-A-B", fromPointId: "A", toPointId: "B" }],
  imageIds: [IMAGE],
  supplementalCaptureSets: [],
  reviewCorrections: [],
};
const MEDIA = [{ imageId: IMAGE, url: "https://example.invalid/photo-1.jpg" }];

function rawProviderObject(id: string, box: { x: number; y: number; width: number; height: number }) {
  return { id, kind: "DOORWAY", imageId: IMAGE, confidence: 0.9, box, pointId: null, surfacePlaneId: null };
}

function rawEnvelope(objects: unknown[]) {
  return { version: 1, captureImageIds: [IMAGE], objects, segmentObservations: [], doorwayGroups: [], qualityIssues: [] };
}

function stubbedGatewayResponse(content: string) {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  })) as unknown as typeof fetch;
}

/** Stubs the AI Gateway network call for exactly one analyze() call, then restores both fetch and the auth env var. */
async function withStubbedGateway<T>(objects: unknown[], fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const savedKey = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-token";
  globalThis.fetch = stubbedGatewayResponse(JSON.stringify(rawEnvelope(objects)));
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    process.env.AI_GATEWAY_API_KEY = savedKey;
  }
}

function analyzeWithBox(id: string, box: { x: number; y: number; width: number; height: number }) {
  return withStubbedGateway([rawProviderObject(id, box)], () => analyzeRouteAssistVisibleSceneWithAiGatewayV1({ request: REQUEST, media: MEDIA }));
}

async function assertRejectsWithContractMessage(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: unknown) => error instanceof Error && error.message.includes("0..1000 integer coordinate contract"));
}

async function main() {
  await check("1. a valid 0..1000 doorway box converts exactly to its [0,1] equivalent", async () => {
    const semantics = await analyzeWithBox("doorway-1", { x: 250, y: 100, width: 300, height: 700 });
    const box = semantics.objects.find((o) => o.id === "doorway-1")!.box;
    assert.ok(Math.abs(box.x - 0.25) < 1e-9 && Math.abs(box.y - 0.1) < 1e-9 && Math.abs(box.width - 0.3) < 1e-9 && Math.abs(box.height - 0.7) < 1e-9, JSON.stringify(box));
  });

  await check("2. an edge-touching provider box (x + width = 1000, y + height = 1000) passes", async () => {
    const semantics = await analyzeWithBox("doorway-edge", { x: 700, y: 0, width: 300, height: 1000 });
    assert.ok(semantics.objects.find((o) => o.id === "doorway-edge"));
  });

  await check("3. x + width > 1000 fails closed, not repaired", () => assertRejectsWithContractMessage(analyzeWithBox("doorway-overshoot-x", { x: 800, y: 100, width: 300, height: 100 })));

  await check("4. y + height > 1000 fails closed", () => assertRejectsWithContractMessage(analyzeWithBox("doorway-overshoot-y", { x: 100, y: 800, width: 100, height: 300 })));

  await check("5. negative x/y fails closed", () => assertRejectsWithContractMessage(analyzeWithBox("doorway-negative", { x: -10, y: 100, width: 200, height: 100 })));

  await check("6. a value >= 1000 fails closed", () => assertRejectsWithContractMessage(analyzeWithBox("doorway-too-large", { x: 1000, y: 100, width: 100, height: 100 })));

  await check("7. non-integer provider coordinates fail closed -- no rounding, no coercion", () => assertRejectsWithContractMessage(analyzeWithBox("doorway-fractional", { x: 250.5, y: 100, width: 300, height: 700 })));

  await check(
    "8. the exact real-phone mixed-scale example (x=0.165, y=718, width=0.03, height=0.05) fails closed, not heuristically repaired",
    () => assertRejectsWithContractMessage(analyzeWithBox("source-mixed-scale", { x: 0.165, y: 718, width: 0.03, height: 0.05 })),
  );

  await check("preview diagnostic: under the preview gate, the rejection message names the actual raw provider numbers", async () => {
    const savedVercelEnv = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "preview";
    try {
      await assert.rejects(
        analyzeWithBox("doorway-preview", { x: 800, y: 100, width: 300, height: 100 }),
        (error: unknown) => error instanceof Error && error.message.includes("x=800") && error.message.includes("width=300"),
      );
    } finally {
      process.env.VERCEL_ENV = savedVercelEnv;
    }
  });

  await check("outside preview/dev, the rejection message stays bare -- no raw provider numbers exposed to a non-preview caller", async () => {
    const savedVercelEnv = process.env.VERCEL_ENV;
    const savedNodeEnv = process.env.NODE_ENV;
    process.env.VERCEL_ENV = "production";
    try { (process.env as Record<string, string>).NODE_ENV = "production"; } catch { /* read-only in some Node builds */ }
    try {
      await assert.rejects(
        analyzeWithBox("doorway-production", { x: 800, y: 100, width: 300, height: 100 }),
        (error: unknown) => error instanceof Error && error.message.includes('"doorway-production"') && !error.message.includes("800"),
      );
    } finally {
      process.env.VERCEL_ENV = savedVercelEnv;
      try { (process.env as Record<string, string>).NODE_ENV = savedNodeEnv ?? ""; } catch { /* read-only in some Node builds */ }
    }
  });

  console.log(`\nAI Gateway box-boundary verification: ${passed} passed, 0 failed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
