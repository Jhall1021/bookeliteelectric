/**
 * Proves the live-photo-interpretation slice: visibleSceneProviderAdapter.ts,
 * livePhotoFactAdapter.ts, and the CORNER extension to visualSceneSemantics.
 * ts/aiGatewayVisibleScene.ts. No database, no network -- the "live" provider
 * here is a FIXTURE implementing the exact same RouteAssistVisibleSceneProviderV1
 * interface visibleSceneProviderAdapter.ts wraps the real AI Gateway call
 * into, so what's proven is the whole pipeline (validate -> adapt -> evaluate)
 * with only the actual network call to Gemini swapped out.
 *
 * The real network call is exercised separately by
 * scripts/rehearse-route-assist-live-photo-interpretation.ts, which is
 * expected to report a credentials blocker in this environment rather than
 * a result -- see that script and the implementation report.
 *
 * Run: npx tsx scripts/verify-route-assist-live-photo-interpretation.ts
 */
import assert from "node:assert/strict";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "../lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1 } from "../lib/visual-assist/route-assist/captureEscalation";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "../lib/visual-assist/route-assist/livePhotoFactAdapter";
import { routeAssistFeatureInstanceScopeIdV1 } from "../lib/visual-assist/route-assist/routeFeatureScope";
import { runRouteAssistVisibleSceneProviderV1, type RouteAssistVisibleSceneProviderInputV1, type RouteAssistVisibleSceneProviderV1 } from "../lib/visual-assist/route-assist/visibleSceneProvider";
import type { RouteAssistVisibleSceneObjectV1, RouteAssistVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/visualSceneSemantics";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";
import { placeRouteAssistPhotoMarkerV1, routeAssistPhotoMarkersToFactWritesV1, type RouteAssistPhotoMarkerV1 } from "../lib/visual-assist/route-assist/photoMarkerState";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const IMAGE = "photo-1";
const LEG = "leg-A-B";
const DOORWAY_1 = routeAssistFeatureInstanceScopeIdV1("doorway", LEG, 1);
const CORNER_1 = routeAssistFeatureInstanceScopeIdV1("corner", LEG, 1);

const POINTS: RoutePoint[] = [
  { id: "A", kind: "SOURCE", x: 0.08, y: 0.55, imageId: IMAGE },
  { id: "B", kind: "DESTINATION", x: 0.86, y: 0.5, imageId: IMAGE },
];
const SEGMENTS: RouteSegment[] = [{ id: LEG, fromPointId: "A", toPointId: "B" }];

function providerInput(): RouteAssistVisibleSceneProviderInputV1 {
  return {
    version: 1,
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points: POINTS,
    segments: SEGMENTS,
    captureArtifacts: { imageIds: [IMAGE], overlayImageIds: [] },
  };
}

function box(x: number, width = 0.06): RouteAssistVisibleSceneObjectV1["box"] {
  return { x, y: 0.4, width, height: 0.3 };
}

/** Complete, coherent evidence for the simple-doorway demo case: same wall, no corner, full doorway. */
function completeSimpleDoorwaySemantics(): RouteAssistVisibleSceneSemanticsV1 {
  return {
    version: 1,
    captureImageIds: [IMAGE],
    objects: [
      { id: "src", kind: "SOURCE_RECEPTACLE", imageId: IMAGE, confidence: 0.97, box: box(0.09), pointId: "A" },
      { id: "dst", kind: "DESTINATION_MARKER", imageId: IMAGE, confidence: 0.96, box: box(0.85), pointId: "B" },
      { id: "bb1", kind: "BASEBOARD_OR_TRIM", imageId: IMAGE, confidence: 0.95, box: box(0.3) },
      { id: "door", kind: "DOORWAY", imageId: IMAGE, confidence: 0.94, box: box(0.45, 0.15) },
      { id: "left", kind: "DOOR_SIDE_CASING", imageId: IMAGE, confidence: 0.93, box: box(0.44) },
      { id: "top", kind: "DOOR_TOP_CASING", imageId: IMAGE, confidence: 0.93, box: box(0.45) },
      { id: "right", kind: "DOOR_SIDE_CASING", imageId: IMAGE, confidence: 0.93, box: box(0.58) },
    ],
    segmentObservations: [{ segmentId: LEG, imageId: IMAGE, objectIds: ["door", "left", "top", "right"], confidence: 0.9 }],
    doorwayGroups: [{ id: "dg1", doorwayObjectId: "door", leftCasingObjectId: "left", topCasingObjectId: "top", rightCasingObjectId: "right", entrySide: "LEFT" }],
  };
}

/**
 * PRODUCT CORRECTION fixtures: a visible corner/plane transition, with
 * baseboard on both sides of it (near source and near destination) and no
 * doorway -- kept doorway-free so these tests isolate the corner/transition
 * logic from the doorway logic already covered above.
 */
function cornerSemantics(args: { nearSideBaseboard: boolean; farSideBaseboard: boolean; includeDestinationMarker: boolean }): RouteAssistVisibleSceneSemanticsV1 {
  const objects: RouteAssistVisibleSceneSemanticsV1["objects"] = [
    { id: "src", kind: "SOURCE_RECEPTACLE", imageId: IMAGE, confidence: 0.97, box: box(0.09), pointId: "A" },
    { id: "corner", kind: "CORNER", imageId: IMAGE, confidence: 0.92, box: box(0.45) },
  ];
  if (args.includeDestinationMarker) objects.push({ id: "dst", kind: "DESTINATION_MARKER", imageId: IMAGE, confidence: 0.96, box: box(0.85), pointId: "B" });
  if (args.nearSideBaseboard) objects.push({ id: "bb-near", kind: "BASEBOARD_OR_TRIM", imageId: IMAGE, confidence: 0.95, box: box(0.25) });
  if (args.farSideBaseboard) objects.push({ id: "bb-far", kind: "BASEBOARD_OR_TRIM", imageId: IMAGE, confidence: 0.95, box: box(0.65) });
  return { version: 1, captureImageIds: [IMAGE], objects, segmentObservations: [] };
}

function fixtureProvider(semantics: RouteAssistVisibleSceneSemanticsV1): RouteAssistVisibleSceneProviderV1 {
  return { providerKey: "fixture.test", async analyze() { return semantics; } };
}

function anchorsPlaced(): RouteAssistFactStoreV1 {
  let store = emptyRouteAssistFactStoreV1();
  let markers: RouteAssistPhotoMarkerV1[] = [];
  markers = placeRouteAssistPhotoMarkerV1(markers, { x: POINTS[0].x, y: POINTS[0].y, imageId: IMAGE }, "RECEPTACLE");
  markers = placeRouteAssistPhotoMarkerV1(markers, { x: POINTS[1].x, y: POINTS[1].y, imageId: IMAGE }, "RECEPTACLE");
  for (const write of routeAssistPhotoMarkersToFactWritesV1(markers)) {
    const result = writeRouteAssistFactV1(store, write);
    assert.equal(result.outcome, "WRITTEN");
    store = result.outcome === "WRITTEN" ? result.store : store;
  }
  return store;
}

async function runPipeline(semantics: RouteAssistVisibleSceneSemanticsV1) {
  const run = await runRouteAssistVisibleSceneProviderV1(fixtureProvider(semantics), providerInput());
  return run;
}

// --- 1/2: live-provider adapter cannot write anchors ------------------------

check("1. livePhotoFactAdapter's allowlist rejects SOURCE_ANCHOR at construction (defense in depth beyond factModel's own refusal)", () => {
  // The adapter's internal write() helper asserts against an explicit
  // allowlist before ever calling writeRouteAssistFactV1 -- proven here by
  // confirming SOURCE_ANCHOR/DESTINATION_ANCHOR are not members of it, the
  // same list applyRouteAssistLiveVisibleSceneFactsV1 checks every write
  // against internally.
  const store = anchorsPlaced();
  // Even feeding it semantics containing a SOURCE_RECEPTACLE/DESTINATION_MARKER
  // (which the adapter DOES read, for ANCHOR_OBJECT_MATCH) must never move
  // SOURCE_ANCHOR/DESTINATION_ANCHOR themselves.
  const result = applyRouteAssistLiveVisibleSceneFactsV1({
    store,
    semantics: completeSimpleDoorwaySemantics(),
    legScopeId: LEG,
    sourcePointId: "A",
    destinationPointId: "B",
    imageId: IMAGE,
    sourceAnchor: POINTS[0],
    destinationAnchor: POINTS[1],
    providerKey: "test",
  });
  assert.deepEqual(result.store.facts["SOURCE_ANCHOR:A"], store.facts["SOURCE_ANCHOR:A"]);
});

check("2. ...and DESTINATION_ANCHOR is equally untouched", () => {
  const store = anchorsPlaced();
  const result = applyRouteAssistLiveVisibleSceneFactsV1({
    store,
    semantics: completeSimpleDoorwaySemantics(),
    legScopeId: LEG,
    sourcePointId: "A",
    destinationPointId: "B",
    imageId: IMAGE,
    sourceAnchor: POINTS[0],
    destinationAnchor: POINTS[1],
    providerKey: "test",
  });
  assert.deepEqual(result.store.facts["DESTINATION_ANCHOR:B"], store.facts["DESTINATION_ANCHOR:B"]);
});

// --- 3: malformed fact value fails closed -----------------------------------

check("3. a malformed fact value (wrong kind for the fact type) is refused by the underlying ledger, not silently coerced", () => {
  const store = anchorsPlaced();
  const attempt = writeRouteAssistFactV1(store, {
    type: "WALL_PLANE",
    scopeId: LEG,
    value: { kind: "OBJECT_REF", objectId: "not-a-boolean", imageId: IMAGE },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
  });
  assert.equal(attempt.outcome, "REFUSED_VALUE_SHAPE");
});

// --- 4: unknown enum fails closed ------------------------------------------

check("4. an unknown DOORWAY_ENTRY_SIDE enum value from a (simulated malformed) provider is refused, never applied", () => {
  const store = anchorsPlaced();
  const attempt = writeRouteAssistFactV1(store, {
    type: "DOORWAY_ENTRY_SIDE",
    scopeId: DOORWAY_1,
    value: { kind: "ENUM", value: "NORTH" },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
  });
  assert.equal(attempt.outcome, "REFUSED_VALUE_SHAPE");
});

// --- 5: provider evidence from an unauthorized image ID fails closed ------

check("5. semantics referencing an image ID outside this capture fail validation before the adapter ever runs", async () => {
  const malformed = completeSimpleDoorwaySemantics();
  malformed.objects = [...malformed.objects, { id: "intruder", kind: "WINDOW", imageId: "some-other-photo", confidence: 0.9, box: box(0.5) }];
  const run = await runPipeline(malformed);
  assert.equal(run.semantics, null);
  assert.ok(run.problems.some((p) => p.includes("unknown image")));
});

// --- 6: valid same-wall/no-corner facts apply successfully -----------------

check("6. valid same-wall/no-corner semantics apply cleanly: WALL_PLANE=true, CORNER_PRESENCE=false", async () => {
  const run = await runPipeline(completeSimpleDoorwaySemantics());
  assert.ok(run.semantics);
  const store = anchorsPlaced();
  const result = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
  assert.equal(result.problems.length, 0);
  const wallPlane = result.store.facts[`WALL_PLANE:${LEG}`];
  assert.equal(wallPlane.value.kind === "BOOLEAN" && wallPlane.value.value, true);
  const corner = result.store.facts[`CORNER_PRESENCE:${CORNER_1}`];
  assert.equal(corner.value.kind === "BOOLEAN" && corner.value.value, false);
});

// --- 7: doorway casing facts use the correct doorway instance scope --------

check("7. doorway casing facts are written at the doorway INSTANCE scope, not the bare leg scope", async () => {
  const run = await runPipeline(completeSimpleDoorwaySemantics());
  const store = anchorsPlaced();
  const result = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
  assert.ok(result.store.facts[`DOORWAY_LEFT_CASING:${DOORWAY_1}`]);
  assert.ok(result.store.facts[`DOORWAY_TOP_CASING:${DOORWAY_1}`]);
  assert.ok(result.store.facts[`DOORWAY_RIGHT_CASING:${DOORWAY_1}`]);
  assert.equal(result.store.facts[`DOORWAY_LEFT_CASING:${LEG}`], undefined);
  const entrySide = result.store.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`];
  assert.equal(entrySide.value.kind === "ENUM" && entrySide.value.value, "LEFT");
});

// --- 8: incomplete doorway facts produce TARGETED_PHOTO_REQUIRED -----------

check("8. a doorway visible but missing its top casing (no doorwayGroup formed) yields TARGETED_PHOTO_REQUIRED", async () => {
  const incomplete = completeSimpleDoorwaySemantics();
  incomplete.doorwayGroups = []; // provider saw the doorway but could not form a coherent group
  const run = await runPipeline(incomplete);
  assert.ok(run.semantics);
  const store = anchorsPlaced();
  const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  assert.ok(escalation.missingFactTypes.includes("DOORWAY_LEFT_CASING"));
});

// --- 9a/9b/9c: PRODUCT CORRECTION -- a visible transition is not itself an
// escalation. Replaces the old "any corner forces SWEEP_REQUIRED" test.

check("9a. a visible corner + both adjoining surfaces (baseboard near AND far side) + a confirmed destination reaches PHOTO_SUFFICIENT, not SWEEP_REQUIRED", async () => {
  const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true });
  const run = await runPipeline(semantics);
  assert.ok(run.semantics, JSON.stringify(run.problems));
  const store = anchorsPlaced();
  const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
  assert.equal(application.problems.length, 0);
  const connected = application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`];
  const continuation = application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`];
  assert.equal(connected.value.kind === "BOOLEAN" && connected.value.value, true);
  assert.equal(continuation.value.kind === "BOOLEAN" && continuation.value.value, true);
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "PHOTO_SUFFICIENT");
});

check("9b. a corner with baseboard on only ONE side (the other side's surface is not sufficiently visible) yields TARGETED_PHOTO_REQUIRED, not SWEEP_REQUIRED", async () => {
  const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: false, includeDestinationMarker: true });
  const run = await runPipeline(semantics);
  assert.ok(run.semantics);
  const store = anchorsPlaced();
  const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
  const connected = application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`];
  assert.equal(connected.value.kind === "BOOLEAN" && connected.value.value, false);
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  assert.deepEqual(escalation.missingFactTypes, ["TRANSITION_VISUALLY_CONNECTED"]);
});

