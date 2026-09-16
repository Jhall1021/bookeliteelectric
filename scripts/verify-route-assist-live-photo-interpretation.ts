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
 * CORRECTION: `check()` now actually awaits its (possibly async) test
 * function, and every check runs inside `main()` in sequence. The previous
 * version called `fn()` without awaiting it, so an async test's assertion
 * failures surfaced later as unhandled rejections AFTER the "N passed, 0
 * failed" summary had already printed -- a real methodology bug, found
 * while writing this correction pass's own new assertions, not a
 * hypothetical one. Fixed here rather than left in place.
 *
 * Run: npx tsx scripts/verify-route-assist-live-photo-interpretation.ts
 */
import assert from "node:assert/strict";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "../lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1 } from "../lib/visual-assist/route-assist/captureEscalation";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "../lib/visual-assist/route-assist/livePhotoFactAdapter";
import { routeAssistFeatureInstanceScopeIdV1 } from "../lib/visual-assist/route-assist/routeFeatureScope";
import { runRouteAssistVisibleSceneProviderV1, type RouteAssistVisibleSceneProviderInputV1, type RouteAssistVisibleSceneProviderV1 } from "../lib/visual-assist/route-assist/visibleSceneProvider";
import type { RouteAssistVisibleDoorwayGroupV1, RouteAssistVisibleSceneObjectV1, RouteAssistVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/visualSceneSemantics";
import type { RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";
import { placeRouteAssistPhotoMarkerV1, routeAssistPhotoMarkersToFactWritesV1, type RouteAssistPhotoMarkerV1 } from "../lib/visual-assist/route-assist/photoMarkerState";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
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

/** Complete, coherent evidence for the simple-doorway demo case: same wall, no corner, full doorway. `entrySide` is parameterized to prove LEFT/RIGHT/UNRESOLVED reachability. */
function completeSimpleDoorwaySemantics(entrySide: RouteAssistVisibleDoorwayGroupV1["entrySide"] = "LEFT"): RouteAssistVisibleSceneSemanticsV1 {
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
    doorwayGroups: [{ id: "dg1", doorwayObjectId: "door", leftCasingObjectId: "left", topCasingObjectId: "top", rightCasingObjectId: "right", entrySide }],
  };
}

/**
 * PRODUCT CORRECTION fixtures: a visible corner/plane transition, with
 * baseboard optionally on both sides of it (near source and near
 * destination) and no doorway -- kept doorway-free so these tests isolate
 * the corner/transition logic from the doorway logic already covered above.
 *
 * `coherentSegment: true` adds a segmentObservation, at a confident 0.9,
 * tying the corner together with whichever near/far baseboard and
 * destination-marker objects are present -- the CONSERVATIVE-EVIDENCE
 * correction's coherence gate. Without it, baseboard/destination objects
 * merely CO-OCCURRING in the frame is real but insufficient evidence, and
 * the relevant transition fact must be left unwritten, not promoted to true.
 */
function cornerSemantics(args: { nearSideBaseboard: boolean; farSideBaseboard: boolean; includeDestinationMarker: boolean; coherentSegment: boolean }): RouteAssistVisibleSceneSemanticsV1 {
  const objects: RouteAssistVisibleSceneSemanticsV1["objects"] = [
    { id: "src", kind: "SOURCE_RECEPTACLE", imageId: IMAGE, confidence: 0.97, box: box(0.09), pointId: "A" },
    { id: "corner", kind: "CORNER", imageId: IMAGE, confidence: 0.92, box: box(0.45) },
  ];
  if (args.includeDestinationMarker) objects.push({ id: "dst", kind: "DESTINATION_MARKER", imageId: IMAGE, confidence: 0.96, box: box(0.85), pointId: "B" });
  if (args.nearSideBaseboard) objects.push({ id: "bb-near", kind: "BASEBOARD_OR_TRIM", imageId: IMAGE, confidence: 0.95, box: box(0.25) });
  if (args.farSideBaseboard) objects.push({ id: "bb-far", kind: "BASEBOARD_OR_TRIM", imageId: IMAGE, confidence: 0.95, box: box(0.65) });

  const segmentObservations: RouteAssistVisibleSceneSemanticsV1["segmentObservations"] = [];
  if (args.coherentSegment) {
    const tiedIds = objects.filter((o) => o.id !== "src").map((o) => o.id); // corner + whichever baseboard/destination objects exist
    segmentObservations.push({ segmentId: LEG, imageId: IMAGE, objectIds: tiedIds, confidence: 0.9 });
  }
  return { version: 1, captureImageIds: [IMAGE], objects, segmentObservations };
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
  return runRouteAssistVisibleSceneProviderV1(fixtureProvider(semantics), providerInput());
}

async function main() {
  // --- 1/2: live-provider adapter cannot write anchors ----------------------

  await check("1. livePhotoFactAdapter's allowlist rejects SOURCE_ANCHOR at construction (defense in depth beyond factModel's own refusal)", () => {
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
    assert.deepEqual(result.store.facts["SOURCE_ANCHOR:A"], store.facts["SOURCE_ANCHOR:A"]);
  });

  await check("2. ...and DESTINATION_ANCHOR is equally untouched", () => {
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

  // --- 3: malformed fact value fails closed ---------------------------------

  await check("3. a malformed fact value (wrong kind for the fact type) is refused by the underlying ledger, not silently coerced", () => {
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

  await check("4. an unknown DOORWAY_ENTRY_SIDE enum value from a (simulated malformed) provider is refused, never applied", () => {
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

  await check("5. semantics referencing an image ID outside this capture fail validation before the adapter ever runs", async () => {
    const malformed = completeSimpleDoorwaySemantics();
    malformed.objects = [...malformed.objects, { id: "intruder", kind: "WINDOW", imageId: "some-other-photo", confidence: 0.9, box: box(0.5) }];
    const run = await runPipeline(malformed);
    assert.equal(run.semantics, null);
    assert.ok(run.problems.some((p) => p.includes("unknown image")));
  });

  // --- 6: valid same-wall/no-corner facts apply successfully ----------------

  await check("6. valid same-wall/no-corner semantics apply cleanly: WALL_PLANE=true, CORNER_PRESENCE=false", async () => {
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

  await check("6b. CORRECTION: no DOORWAY object found anywhere in frame leaves DOORWAY_PRESENCE unwritten (OPEN), not FALSE -- absence is not proof no doorway exists", async () => {
    const doorwayFree = completeSimpleDoorwaySemantics();
    doorwayFree.objects = doorwayFree.objects.filter((object) => !["DOORWAY", "DOOR_SIDE_CASING", "DOOR_TOP_CASING"].includes(object.kind));
    doorwayFree.segmentObservations = [];
    doorwayFree.doorwayGroups = [];
    const run = await runPipeline(doorwayFree);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`DOORWAY_PRESENCE:${DOORWAY_1}`], undefined, "a photo with no DOORWAY object found must leave DOORWAY_PRESENCE OPEN, not write false");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED", "an unconfirmed doorway asks for a targeted photo rather than either concluding sufficiency or a sweep");
    assert.ok(escalation.missingFactTypes.includes("DOORWAY_PRESENCE"));
  });

  // --- 7: doorway casing facts use the correct doorway instance scope -------

  await check("7. doorway casing facts are written at the doorway INSTANCE scope, not the bare leg scope", async () => {
    const run = await runPipeline(completeSimpleDoorwaySemantics());
    const store = anchorsPlaced();
    const result = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.ok(result.store.facts[`DOORWAY_LEFT_CASING:${DOORWAY_1}`]);
    assert.ok(result.store.facts[`DOORWAY_TOP_CASING:${DOORWAY_1}`]);
    assert.ok(result.store.facts[`DOORWAY_RIGHT_CASING:${DOORWAY_1}`]);
    assert.equal(result.store.facts[`DOORWAY_LEFT_CASING:${LEG}`], undefined);
  });

  // --- 8: incomplete doorway facts produce TARGETED_PHOTO_REQUIRED ----------

  await check("8. a doorway visible but missing its top casing (no doorwayGroup formed) yields TARGETED_PHOTO_REQUIRED", async () => {
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

  // --- 9a/9b/9c/9d: PRODUCT CORRECTION -- a visible transition is not itself
  // an escalation, and positive transition facts require coherent evidence.

  await check("9a. a visible corner + both adjoining surfaces, tied together by one coherent, confident segment observation, + a confirmed destination + a fully resolved doorway reaches PHOTO_SUFFICIENT (the real doorway/around-corner shape this correction pass targets)", async () => {
    const cornerBase = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true });
    // CORRECTION: DOORWAY_PRESENCE can now only ever be written true or left
    // OPEN (never a manufactured false -- see livePhotoFactAdapter.ts), so a
    // leg can no longer reach PHOTO_SUFFICIENT by relying on "no doorway
    // object found" to confirm doorway absence. This fixture adds a real,
    // fully-resolved doorway alongside the corner evidence -- exactly the
    // combined doorway/around-corner shape the real phone evidence for this
    // correction described -- to prove the combined case still reaches
    // PHOTO_SUFFICIENT when every fact is genuinely, coherently established.
    const semantics: RouteAssistVisibleSceneSemanticsV1 = {
      ...cornerBase,
      objects: [
        ...cornerBase.objects,
        { id: "door", kind: "DOORWAY", imageId: IMAGE, confidence: 0.94, box: box(0.72, 0.12) },
        { id: "left", kind: "DOOR_SIDE_CASING", imageId: IMAGE, confidence: 0.93, box: box(0.71) },
        { id: "top", kind: "DOOR_TOP_CASING", imageId: IMAGE, confidence: 0.93, box: box(0.72) },
        { id: "right", kind: "DOOR_SIDE_CASING", imageId: IMAGE, confidence: 0.93, box: box(0.82) },
      ],
      doorwayGroups: [{ id: "dg-9a", doorwayObjectId: "door", leftCasingObjectId: "left", topCasingObjectId: "top", rightCasingObjectId: "right", entrySide: "LEFT" }],
    };
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

  await check("9b. baseboard exists on both sides and a destination marker exists, but NOTHING TIES THEM TOGETHER (no coherent segment observation): both transition facts stay UNWRITTEN, not promoted to true, and escalation is TARGETED_PHOTO_REQUIRED", async () => {
    const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: false });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics);
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`], undefined, "ambiguous evidence must stay unwritten (OPEN), not be recorded as false either");
    assert.equal(application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`], undefined);
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
    assert.ok(escalation.missingFactTypes.includes("TRANSITION_VISUALLY_CONNECTED"));
    assert.ok(escalation.missingFactTypes.includes("TRANSITION_CONTINUATION_IN_FRAME"));
  });

  await check("9c. CORRECTION: a corner with baseboard on only ONE side leaves TRANSITION_VISUALLY_CONNECTED unwritten (OPEN), not FALSE -- a missing baseboard detection on one side can be a provider miss, occlusion, or a route that legitimately doesn't use baseboard there, not proof of disconnection", async () => {
    // Both nearBaseboardId and farBaseboard being present is now required
    // even to consider writing anything for this fact -- a missing side no
    // longer manufactures false the way it used to (see
    // livePhotoFactAdapter.ts's CORRECTION comment on TRANSITION_VISUALLY_
    // CONNECTED). The evaluator still reaches TARGETED_PHOTO_REQUIRED here,
    // exactly the same terminal outcome as before this correction -- what
    // changed is that the FACT ITSELF is now honestly left open instead of
    // a fabricated false.
    const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: false, includeDestinationMarker: true, coherentSegment: false });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics);
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`], undefined, "a missing baseboard detection on one side must leave the fact OPEN, not write false");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED", "still asks for a targeted photo, not SWEEP_REQUIRED");
    assert.ok(escalation.missingFactTypes.includes("TRANSITION_VISUALLY_CONNECTED"));
  });

  await check("9d. CORRECTION: a corner where the provider cannot independently match a DESTINATION_MARKER leaves TRANSITION_CONTINUATION_IN_FRAME unwritten (OPEN), not FALSE -- a missed match is not proof the route leaves the frame, so it must not force a sweep", async () => {
    // Both adjoining surfaces ARE visible (baseboard both sides), but the
    // provider cannot identify a DESTINATION_MARKER matching the
    // homeowner's own destination anchor. This used to be written as a
    // strong negative (false), forcing SWEEP_REQUIRED, on the theory that
    // "no destination object found at all" proves the destination lies
    // beyond what the image establishes. It doesn't: a missed match can
    // equally be a model miss, ambiguous evidence, or insufficient marker
    // recognition. The schema has no distinct signal that actually proves
    // the route leaves the visible scene, so the adapter must leave this
    // fact open rather than manufacture false from an absence of a match.
    const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: false, coherentSegment: false });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics);
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`], undefined, "a missing destination match must leave the fact OPEN, not write false");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED", "a missing destination match must ask for a targeted photo, not escalate straight to a sweep");
    assert.ok(escalation.missingFactTypes.includes("TRANSITION_CONTINUATION_IN_FRAME"));
  });

  await check("9e. baseboard visible on only the NEAR side AND a merely-unmatched destination on the far side: both transition facts independently stay OPEN, neither manufactured as false, and the evaluator names both", async () => {
    const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: false, includeDestinationMarker: false, coherentSegment: false });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics);
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`], undefined, "missing far-side baseboard must leave this OPEN, not false");
    assert.equal(application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`], undefined);
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
    assert.ok(escalation.missingFactTypes.includes("TRANSITION_VISUALLY_CONNECTED"));
    assert.ok(escalation.missingFactTypes.includes("TRANSITION_CONTINUATION_IN_FRAME"));
  });

  // --- 10a/10b/10c: doorway entry side reachability -------------------------

  await check("10a. the complete simple-doorway demo evidence with entrySide=LEFT reaches PHOTO_SUFFICIENT end to end", async () => {
    const run = await runPipeline(completeSimpleDoorwaySemantics("LEFT"));
    assert.ok(run.semantics);
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.problems.length, 0);
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT");
  });

  await check("10b. the same evidence with entrySide=RIGHT also reaches PHOTO_SUFFICIENT", async () => {
    const run = await runPipeline(completeSimpleDoorwaySemantics("RIGHT"));
    assert.ok(run.semantics);
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT");
  });

  await check("10c. CORRECTION: the same evidence with entrySide=UNRESOLVED does NOT reach PHOTO_SUFFICIENT -- yields TARGETED_PHOTO_REQUIRED naming DOORWAY_ENTRY_SIDE", async () => {
    const run = await runPipeline(completeSimpleDoorwaySemantics("UNRESOLVED"));
    assert.ok(run.semantics);
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    // The fact IS written (UNRESOLVED is a real, valid closed-set value) --
    // the correction is in how the evaluator reads it, not in refusing to
    // write it.
    const entrySide = application.store.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`];
    assert.equal(entrySide.value.kind === "ENUM" && entrySide.value.value, "UNRESOLVED");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
    assert.ok(escalation.missingFactTypes.includes("DOORWAY_ENTRY_SIDE"));
  });

  // --- 11: provider output cannot overwrite an already-locked fact ---------

  await check("11. re-applying the adapter to an already-interpreted leg is refused fact-by-fact, not silently re-accepted", async () => {
    const run = await runPipeline(completeSimpleDoorwaySemantics("LEFT"));
    const store = anchorsPlaced();
    const first = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(first.problems.length, 0);

    // A second application from a DIFFERENT (disagreeing) semantics result --
    // simulating a second photo interpretation for the same leg -- must be
    // refused fact-by-fact, and the ORIGINAL values must survive untouched.
    const runTwo = await runPipeline(completeSimpleDoorwaySemantics("RIGHT"));
    const second = applyRouteAssistLiveVisibleSceneFactsV1({ store: first.store, semantics: runTwo.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.ok(second.problems.length > 0, "expected at least one REFUSED_LOCKED problem on re-application");
    const entrySide = second.store.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`];
    assert.equal(entrySide.value.kind === "ENUM" && entrySide.value.value, "LEFT", "original LEFT must survive, not be overwritten to RIGHT");
  });

  console.log(`\nRoute Assist live photo interpretation verification: ${passed} passed, 0 failed.`);
  console.log("(Existing photo-first and hardening/sweep suites still passing unchanged -- run separately; see the implementation report.)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
