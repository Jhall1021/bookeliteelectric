/**
 * Proves the photo-first slice (factModel.ts, captureEscalation.ts,
 * photoMarkerState.ts, factResolutionProvider.ts, routeFeatureScope.ts) with
 * no database, no API key, no network -- same style as
 * verify-route-assist-hardening-pass.ts.
 *
 * Includes the correction pass: baseboard continuity no longer forces
 * SWEEP_REQUIRED, doorway/corner facts are read at their instance-scoped id,
 * and a fact write is refused if its value doesn't match the shape its fact
 * type requires.
 *
 * This covers state/coordinate/domain behavior only. RouteAssistPhotoCapture.
 * tsx's actual camera/DOM rendering has no browser harness in this repo to
 * extend within this slice's scope -- see the implementation report.
 *
 * Run: npx tsx scripts/verify-route-assist-photo-first.ts
 */
import assert from "node:assert/strict";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1, type RouteAssistFactTypeV1, type RouteAssistFactValueV1 } from "../lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1 } from "../lib/visual-assist/route-assist/captureEscalation";
import { routeAssistFeatureInstanceScopeIdV1 } from "../lib/visual-assist/route-assist/routeFeatureScope";
import {
  placeRouteAssistPhotoMarkerV1,
  removeRouteAssistPhotoMarkerV1,
  repositionRouteAssistPhotoMarkerV1,
  routeAssistPhotoMarkersToFactWritesV1,
  setRouteAssistPhotoMarkerTypeV1,
  type RouteAssistPhotoMarkerV1,
} from "../lib/visual-assist/route-assist/photoMarkerState";
import { applyRouteAssistFactResolutionV1, type RouteAssistFactResolutionRequestV1 } from "../lib/visual-assist/route-assist/factResolutionProvider";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const IMAGE = "photo-1";
const LEG = "leg-A-B";
const DOORWAY_1 = routeAssistFeatureInstanceScopeIdV1("doorway", LEG, 1);
const DOORWAY_2 = routeAssistFeatureInstanceScopeIdV1("doorway", LEG, 2);
const CORNER_1 = routeAssistFeatureInstanceScopeIdV1("corner", LEG, 1);

function anchorsPlaced(): RouteAssistFactStoreV1 {
  let store = emptyRouteAssistFactStoreV1();
  const markers: RouteAssistPhotoMarkerV1[] = [];
  const withSource = placeRouteAssistPhotoMarkerV1(markers, { x: 0.1, y: 0.5, imageId: IMAGE }, "RECEPTACLE");
  const withDestination = placeRouteAssistPhotoMarkerV1(withSource, { x: 0.8, y: 0.5, imageId: IMAGE }, "SWITCH");
  for (const write of routeAssistPhotoMarkersToFactWritesV1(withDestination)) {
    const result = writeRouteAssistFactV1(store, write);
    assert.equal(result.outcome, "WRITTEN");
    store = result.outcome === "WRITTEN" ? result.store : store;
  }
  return store;
}

function writeFact(store: RouteAssistFactStoreV1, type: RouteAssistFactTypeV1, scopeId: string, value: RouteAssistFactValueV1): RouteAssistFactStoreV1 {
  const result = writeRouteAssistFactV1(store, { type, scopeId, value, evidenceImageIds: [IMAGE], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true });
  assert.equal(result.outcome, "WRITTEN", `expected WRITTEN for ${type}:${scopeId}, got ${result.outcome}${"problem" in result ? ` (${result.problem})` : ""}`);
  return result.outcome === "WRITTEN" ? result.store : store;
}

// --- 1/2: homeowner source/destination anchors lock immediately ------------

check("homeowner source anchor locks immediately on write", () => {
  const store = anchorsPlaced();
  const fact = store.facts["SOURCE_ANCHOR:A"];
  assert.ok(fact);
  assert.equal(fact.state, "LOCKED");
  assert.equal(fact.provenance.source, "HOMEOWNER_PLACEMENT");
});

check("homeowner destination anchor locks immediately on write", () => {
  const store = anchorsPlaced();
  const fact = store.facts["DESTINATION_ANCHOR:B"];
  assert.ok(fact);
  assert.equal(fact.state, "LOCKED");
  assert.equal(fact.provenance.source, "HOMEOWNER_PLACEMENT");
});

// --- 3: later provider response cannot overwrite locked anchor coords -----

