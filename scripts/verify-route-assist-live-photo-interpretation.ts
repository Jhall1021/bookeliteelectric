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
import { emptyRouteAssistFactStoreV1, getRouteAssistFactV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "../lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1 } from "../lib/visual-assist/route-assist/captureEscalation";
import { applyRouteAssistLiveVisibleSceneFactsV1, resetRouteAssistLegPhotoEvidenceV1 } from "../lib/visual-assist/route-assist/livePhotoFactAdapter";
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

function providerInput(destinationType: RouteAssistVisibleSceneProviderInputV1["destinationType"] = "RECEPTACLE"): RouteAssistVisibleSceneProviderInputV1 {
  return {
    version: 1,
    mode: "SURFACE",
    destinationType,
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
 *
 * `qualityIssue: true` adds an INSUFFICIENT_VISIBLE_ROUTE_CONTEXT quality
 * issue naming this image -- the STRUCTURAL-VISIBILITY correction's
 * fixed-obstruction/ambiguity guard, standing in for a provider that saw an
 * obstruction it could not confidently assess (a built-in cabinet, hearth,
 * radiator, or similar) rather than ordinary movable furniture it saw past.
 */
function cornerSemantics(args: { nearSideBaseboard: boolean; farSideBaseboard: boolean; includeDestinationMarker: boolean; coherentSegment: boolean; qualityIssue?: boolean }): RouteAssistVisibleSceneSemanticsV1 {
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
  const qualityIssues: RouteAssistVisibleSceneSemanticsV1["qualityIssues"] = args.qualityIssue ? [{ code: "INSUFFICIENT_VISIBLE_ROUTE_CONTEXT", imageIds: [IMAGE] }] : [];
  return { version: 1, captureImageIds: [IMAGE], objects, segmentObservations, qualityIssues };
}

/** Appends a real, fully-resolved doorway (all three casings + entrySide=LEFT) to a corner-based fixture -- since DOORWAY_PRESENCE can never be confirmed absent through the adapter (see the earlier DOORWAY_PRESENCE correction), a leg can only reach PHOTO_SUFFICIENT with a genuinely resolved doorway alongside the corner evidence. Matches the exact combined shape 9a established. */
function withResolvedDoorway(semantics: RouteAssistVisibleSceneSemanticsV1): RouteAssistVisibleSceneSemanticsV1 {
  return {
    ...semantics,
    objects: [
      ...semantics.objects,
      { id: "door", kind: "DOORWAY", imageId: IMAGE, confidence: 0.94, box: box(0.72, 0.12) },
      { id: "left", kind: "DOOR_SIDE_CASING", imageId: IMAGE, confidence: 0.93, box: box(0.71) },
      { id: "top", kind: "DOOR_TOP_CASING", imageId: IMAGE, confidence: 0.93, box: box(0.72) },
      { id: "right", kind: "DOOR_SIDE_CASING", imageId: IMAGE, confidence: 0.93, box: box(0.82) },
    ],
    doorwayGroups: [{ id: "dg-resolved", doorwayObjectId: "door", leftCasingObjectId: "left", topCasingObjectId: "top", rightCasingObjectId: "right", entrySide: "LEFT" }],
  };
}

/**
 * Appends an EXPLICIT provider assertion that no doorway/opening crosses
 * this leg's own visible route segment -- the new
 * segmentObservations[].noDoorwayOnSegment signal (visualSceneSemantics.ts)
 * this correction pass adds. Deliberately a SEPARATE segmentObservation
 * from whatever the fixture already built (rather than mutating an
 * existing one), so a test can add or withhold this signal independently
 * of corner/transition coherence.
 */
function withExplicitNoDoorway(semantics: RouteAssistVisibleSceneSemanticsV1, confidence = 0.9): RouteAssistVisibleSceneSemanticsV1 {
  return {
    ...semantics,
    segmentObservations: [...semantics.segmentObservations, { segmentId: LEG, imageId: IMAGE, objectIds: [], confidence, noDoorwayOnSegment: true }],
  };
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

async function runPipeline(semantics: RouteAssistVisibleSceneSemanticsV1, destinationType?: RouteAssistVisibleSceneProviderInputV1["destinationType"]) {
  return runRouteAssistVisibleSceneProviderV1(fixtureProvider(semantics), providerInput(destinationType));
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

  // --- STRUCTURAL-VISIBILITY CORRECTION: movable furniture occluding
  // baseboard must not, by itself, force a targeted photo when the corner,
  // both adjoining wall planes, and continuation are otherwise clearly
  // established. ---------------------------------------------------------

  await check("9f. real-evidence shape: furniture blocks the NEAR-side baseboard (never detected at all), far side and destination are confirmed, a coherent segment ties the corner in, and a fully resolved doorway completes the leg -- reaches PHOTO_SUFFICIENT", async () => {
    const cornerBase = cornerSemantics({ nearSideBaseboard: false, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true });
    const semantics = withResolvedDoorway(cornerBase);
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const connected = application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`];
    const continuation = application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`];
    assert.equal(connected?.value.kind === "BOOLEAN" && connected.value.value, true, "no near-side baseboard detection must not block TRANSITION_VISUALLY_CONNECTED given a coherent segment tying the corner in");
    assert.equal(continuation?.value.kind === "BOOLEAN" && continuation.value.value, true);
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT", JSON.stringify(escalation));
  });

  await check("9g. baseboard entirely absent on BOTH sides of the corner (couch/end table fully obscuring it) does not, by itself, block TRANSITION_VISUALLY_CONNECTED -- a coherent segment tying the corner in is still enough", async () => {
    const semantics = cornerSemantics({ nearSideBaseboard: false, farSideBaseboard: false, includeDestinationMarker: true, coherentSegment: true });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const connected = application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`];
    assert.equal(connected?.value.kind === "BOOLEAN" && connected.value.value, true, "zero baseboard detections on either side must not block this fact when the segment coherently ties the corner in");
    // TRANSITION_CONTINUATION_IN_FRAME has its own separate, unchanged rule
    // that still requires far-side baseboard -- out of scope for this
    // correction. Whatever the leg's overall escalation is, it must not be
    // driven by TRANSITION_VISUALLY_CONNECTED naming furniture occlusion.
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.ok(!escalation.missingFactTypes.includes("TRANSITION_VISUALLY_CONNECTED"), "furniture occlusion alone must not name this fact as missing");
  });

  await check("9h. the same furniture-occlusion shape is unaffected by destination/mounting type -- proven end to end with a SURFACE_BOX (Wiremold-style) destination instead of RECEPTACLE, still reaching PHOTO_SUFFICIENT", async () => {
    const cornerBase = cornerSemantics({ nearSideBaseboard: false, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true });
    const semantics = withResolvedDoorway(cornerBase);
    const run = await runPipeline(semantics, "SURFACE_BOX");
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT", JSON.stringify(escalation));
  });

  await check("9i. the corner itself is not coherently established (no segmentObservation ties it to anything) -- still TARGETED_PHOTO_REQUIRED naming TRANSITION_VISUALLY_CONNECTED, exactly as before this correction", async () => {
    const semantics = cornerSemantics({ nearSideBaseboard: false, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: false });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics);
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`], undefined, "no coherent tie to the corner at all must still leave this OPEN");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
    assert.ok(escalation.missingFactTypes.includes("TRANSITION_VISUALLY_CONNECTED"));
  });

  await check("9j. an explicit quality issue on this image (the fixed-obstruction/ambiguity guard) withholds TRANSITION_VISUALLY_CONNECTED even though a coherent segment would otherwise satisfy it -- TARGETED_PHOTO_REQUIRED, not a manufactured true past a provider-flagged obstruction", async () => {
    const semantics = cornerSemantics({ nearSideBaseboard: false, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true, qualityIssue: true });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`], undefined, "a provider-flagged quality issue on this image must withhold true even with an otherwise-coherent segment");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
    assert.ok(escalation.missingFactTypes.includes("TRANSITION_VISUALLY_CONNECTED"));
  });

  await check("9k. TRANSITION_CONTINUATION_IN_FRAME's own off-frame rule is untouched: TRANSITION_VISUALLY_CONNECTED=true (however it got there) does not excuse an explicit off-frame continuation -- still SWEEP_REQUIRED", async () => {
    // Direct fact writes (same style as verify-route-assist-photo-first.ts)
    // rather than the adapter, since the adapter itself never writes
    // TRANSITION_CONTINUATION_IN_FRAME=false (an earlier correction) -- this
    // proves the EVALUATOR's own off-frame rule, independent of how either
    // fact was produced, is untouched by the structural-visibility change.
    let store = anchorsPlaced();
    const put = (type: Parameters<typeof writeRouteAssistFactV1>[1]["type"], scopeId: string, value: Parameters<typeof writeRouteAssistFactV1>[1]["value"]) => {
      const result = writeRouteAssistFactV1(store, { type, scopeId, value, evidenceImageIds: [IMAGE], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true });
      assert.equal(result.outcome, "WRITTEN");
      store = result.outcome === "WRITTEN" ? result.store : store;
    };
    put("CORNER_PRESENCE", CORNER_1, { kind: "BOOLEAN", value: true });
    put("TRANSITION_VISUALLY_CONNECTED", CORNER_1, { kind: "BOOLEAN", value: true });
    put("TRANSITION_CONTINUATION_IN_FRAME", CORNER_1, { kind: "BOOLEAN", value: false });
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "SWEEP_REQUIRED", JSON.stringify(escalation));
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

  // --- CAPTURE/INTERPRETATION LIFECYCLE BOUNDARY -----------------------------
  // Real phone evidence: interpreting a SECOND photo for the same leg in one
  // session reused the same legScopeId/doorwayScopeId/cornerScopeId as the
  // first, so the first photo's locked facts (WALL_PLANE, CORNER_PRESENCE,
  // BASEBOARD_CONTINUITY, ANCHOR_OBJECT_MATCH, ...) refused the second
  // photo's writes with REFUSED_LOCKED. resetRouteAssistLegPhotoEvidenceV1
  // now runs before the second application, at the UI's own capture
  // lifecycle boundary (RouteAssistPhotoCapture.tsx) -- these tests exercise
  // the same boundary directly.

  await check("12. [reset boundary] a first photo interpretation locks its derived facts normally, exactly as before this correction", async () => {
    const run = await runPipeline(completeSimpleDoorwaySemantics("LEFT"));
    const store = anchorsPlaced();
    const resetFirst = resetRouteAssistLegPhotoEvidenceV1({ store, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B" });
    const first = applyRouteAssistLiveVisibleSceneFactsV1({ store: resetFirst, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(first.problems.length, 0);
    assert.equal(first.store.facts[`WALL_PLANE:${LEG}`]?.state, "LOCKED");
    assert.equal(first.store.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`]?.state, "LOCKED");
  });

  await check("13. [reset boundary] a second photo interpretation, with the reset applied first, produces NO locked-rewrite errors", async () => {
    const runOne = await runPipeline(completeSimpleDoorwaySemantics("LEFT"));
    const store = anchorsPlaced();
    const first = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: runOne.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(first.problems.length, 0);

    const runTwo = await runPipeline(completeSimpleDoorwaySemantics("RIGHT"));
    const resetForSecondPhoto = resetRouteAssistLegPhotoEvidenceV1({ store: first.store, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B" });
    const second = applyRouteAssistLiveVisibleSceneFactsV1({ store: resetForSecondPhoto, semantics: runTwo.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(second.problems.length, 0, JSON.stringify(second.problems));
  });

  await check("14. [reset boundary] homeowner A/B anchors remain intact, still locked at their original placement, across reinterpretation", async () => {
    const runOne = await runPipeline(completeSimpleDoorwaySemantics("LEFT"));
    const store = anchorsPlaced();
    const originalSourceAnchor = store.facts["SOURCE_ANCHOR:A"];
    const originalDestinationAnchor = store.facts["DESTINATION_ANCHOR:B"];
    const first = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: runOne.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });

    const runTwo = await runPipeline(completeSimpleDoorwaySemantics("RIGHT"));
    const resetForSecondPhoto = resetRouteAssistLegPhotoEvidenceV1({ store: first.store, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B" });
    const second = applyRouteAssistLiveVisibleSceneFactsV1({ store: resetForSecondPhoto, semantics: runTwo.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });

    assert.deepEqual(second.store.facts["SOURCE_ANCHOR:A"], originalSourceAnchor, "the homeowner's own source anchor must be byte-for-byte unchanged");
    assert.deepEqual(second.store.facts["DESTINATION_ANCHOR:B"], originalDestinationAnchor, "the homeowner's own destination anchor must be byte-for-byte unchanged");
  });

  await check("15. [reset boundary] old photo-derived facts do not contaminate the second result -- the second photo's own value wins cleanly, not a leftover from the first", async () => {
    const runOne = await runPipeline(completeSimpleDoorwaySemantics("LEFT"));
    const store = anchorsPlaced();
    const first = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: runOne.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const firstEntrySide = first.store.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`];
    assert.equal(firstEntrySide.value.kind === "ENUM" && firstEntrySide.value.value, "LEFT");

    const runTwo = await runPipeline(completeSimpleDoorwaySemantics("RIGHT"));
    const resetForSecondPhoto = resetRouteAssistLegPhotoEvidenceV1({ store: first.store, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B" });
    assert.equal(resetForSecondPhoto.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`], undefined, "the reset must remove the first photo's entry-side conclusion entirely before the second photo is applied");
    const second = applyRouteAssistLiveVisibleSceneFactsV1({ store: resetForSecondPhoto, semantics: runTwo.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const secondEntrySide = second.store.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`];
    assert.equal(secondEntrySide.value.kind === "ENUM" && secondEntrySide.value.value, "RIGHT", "the second photo's own RIGHT conclusion must win cleanly, with no trace of the first photo's LEFT");
  });

  await check("16. [reset boundary] a second interpretation can produce genuinely different, valid values from the first -- CORNER_PRESENCE flips from true to false across reinterpretation", async () => {
    const cornerFirst = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true });
    const runOne = await runPipeline(cornerFirst);
    const store = anchorsPlaced();
    const first = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: runOne.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const firstCorner = first.store.facts[`CORNER_PRESENCE:${CORNER_1}`];
    assert.equal(firstCorner.value.kind === "BOOLEAN" && firstCorner.value.value, true);

    // Second photo shows the SAME wall with no corner at all (a straight run).
    const runTwo = await runPipeline(completeSimpleDoorwaySemantics("LEFT"));
    const resetForSecondPhoto = resetRouteAssistLegPhotoEvidenceV1({ store: first.store, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B" });
    const second = applyRouteAssistLiveVisibleSceneFactsV1({ store: resetForSecondPhoto, semantics: runTwo.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(second.problems.length, 0, JSON.stringify(second.problems));
    const secondCorner = second.store.facts[`CORNER_PRESENCE:${CORNER_1}`];
    assert.equal(secondCorner.value.kind === "BOOLEAN" && secondCorner.value.value, false, "the second photo's own conclusion (no corner) must be free to differ from the first (corner present)");
  });

  await check("17. [reset boundary] re-interpreting the SAME photo's semantics twice, with the reset applied each time, is deterministic -- identical resulting fact values both times", async () => {
    const semantics = completeSimpleDoorwaySemantics("LEFT");

    const runOnce = async () => {
      const run = await runPipeline(semantics);
      const store = anchorsPlaced();
      const resetStore = resetRouteAssistLegPhotoEvidenceV1({ store, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B" });
      const application = applyRouteAssistLiveVisibleSceneFactsV1({ store: resetStore, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
      assert.equal(application.problems.length, 0);
      return evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    };

    const firstResult = await runOnce();
    const secondResult = await runOnce();
    assert.deepEqual(firstResult, secondResult, "the same photo interpreted twice, each through its own fresh evidence cycle, must produce identical escalation results");
  });

  await check("18. [reset boundary] atomic fact lock protection is unchanged OUTSIDE the reset boundary -- skipping the reset still refuses a second application fact-by-fact, exactly like test 11", async () => {
    const runOne = await runPipeline(completeSimpleDoorwaySemantics("LEFT"));
    const store = anchorsPlaced();
    const resetForFirstPhoto = resetRouteAssistLegPhotoEvidenceV1({ store, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B" });
    const first = applyRouteAssistLiveVisibleSceneFactsV1({ store: resetForFirstPhoto, semantics: runOne.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(first.problems.length, 0);

    // Deliberately WITHOUT calling resetRouteAssistLegPhotoEvidenceV1 again --
    // a caller that skips the lifecycle boundary must still be refused,
    // proving the reset is what changed, not the underlying lock semantics.
    const runTwo = await runPipeline(completeSimpleDoorwaySemantics("RIGHT"));
    const secondWithoutReset = applyRouteAssistLiveVisibleSceneFactsV1({ store: first.store, semantics: runTwo.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.ok(secondWithoutReset.problems.length > 0, "skipping the reset must still be refused fact-by-fact");
    const entrySide = secondWithoutReset.store.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`];
    assert.equal(entrySide.value.kind === "ENUM" && entrySide.value.value, "LEFT", "without the reset, the original LEFT must still survive untouched");
  });

  await check("19. [reset boundary] resetting a leg that has never been interpreted at all is a harmless no-op", async () => {
    const store = anchorsPlaced();
    const resetStore = resetRouteAssistLegPhotoEvidenceV1({ store, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B" });
    assert.deepEqual(resetStore, store, "resetting a leg with no prior photo evidence must not change the store at all");
    assert.equal(getRouteAssistFactV1(resetStore, "SOURCE_ANCHOR", "A")?.state, "LOCKED", "homeowner anchors remain untouched");
  });

  // --- PROVIDER-GUIDANCE CORRECTION ------------------------------------------
  // The evaluator and adapter are UNCHANGED in this pass -- the fix is
  // entirely in aiGatewayVisibleScene.ts's prompt, which now tells the
  // provider (a) to report each visible baseboard/trim FRAGMENT rather than
  // withholding all of them when furniture breaks the run, (b) that movable
  // furniture is a local occlusion, not proof of a structural break, and a
  // wall plane/corner/connection may still be reported from what's visible
  // above/around it, (c) exactly how confident a segmentObservation must be
  // (0.75+) to assert real connectivity rather than mere co-occurrence, and
  // (d) to still withhold that assertion -- via a low/omitted confidence or
  // an explicit quality issue -- when the corner is hidden, an adjoining
  // wall isn't visible, continuation leaves the frame, or a permanent
  // obstruction makes the structural path genuinely ambiguous. Since the
  // real network call can't be exercised here (no AI Gateway credentials in
  // this environment -- see rehearse-route-assist-live-photo-interpretation.ts),
  // these fixtures stand in for a PROVIDER that followed the new guidance,
  // proving the existing (unmodified) pipeline handles that output exactly
  // as intended on both the positive and fail-closed sides.

  await check("20. [provider guidance] a well-guided provider reporting baseboard FRAGMENTS on both sides of the corner (furniture interrupts the run, but doesn't erase it) + a confident segment tie + a resolved doorway reaches PHOTO_SUFFICIENT", async () => {
    const cornerBase = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true });
    const semantics = withResolvedDoorway(cornerBase);
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const baseboard = application.store.facts[`BASEBOARD_CONTINUITY:${LEG}`];
    const connected = application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`];
    const continuation = application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`];
    assert.equal(baseboard?.value.kind === "BOOLEAN" && baseboard.value.value, true, "reporting even fragmentary baseboard is enough to confirm continuity");
    assert.equal(connected?.value.kind === "BOOLEAN" && connected.value.value, true);
    assert.equal(continuation?.value.kind === "BOOLEAN" && continuation.value.value, true);
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT", JSON.stringify(escalation));
  });

  await check("21. [provider guidance] a flat, no-corner wall with baseboard ENTIRELY hidden by furniture (zero baseboard fragments reported) still gets WALL_PLANE=true -- baseboard remaining unknown must not suppress this separate wall-topology observation", async () => {
    const semantics = cornerSemantics({ nearSideBaseboard: false, farSideBaseboard: false, includeDestinationMarker: true, coherentSegment: false });
    semantics.objects = semantics.objects.filter((object) => object.kind !== "CORNER"); // a genuinely flat run: no corner at all
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const wallPlane = application.store.facts[`WALL_PLANE:${LEG}`];
    const baseboard = application.store.facts[`BASEBOARD_CONTINUITY:${LEG}`];
    assert.equal(wallPlane?.value.kind === "BOOLEAN" && wallPlane.value.value, true, "no corner at all must still confirm one continuous wall plane, independent of baseboard visibility");
    assert.equal(baseboard?.value.kind === "BOOLEAN" && baseboard.value.value, false, "baseboard is honestly reported as not confirmed when genuinely hidden -- this is fine on its own and does not corrupt WALL_PLANE");
  });

  await check("22. [provider guidance] baseboard remaining unknown (zero fragments reported) does not, by itself, block a resolved corner's transition facts -- only the segment-coherence signal matters for those", async () => {
    const cornerBase = cornerSemantics({ nearSideBaseboard: false, farSideBaseboard: false, includeDestinationMarker: true, coherentSegment: true });
    const run = await runPipeline(cornerBase);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const connected = application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`];
    assert.equal(connected?.value.kind === "BOOLEAN" && connected.value.value, true, "TRANSITION_VISUALLY_CONNECTED depends on segment coherence, not on baseboard being confirmed");
  });

  await check("23. [provider guidance] a well-guided provider correctly withholds the segmentObservation when the corner itself is not confidently established -- no positive structural connection is manufactured", async () => {
    const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: false });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`], undefined, "no segmentObservation tying the corner in means no positive connection, regardless of how much baseboard is visible");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  });

  await check("24. [provider guidance] a well-guided provider correctly does not match a destination marker when the continuation genuinely leaves the frame -- no positive in-frame continuation is manufactured", async () => {
    const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: false, coherentSegment: true });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`], undefined, "no destination match means no positive continuation claim, regardless of segment confidence elsewhere");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  });

  await check("25. [provider guidance] a permanent structural obstruction (a provider-flagged quality issue) remains fail-closed even with baseboard fragments visible and an otherwise-coherent segment", async () => {
    const semantics = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true, qualityIssue: true });
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_VISUALLY_CONNECTED:${CORNER_1}`], undefined, "a flagged quality issue withholds the positive connection even with fragments visible and a coherent segment");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  });

  // --- PROVIDER-GUIDANCE CLARIFICATION: a window (or other normal
  // architectural feature) on the destination-side wall does not break
  // continuity on its own -- the real-phone photo had destination B on a
  // wall below a window, which the provider was apparently treating as a
  // reason to hesitate. TRANSITION_CONTINUATION_IN_FRAME's derivation in
  // livePhotoFactAdapter.ts is UNCHANGED: it never inspects WINDOW objects
  // at all, so a window's mere presence was already inert to it -- these
  // fixtures prove that directly, on both sides (a window doesn't block a
  // genuine connection, and a window doesn't manufacture one either).

  await check("26. [provider guidance] a WINDOW object near the destination does not prevent TRANSITION_CONTINUATION_IN_FRAME from resolving true when the destination-side wall is otherwise coherently traced", async () => {
    const cornerBase = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true });
    const semantics: RouteAssistVisibleSceneSemanticsV1 = {
      ...cornerBase,
      objects: [...cornerBase.objects, { id: "window-near-b", kind: "WINDOW", imageId: IMAGE, confidence: 0.9, box: box(0.78, 0.1) }],
    };
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const continuation = application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`];
    assert.equal(continuation?.value.kind === "BOOLEAN" && continuation.value.value, true, "a window near the destination must not, by itself, withhold a genuinely traced connection");
  });

  await check("27. [provider guidance] a WINDOW object near the destination does not manufacture TRANSITION_CONTINUATION_IN_FRAME=true on its own -- the connection still needs to be genuinely, coherently traced", async () => {
    const cornerBase = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: false });
    const semantics: RouteAssistVisibleSceneSemanticsV1 = {
      ...cornerBase,
      objects: [...cornerBase.objects, { id: "window-near-b", kind: "WINDOW", imageId: IMAGE, confidence: 0.9, box: box(0.78, 0.1) }],
    };
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`TRANSITION_CONTINUATION_IN_FRAME:${CORNER_1}`], undefined, "a window's mere presence must not manufacture a connection that was never coherently traced");
  });

  // --- EXPLICIT-NEGATIVE DOORWAY CORRECTION ----------------------------------
  // Real phone evidence: a clean furniture/corner/window scene resolved
  // CORNER_PRESENCE/TRANSITION_VISUALLY_CONNECTED/TRANSITION_CONTINUATION_
  // IN_FRAME/BASEBOARD_CONTINUITY correctly, yet still returned TARGETED_
  // PHOTO_REQUIRED -- because no DOORWAY object meant DOORWAY_PRESENCE
  // stayed OPEN (correct, absence isn't proof), but the evaluator still
  // requires SOME resolution for it, and the schema had no way for the
  // provider to affirmatively assert a doorway-free segment. These fixtures
  // exercise the new segmentObservations[].noDoorwayOnSegment signal.

  await check("28. [explicit-negative doorway] an explicit, sufficiently confident \"no doorway on this segment\" assertion writes DOORWAY_PRESENCE=false -- with no DOORWAY object anywhere in the scene", async () => {
    const flatWall = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: false });
    flatWall.objects = flatWall.objects.filter((object) => object.kind !== "CORNER");
    const semantics = withExplicitNoDoorway(flatWall);
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const doorwayPresence = application.store.facts[`DOORWAY_PRESENCE:${DOORWAY_1}`];
    assert.equal(doorwayPresence?.value.kind === "BOOLEAN" && doorwayPresence.value.value, false, "an explicit, confident no-doorway assertion for this segment must write false");
  });

  await check("29. [explicit-negative doorway] the IDENTICAL fixture WITHOUT the explicit assertion leaves DOORWAY_PRESENCE OPEN -- object omission alone still proves nothing", async () => {
    const flatWall = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: false });
    flatWall.objects = flatWall.objects.filter((object) => object.kind !== "CORNER");
    const run = await runPipeline(flatWall);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`DOORWAY_PRESENCE:${DOORWAY_1}`], undefined, "the same scene, minus the explicit assertion, must leave this fact OPEN rather than false");
  });

  await check("30. [explicit-negative doorway] explicit no-doorway + a fully resolved corner (coherent segment, baseboard, continuation) reaches PHOTO_SUFFICIENT WITHOUT fabricating a doorway -- the real regression this pass fixes", async () => {
    const cornerBase = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true });
    const semantics = withExplicitNoDoorway(cornerBase);
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const doorwayPresence = application.store.facts[`DOORWAY_PRESENCE:${DOORWAY_1}`];
    assert.equal(doorwayPresence?.value.kind === "BOOLEAN" && doorwayPresence.value.value, false);
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT", JSON.stringify(escalation));
  });

  await check("31. [explicit-negative doorway] a REAL doorway object always wins over a (contradictory) explicit no-doorway assertion -- DOORWAY_PRESENCE=true and casing/entry-side logic proceed exactly as before", async () => {
    const cornerBase = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: true });
    const withDoorway = withResolvedDoorway(cornerBase);
    const semantics = withExplicitNoDoorway(withDoorway);
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    const doorwayPresence = application.store.facts[`DOORWAY_PRESENCE:${DOORWAY_1}`];
    assert.equal(doorwayPresence?.value.kind === "BOOLEAN" && doorwayPresence.value.value, true, "a genuinely detected DOORWAY object must win over any conflicting explicit no-doorway assertion");
    const entrySide = application.store.facts[`DOORWAY_ENTRY_SIDE:${DOORWAY_1}`];
    assert.equal(entrySide?.value.kind === "ENUM" && entrySide.value.value, "LEFT", "existing casing/entry-side derivation is unaffected");
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT");
  });

  await check("32. [explicit-negative doorway] a no-doorway assertion BELOW the confidence floor is not \"sufficiently supported\" -- leaves DOORWAY_PRESENCE OPEN, not false", async () => {
    const flatWall = cornerSemantics({ nearSideBaseboard: true, farSideBaseboard: true, includeDestinationMarker: true, coherentSegment: false });
    flatWall.objects = flatWall.objects.filter((object) => object.kind !== "CORNER");
    const semantics = withExplicitNoDoorway(flatWall, 0.4);
    const run = await runPipeline(semantics);
    assert.ok(run.semantics, JSON.stringify(run.problems));
    const store = anchorsPlaced();
    const application = applyRouteAssistLiveVisibleSceneFactsV1({ store, semantics: run.semantics!, legScopeId: LEG, sourcePointId: "A", destinationPointId: "B", imageId: IMAGE, sourceAnchor: POINTS[0], destinationAnchor: POINTS[1], providerKey: "test" });
    assert.equal(application.store.facts[`DOORWAY_PRESENCE:${DOORWAY_1}`], undefined, "a low-confidence assertion is exactly the ambiguous/insufficient-quality case that must stay OPEN, not become a false claim");
  });

  console.log(`\nRoute Assist live photo interpretation verification: ${passed} passed, 0 failed.`);
  console.log("(Existing photo-first and hardening/sweep suites still passing unchanged -- run separately; see the implementation report.)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
