/**
 * Proves the second-pass-review hardening fixes with no database, no API
 * key, no network — mirrors this repo's existing Route Assist domain-proof
 * style (verify-route-assist-visible-scene-quality.ts, etc.).
 *
 * Covers: unknown object `kind` fails closed; unknown doorway `entrySide`
 * fails closed instead of being silently guessed as RIGHT; a targeted
 * recapture/correction round cannot silently overturn an already-accepted
 * doorway conclusion for the same scan session, while an unrelated repeat
 * review with the SAME conclusion is not falsely blocked; and the preview
 * gate resolves the way both Route Assist vision endpoints depend on.
 *
 * Run: npx tsx scripts/verify-route-assist-hardening-pass.ts
 */
import assert from "node:assert/strict";
import { validateRouteAssistVisibleSceneSemanticsV1, type RouteAssistVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/visualSceneSemantics";
import { proposeVisibleTrimHuggingRouteV1, routeAssistDoorwayTopologySignatureV1 } from "../lib/visual-assist/route-assist/visibleTrimRouteProposal";
import { buildFixtureVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/fixtureVisibleSceneProvider";
import { isRouteAssistPreviewAllowedV1 } from "../lib/visual-assist/route-assist/previewGate";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn(); passed += 1; console.log(`✓ ${name}`);
}

const points: RoutePoint[] = [
  { id: "source", kind: "SOURCE", x: 0.1, y: 0.5, imageId: "frame-0" },
  { id: "destination", kind: "DESTINATION", x: 0.9, y: 0.5, imageId: "frame-2" },
];
const segments: RouteSegment[] = [{ id: "segment", fromPointId: "source", toPointId: "destination" }];
const captureImageIds = ["frame-0", "frame-1", "frame-2"];

function baseSemantics(): RouteAssistVisibleSceneSemanticsV1 {
  const built = buildFixtureVisibleSceneSemanticsV1({ captureImageIds, sourcePointId: "source", destinationPointId: "destination", segmentId: "segment" });
  assert.ok(built);
  return built;
}

function withEntrySide(semantics: RouteAssistVisibleSceneSemanticsV1, entrySide: string): RouteAssistVisibleSceneSemanticsV1 {
  return { ...semantics, doorwayGroups: semantics.doorwayGroups!.map((group) => ({ ...group, entrySide: entrySide as "LEFT" | "RIGHT" | "UNRESOLVED" })) };
}

function withoutDoorway(semantics: RouteAssistVisibleSceneSemanticsV1): RouteAssistVisibleSceneSemanticsV1 {
  const remaining = new Set(
    semantics.objects.filter((object) => object.kind !== "DOORWAY" && object.kind !== "DOOR_SIDE_CASING" && object.kind !== "DOOR_TOP_CASING").map((object) => object.id),
  );
  return {
    ...semantics,
    objects: semantics.objects.filter((object) => remaining.has(object.id)),
    // A real "the doorway is no longer visible" recapture wouldn't still
    // report a segment observation naming the now-absent doorway objects.
    segmentObservations: semantics.segmentObservations.map((observation) => ({
      ...observation,
      objectIds: observation.objectIds.filter((id) => remaining.has(id)),
    })),
    doorwayGroups: [],
  };
}

function validate(semantics: RouteAssistVisibleSceneSemanticsV1): string[] {
  return validateRouteAssistVisibleSceneSemanticsV1({ semantics, expectedCaptureImageIds: captureImageIds, points, segments });
}

function propose(semantics: RouteAssistVisibleSceneSemanticsV1, previousProposal?: Parameters<typeof proposeVisibleTrimHuggingRouteV1>[0]["previousProposal"]) {
  return proposeVisibleTrimHuggingRouteV1({ semantics, expectedCaptureImageIds: captureImageIds, points, segments, previousProposal });
}

check("unknown object kind fails closed instead of silently vanishing", () => {
  const semantics = baseSemantics();
  semantics.objects[0] = { ...semantics.objects[0], kind: "SOURCE_RECEPTACLE_TYPO" as never };
  const problems = validate(semantics);
  assert.ok(problems.some((p) => p.includes("unknown kind")));
});

check("known object kinds still validate cleanly (no false positive from the new check)", () => {
  assert.deepEqual(validate(baseSemantics()), []);
});

check("unknown doorway entrySide fails closed at the schema boundary", () => {
  const semantics = withEntrySide(baseSemantics(), "SIDEWAYS");
  const problems = validate(semantics);
  assert.ok(problems.some((p) => p.includes("unknown entrySide")));
});

check("a malformed entrySide can never reach the trim proposal (validated away before the LEFT/RIGHT ternary runs)", () => {
  const semantics = withEntrySide(baseSemantics(), "SIDEWAYS");
  const result = propose(semantics);
  assert.equal(result.status, "INSUFFICIENT_VISIBLE_EVIDENCE");
  assert.ok(result.problems.some((p) => p.includes("unknown entrySide")));
});

check("valid LEFT/RIGHT/UNRESOLVED entrySide values still validate cleanly", () => {
  for (const side of ["LEFT", "RIGHT", "UNRESOLVED"]) assert.deepEqual(validate(withEntrySide(baseSemantics(), side)), []);
});

check("doorway topology signature reports LEFT for the fixture's default doorway", () => {
  const result = propose(baseSemantics());
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.deepEqual(routeAssistDoorwayTopologySignatureV1(result), { hasDoorway: true, entrySide: "LEFT" });
});

check("a repeat review with the SAME doorway conclusion is accepted, not falsely blocked", () => {
  const first = propose(baseSemantics());
  assert.equal(first.status, "REVIEW_REQUIRED");
  const second = propose(baseSemantics(), first);
  assert.equal(second.status, "REVIEW_REQUIRED");
  assert.deepEqual(second.trimBoundaries, first.trimBoundaries);
});

check("a later round that flips entrySide against an already-accepted conclusion fails closed", () => {
  const first = propose(baseSemantics());
  assert.equal(first.status, "REVIEW_REQUIRED");
  assert.equal(routeAssistDoorwayTopologySignatureV1(first).entrySide, "LEFT");
  const driftedSemantics = withEntrySide(baseSemantics(), "RIGHT");
  const second = propose(driftedSemantics, first);
  assert.equal(second.status, "INSUFFICIENT_VISIBLE_EVIDENCE");
  assert.ok(second.problems.some((p) => p.includes("does not match a previously accepted conclusion")));
});

check("a later round that loses a previously-accepted doorway entirely also fails closed", () => {
  const first = propose(baseSemantics());
  assert.equal(first.status, "REVIEW_REQUIRED");
  const second = propose(withoutDoorway(baseSemantics()), first);
  assert.equal(second.status, "INSUFFICIENT_VISIBLE_EVIDENCE");
  assert.ok(second.problems.some((p) => p.includes("does not match a previously accepted conclusion")));
});

check("with no previousProposal supplied (a brand-new scan), a fresh doorway conclusion is accepted normally", () => {
  const result = propose(baseSemantics(), null);
  assert.equal(result.status, "REVIEW_REQUIRED");
});

check("previewGate resolves to false outside preview/development (production default)", () => {
  const savedVercel = process.env.VERCEL_ENV;
  const savedNode = process.env.NODE_ENV;
  process.env.VERCEL_ENV = "production";
  // NODE_ENV is read-only in some Node builds; guard the assignment.
  try { (process.env as Record<string, string>).NODE_ENV = "production"; } catch { /* ignore */ }
  assert.equal(isRouteAssistPreviewAllowedV1(), false);
  process.env.VERCEL_ENV = savedVercel;
  try { (process.env as Record<string, string>).NODE_ENV = savedNode ?? "test"; } catch { /* ignore */ }
});

check("previewGate resolves to true in a Vercel preview deployment", () => {
  const saved = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  assert.equal(isRouteAssistPreviewAllowedV1(), true);
  process.env.VERCEL_ENV = saved;
});

console.log(`\nRoute Assist hardening-pass verification: ${passed} passed, 0 failed.`);