check("a later provider write cannot move a locked anchor's coordinates", () => {
  const store = anchorsPlaced();
  const original = store.facts["SOURCE_ANCHOR:A"];
  const attempt = writeRouteAssistFactV1(store, {
    type: "SOURCE_ANCHOR",
    scopeId: "A",
    value: { kind: "ANCHOR", point: { x: 0.99, y: 0.99, imageId: IMAGE }, markerType: "RECEPTACLE" },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test-provider", at: new Date().toISOString() },
  });
  assert.equal(attempt.outcome, "REFUSED_PROVENANCE");
  assert.deepEqual(store.facts["SOURCE_ANCHOR:A"], original);
});

check("even a (hypothetical) HOMEOWNER_PLACEMENT rewrite of an already-locked anchor is refused -- lock, not just provenance, protects it", () => {
  const store = anchorsPlaced();
  const original = store.facts["SOURCE_ANCHOR:A"];
  const attempt = writeRouteAssistFactV1(store, {
    type: "SOURCE_ANCHOR",
    scopeId: "A",
    value: { kind: "ANCHOR", point: { x: 0.2, y: 0.6, imageId: IMAGE }, markerType: "RECEPTACLE" },
    evidenceImageIds: [IMAGE],
    provenance: { source: "HOMEOWNER_PLACEMENT", at: new Date().toISOString() },
  });
  assert.equal(attempt.outcome, "REFUSED_LOCKED");
  assert.deepEqual(store.facts["SOURCE_ANCHOR:A"], original);
});

// --- 4: typed marker state preserves outlet/switch/light identity ---------

check("typed marker state preserves outlet/switch/light identity through placement, reposition, and retagging", () => {
  let markers: RouteAssistPhotoMarkerV1[] = [];
  markers = placeRouteAssistPhotoMarkerV1(markers, { x: 0.1, y: 0.5, imageId: IMAGE }, "RECEPTACLE");
  markers = placeRouteAssistPhotoMarkerV1(markers, { x: 0.6, y: 0.5, imageId: IMAGE }, "SWITCH");
  markers = placeRouteAssistPhotoMarkerV1(markers, { x: 0.9, y: 0.5, imageId: IMAGE }, "WALL_LIGHT");
  assert.deepEqual(markers.map((m) => [m.label, m.markerType]), [["A", "RECEPTACLE"], ["B", "SWITCH"], ["C", "WALL_LIGHT"]]);

  markers = repositionRouteAssistPhotoMarkerV1(markers, "marker-destination-B", { x: 0.65, y: 0.52 });
  const repositioned = markers.find((m) => m.label === "B")!;
  assert.equal(repositioned.markerType, "SWITCH");
  assert.equal(repositioned.x, 0.65);

  markers = setRouteAssistPhotoMarkerTypeV1(markers, repositioned.id, "CEILING_LIGHT");
  assert.equal(markers.find((m) => m.label === "B")!.markerType, "CEILING_LIGHT");

  markers = removeRouteAssistPhotoMarkerV1(markers, markers.find((m) => m.label === "B")!.id);
  assert.deepEqual(markers.map((m) => [m.label, m.markerType]), [["A", "RECEPTACLE"], ["B", "WALL_LIGHT"]]);
});

// --- 5: single-photo same-plane route resolves to PHOTO_SUFFICIENT --------

check("a fully-resolved, same-plane, no-doorway leg resolves to PHOTO_SUFFICIENT", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "WALL_PLANE", LEG, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "BASEBOARD_CONTINUITY", LEG, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "DOORWAY_PRESENCE", DOORWAY_1, { kind: "BOOLEAN", value: false });
  const result = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(result.escalation, "PHOTO_SUFFICIENT");
});

// --- 6: a visible corner/plane transition is not itself an escalation ------
// PRODUCT CORRECTION: a visible plane transition is NOT automatically an
// escalation. Only an unresolved transition -- specifically one whose
// continuation leaves this photo's frame -- forces SWEEP_REQUIRED. A
// transition with no connectivity/continuation facts written yet is simply
// unresolved LOCALLY, same as a missing casing, so it's TARGETED_PHOTO_
// REQUIRED, not SWEEP_REQUIRED.

check("[correction] a confirmed corner with NO connectivity facts yet written is TARGETED_PHOTO_REQUIRED, not an automatic SWEEP_REQUIRED", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "CORNER_PRESENCE", CORNER_1, { kind: "BOOLEAN", value: true });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  assert.ok(escalation.missingFactTypes.includes("TRANSITION_VISUALLY_CONNECTED"));
  assert.ok(escalation.missingFactTypes.includes("TRANSITION_CONTINUATION_IN_FRAME"));
});