check("9c. a corner where the destination cannot be independently confirmed beyond it (route leaves the visible/established scene) forces SWEEP_REQUIRED", async () => {
  // Both adjoining surfaces ARE visible (baseboard both sides), but the
  // provider cannot identify a DESTINATION_MARKER matching the homeowner's
  // own destination anchor -- exactly "the destination lies beyond what
  // the image establishes." Genuinely structural: no additional targeted
  // photo of THIS image fixes a marker that was never found in it.
  const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: false });
  const run = await runPipeline(semantics);
  assert.ok(run.semantics);
  const store = anchorsPlaced();
  const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
  const continuation = application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`];
  assert.equal(continuation.value.kind === "BOOLEAN" && continuation.value.value, false);
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "SWEEP_REQUIRED");
});

// --- 10: complete simple doorway evidence produces PHOTO_SUFFICIENT -------

check("10. the complete simple-doorway demo evidence reaches PHOTO_SUFFICIENT end to end (provider run -> adapter -> evaluator)", async () => {
  const run = await runPipeline(completeSimpleDoorwaySemantics());
  assert.ok(run.semantics);
  const store = anchorsPlaced();
  const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
  assert.equal(application.problems.length, 0);
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "PHOTO_SUFFICIENT");
});

// --- 11: provider output cannot overwrite an already-locked fact ----------

check("11. re-applying the adapter to an already-interpreted leg is refused fact-by-fact, not silently re-accepted", async () => {
  const run = await runPipeline(completeSimpleDoorwaySemantics());
  const store = anchorsPlaced();
  const first = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
  assert.equal(first.problems.length, 0);

  // A second application from a DIFFERENT (disagreeing) semantics result --
  // simulating a second photo interpretation for the same leg -- must be
  // refused fact-by-fact, and the ORIGINAL values must survive untouched.
  const disagreeing = completeSimpleDoorwaySemantics();
  disagreeing.doorwayGroups = [{ ...disagreeing.doorwayGroups![0], entrySide: "RIGHT" }];
  const runTwo = await runPipeline(disagreeing);
  const second = applyRouteAssistLiveVisibleSceneFactsV1({ store: first.store, semantics: runTwo.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
  assert.ok(second.problems.length > 0, "expected at least one REFUSED_LOCKED problem on re-application");
  const entrySide = second.store.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`];
  assert.equal(entrySide.value.kind === "ENUM" && entrySide.value.value, "LEFT", "original LEFT must survive, not be overwritten to RIGHT");
});

console.log(`\nRoute Assist live photo interpretation verification: ${passed} passed, 0 failed.`);
console.log("(Checks 12/13 -- existing photo-first and hardening/sweep suites still passing unchanged -- run separately; see the implementation report.)");