check("[correction] a corner whose transition is confirmed visually connected AND whose continuation is confirmed in-frame is treated like a straight run (may still reach PHOTO_SUFFICIENT)", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "CORNER_PRESENCE", CORNER_1, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "TRANSITION_VISUALLY_CONNECTED", CORNER_1, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "TRANSITION_CONTINUATION_IN_FRAME", CORNER_1, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "BASEBOARD_CONTINUITY", LEG, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "DOORWAY_PRESENCE", DOORWAY_1, { kind: "BOOLEAN", value: false });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "PHOTO_SUFFICIENT");
});

check("[correction] a corner whose transition is confirmed NOT visually connected (locally obscured) is TARGETED_PHOTO_REQUIRED, not SWEEP_REQUIRED", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "CORNER_PRESENCE", CORNER_1, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "TRANSITION_VISUALLY_CONNECTED", CORNER_1, { kind: "BOOLEAN", value: false });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  assert.deepEqual(escalation.missingFactTypes, ["TRANSITION_VISUALLY_CONNECTED"]);
});

check("[correction] a corner whose continuation is confirmed OFF-frame forces SWEEP_REQUIRED -- the one case that genuinely needs cross-view topology", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "CORNER_PRESENCE", CORNER_1, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "TRANSITION_VISUALLY_CONNECTED", CORNER_1, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "TRANSITION_CONTINUATION_IN_FRAME", CORNER_1, { kind: "BOOLEAN", value: false });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "SWEEP_REQUIRED");
});

check("[correction] confirmed wall-plane transition (WALL_PLANE=false) forces SWEEP_REQUIRED", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "WALL_PLANE", LEG, { kind: "BOOLEAN", value: false });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "SWEEP_REQUIRED");
});

// --- [correction] baseboard no longer forces sweep -------------------------

check("[correction] obscured/false baseboard continuity yields TARGETED_PHOTO_REQUIRED, not SWEEP_REQUIRED", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "WALL_PLANE", LEG, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "BASEBOARD_CONTINUITY", LEG, { kind: "BOOLEAN", value: false }); // e.g. furniture/cropping/occlusion
  store = writeFact(store, "DOORWAY_PRESENCE", DOORWAY_1, { kind: "BOOLEAN", value: false });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  assert.deepEqual(escalation.missingFactTypes, ["BASEBOARD_CONTINUITY"]);
});

check("[correction] missing (never-written) baseboard continuity also yields TARGETED_PHOTO_REQUIRED, same as an explicit false", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "WALL_PLANE", LEG, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "DOORWAY_PRESENCE", DOORWAY_1, { kind: "BOOLEAN", value: false });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  assert.deepEqual(escalation.missingFactTypes, ["BASEBOARD_CONTINUITY"]);
});

check("[correction] a genuinely off-frame transition (TRANSITION_CONTINUATION_IN_FRAME=false) still outranks a merely-missing baseboard -- structural beats local", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "BASEBOARD_CONTINUITY", LEG, { kind: "BOOLEAN", value: false });
  store = writeFact(store, "CORNER_PRESENCE", CORNER_1, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "TRANSITION_CONTINUATION_IN_FRAME", CORNER_1, { kind: "BOOLEAN", value: false });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "SWEEP_REQUIRED");
});

// --- 7: fails closed before both anchors exist ------------------------------

check("evaluating a leg before both anchors exist never claims PHOTO_SUFFICIENT (fails closed to REVIEW_REQUIRED)", () => {
  const store = emptyRouteAssistFactStoreV1();
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "REVIEW_REQUIRED");
});

// --- 8: one missing local fact yields TARGETED_PHOTO_REQUIRED -------------

check("a doorway present with a missing top casing yields TARGETED_PHOTO_REQUIRED naming exactly that fact", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "WALL_PLANE", LEG, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "BASEBOARD_CONTINUITY", LEG, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "DOORWAY_PRESENCE", DOORWAY_1, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "DOORWAY_LEFT_CASING", DOORWAY_1, { kind: "OBJECT_REF", objectId: "left", imageId: IMAGE });
  store = writeFact(store, "DOORWAY_RIGHT_CASING", DOORWAY_1, { kind: "OBJECT_REF", objectId: "right", imageId: IMAGE });
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  assert.deepEqual(escalation.missingFactTypes, ["DOORWAY_TOP_CASING"]);
});

// --- 9: locked fact cannot be overwritten by targeted resolution ----------

check("a targeted fact-resolution response cannot overwrite an already-locked fact", () => {
  let store = anchorsPlaced();
  const firstRequest: RouteAssistFactResolutionRequestV1 = { version: 1, targetFactType: "WALL_PLANE", scopeId: LEG, imageId: IMAGE, imageUrl: "https://example.invalid/photo-1.jpg", lockedFacts: [] };
  const firstResponse = { version: 1 as const, targetFactType: "WALL_PLANE" as const, scopeId: LEG, value: { kind: "BOOLEAN" as const, value: true }, evidenceImageIds: [IMAGE] };
  const first = applyRouteAssistFactResolutionV1(store, firstRequest, firstResponse, "test-provider");
  assert.equal(first.outcome, "WRITTEN");
  store = first.outcome === "WRITTEN" ? first.store : store;
  assert.equal(store.facts[`WALL_PLANE:${LEG}`].state, "LOCKED");

  const secondResponse = { ...firstResponse, value: { kind: "BOOLEAN" as const, value: false } };
  const second = applyRouteAssistFactResolutionV1(store, firstRequest, secondResponse, "test-provider");
  assert.equal(second.outcome, "REFUSED_LOCKED");
  const wallPlaneValue = store.facts[`WALL_PLANE:${LEG}`].value;
  assert.equal(wallPlaneValue.kind === "BOOLEAN" && wallPlaneValue.value, true);
});

check("a fact-resolution response naming a DIFFERENT fact than requested is refused before it ever reaches the store", () => {
  const store = anchorsPlaced();
  const request: RouteAssistFactResolutionRequestV1 = { version: 1, targetFactType: "DOORWAY_TOP_CASING", scopeId: DOORWAY_1, imageId: IMAGE, imageUrl: "https://example.invalid/photo-1.jpg", lockedFacts: [] };
  const wrongResponse = { version: 1 as const, targetFactType: "SOURCE_ANCHOR" as const, scopeId: "A", value: { kind: "ANCHOR" as const, point: { x: 0.9, y: 0.9, imageId: IMAGE }, markerType: "RECEPTACLE" as const }, evidenceImageIds: [IMAGE] };
  const outcome = applyRouteAssistFactResolutionV1(store, request, wrongResponse, "test-provider");
  assert.equal(outcome.outcome, "REFUSED_PROVENANCE");
  assert.deepEqual(outcome.store, store);
});

// --- [Fix 2] instance-scoping: a second doorway does not collide with the first ---

check("[correction] a second doorway instance is a distinct fact identity from the first, and does not require changing how the first was written", () => {
  let store = anchorsPlaced();
  store = writeFact(store, "DOORWAY_PRESENCE", DOORWAY_1, { kind: "BOOLEAN", value: true });
  store = writeFact(store, "DOORWAY_LEFT_CASING", DOORWAY_1, { kind: "OBJECT_REF", objectId: "d1-left", imageId: IMAGE });
  // Writing a SECOND doorway's presence fact at a different instance id must
  // not touch, and must not be blocked by, the first doorway's facts.
  store = writeFact(store, "DOORWAY_PRESENCE", DOORWAY_2, { kind: "BOOLEAN", value: true });
  assert.equal(DOORWAY_1, "doorway:leg-A-B:1");
  assert.equal(DOORWAY_2, "doorway:leg-A-B:2");
  assert.ok(store.facts[`DOORWAY_PRESENCE:${DOORWAY_1}`]);
  assert.ok(store.facts[`DOORWAY_PRESENCE:${DOORWAY_2}`]);
  assert.ok(store.facts[`DOORWAY_LEFT_CASING:${DOORWAY_1}`]);
  assert.equal(store.facts[`DOORWAY_LEFT_CASING:${DOORWAY_1}`].state, "LOCKED");
});

// --- [Fix 3] fact-type/value compatibility -----------------------------------

check("[correction] a BOOLEAN-only fact type refuses an OBJECT_REF value (wrong value kind for the fact name)", () => {
  const store = anchorsPlaced();
  const attempt = writeRouteAssistFactV1(store, {
    type: "DOORWAY_PRESENCE",
    scopeId: DOORWAY_1,
    // wrong kind: DOORWAY_PRESENCE requires BOOLEAN
    value: { kind: "OBJECT_REF", objectId: "not-a-boolean", imageId: IMAGE },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
  });
  assert.equal(attempt.outcome, "REFUSED_VALUE_SHAPE");
  assert.equal(attempt.store.facts[`DOORWAY_PRESENCE:${DOORWAY_1}`], undefined);
});

check("[correction] an OBJECT_REF-only fact type refuses a BOOLEAN value", () => {
  const store = anchorsPlaced();
  const attempt = writeRouteAssistFactV1(store, {
    type: "DOORWAY_LEFT_CASING",
    scopeId: DOORWAY_1,
    value: { kind: "BOOLEAN", value: true },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
  });
  assert.equal(attempt.outcome, "REFUSED_VALUE_SHAPE");
});

check("[correction] DOORWAY_ENTRY_SIDE refuses an enum value outside its closed set, even though the value KIND (ENUM) is correct", () => {
  const store = anchorsPlaced();
  const attempt = writeRouteAssistFactV1(store, {
    type: "DOORWAY_ENTRY_SIDE",
    scopeId: DOORWAY_1,
    value: { kind: "ENUM", value: "SIDEWAYS" },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
  });
  assert.equal(attempt.outcome, "REFUSED_VALUE_SHAPE");
});

check("[correction] DOORWAY_ENTRY_SIDE accepts LEFT/RIGHT/UNRESOLVED, its actual closed set", () => {
  for (const side of ["LEFT", "RIGHT", "UNRESOLVED"]) {
    const store = anchorsPlaced();
    const attempt = writeRouteAssistFactV1(store, {
      type: "DOORWAY_ENTRY_SIDE",
      scopeId: DOORWAY_1,
      value: { kind: "ENUM", value: side },
      evidenceImageIds: [IMAGE],
      provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
    });
    assert.equal(attempt.outcome, "WRITTEN", `expected ${side} to be accepted`);
  }
});

check("[correction] CORNER_KIND refuses an unrecognized enum value and accepts its real closed set (INSIDE/OUTSIDE/FLAT)", () => {
  const bad = writeRouteAssistFactV1(anchorsPlaced(), {
    type: "CORNER_KIND",
    scopeId: CORNER_1,
    value: { kind: "ENUM", value: "DIAGONAL" },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
  });
  assert.equal(bad.outcome, "REFUSED_VALUE_SHAPE");

  for (const kind of ["INSIDE", "OUTSIDE", "FLAT"]) {
    const good = writeRouteAssistFactV1(anchorsPlaced(), {
      type: "CORNER_KIND",
      scopeId: CORNER_1,
      value: { kind: "ENUM", value: kind },
      evidenceImageIds: [IMAGE],
      provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
    });
    assert.equal(good.outcome, "WRITTEN", `expected ${kind} to be accepted`);
  }
});

check("[correction] ANCHOR_OBJECT_MATCH requires its own ANCHOR_MATCH shape, not a bare BOOLEAN", () => {
  const store = anchorsPlaced();
  const wrong = writeRouteAssistFactV1(store, {
    type: "ANCHOR_OBJECT_MATCH",
    scopeId: "A",
    value: { kind: "BOOLEAN", value: true },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
  });
  assert.equal(wrong.outcome, "REFUSED_VALUE_SHAPE");

  const right = writeRouteAssistFactV1(store, {
    type: "ANCHOR_OBJECT_MATCH",
    scopeId: "A",
    value: { kind: "ANCHOR_MATCH", objectId: "obj-1", imageId: IMAGE, matchesPlacement: true },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
  });
  assert.equal(right.outcome, "WRITTEN");
  // And confirms ANCHOR_OBJECT_MATCH never touches SOURCE_ANCHOR itself.
  assert.deepEqual(right.outcome === "WRITTEN" ? right.store.facts["SOURCE_ANCHOR:A"] : null, store.facts["SOURCE_ANCHOR:A"]);
});

check("[correction] a malformed value is refused even when provenance would otherwise have been fine (value-shape check is independent of the provenance check)", () => {
  const store = anchorsPlaced();
  const attempt = writeRouteAssistFactV1(store, {
    type: "WALL_PLANE",
    scopeId: LEG,
    value: { kind: "ENUM", value: "TRUE" }, // WALL_PLANE requires BOOLEAN, not ENUM
    evidenceImageIds: [IMAGE],
    provenance: { source: "DETERMINISTIC_RULE", rule: "test", at: new Date().toISOString() },
  });
  assert.equal(attempt.outcome, "REFUSED_VALUE_SHAPE");
});

console.log(`\nRoute Assist photo-first verification: ${passed} passed, 0 failed.`);
