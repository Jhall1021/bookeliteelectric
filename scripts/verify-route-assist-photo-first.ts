/**
 * Proves the photo-first slice (factModel.ts, captureEscalation.ts,
 * photoMarkerState.ts, factResolutionProvider.ts) with no database, no API
 * key, no network -- same style as verify-route-assist-hardening-pass.ts.
 *
 * This covers state/coordinate/domain behavior only. RouteAssistPhotoCapture.
 * tsx's actual camera/DOM rendering (marker drag, tap placement against a
 * live <video>/<canvas>) has no browser harness in this repo to extend
 * within this slice's scope -- see the implementation report's Verification
 * section for what that leaves unautomated and how it was checked instead.
 *
 * Run: npx tsx scripts/verify-route-assist-photo-first.ts
 */
import assert from "node:assert/strict";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "../lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1 } from "../lib/visual-assist/route-assist/captureEscalation";
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
  // Refused on TWO independent grounds -- provenance (a provider may never
  // write an anchor type at all) and lock (even homeowner provenance
  // couldn't rewrite it once locked). Provenance is checked first.
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
  // C re-letters to B when B is removed; its type identity survives the relabel.
  assert.deepEqual(markers.map((m) => [m.label, m.markerType]), [["A", "RECEPTACLE"], ["B", "WALL_LIGHT"]]);
});

// --- 5: single-photo same-plane route resolves to PHOTO_SUFFICIENT --------

check("a fully-resolved, same-plane, no-doorway leg resolves to PHOTO_SUFFICIENT", () => {
  let store = anchorsPlaced();
  for (const write of [
    { type: "WALL_PLANE" as const, scopeId: "leg-A-B", value: { kind: "BOOLEAN" as const, value: true } },
    { type: "BASEBOARD_CONTINUITY" as const, scopeId: "leg-A-B", value: { kind: "BOOLEAN" as const, value: true } },
    { type: "DOORWAY_PRESENCE" as const, scopeId: "leg-A-B", value: { kind: "BOOLEAN" as const, value: false } },
  ]) {
    const result = writeRouteAssistFactV1(store, { ...write, evidenceImageIds: [IMAGE], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true });
    assert.equal(result.outcome, "WRITTEN");
    store = result.outcome === "WRITTEN" ? result.store : store;
  }
  const result = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(result.escalation, "PHOTO_SUFFICIENT");
});

// --- 6: a visible corner/plane transition forces escalation ----------------

check("CORNER_PRESENCE=true forces SWEEP_REQUIRED even with no other facts written", () => {
  let store = anchorsPlaced();
  const result = writeRouteAssistFactV1(store, {
    type: "CORNER_PRESENCE",
    scopeId: "leg-A-B",
    value: { kind: "BOOLEAN", value: true },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
    lockOnWrite: true,
  });
  assert.equal(result.outcome, "WRITTEN");
  store = result.outcome === "WRITTEN" ? result.store : store;
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "SWEEP_REQUIRED");
});

check("WALL_PLANE=false (not one continuous plane) forces SWEEP_REQUIRED", () => {
  let store = anchorsPlaced();
  const result = writeRouteAssistFactV1(store, {
    type: "WALL_PLANE",
    scopeId: "leg-A-B",
    value: { kind: "BOOLEAN", value: false },
    evidenceImageIds: [IMAGE],
    provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() },
    lockOnWrite: true,
  });
  store = result.outcome === "WRITTEN" ? result.store : store;
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "SWEEP_REQUIRED");
});

// --- 7: off-frame continuation (no anchors at all yet) --------------------

check("evaluating a leg before both anchors exist never claims PHOTO_SUFFICIENT (fails closed to REVIEW_REQUIRED)", () => {
  const store = emptyRouteAssistFactStoreV1();
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "REVIEW_REQUIRED");
});

check("an off-frame/disconnected continuation, modeled as an explicit CORNER_PRESENCE, still resolves to SWEEP_REQUIRED even once anchors and some local facts exist", () => {
  let store = anchorsPlaced();
  for (const write of [
    { type: "BASEBOARD_CONTINUITY" as const, value: { kind: "BOOLEAN" as const, value: true } },
    { type: "CORNER_PRESENCE" as const, value: { kind: "BOOLEAN" as const, value: true } },
  ]) {
    const result = writeRouteAssistFactV1(store, { type: write.type, scopeId: "leg-A-B", value: write.value, evidenceImageIds: [IMAGE], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true });
    store = result.outcome === "WRITTEN" ? result.store : store;
  }
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "SWEEP_REQUIRED");
});

// --- 8: one missing local fact yields TARGETED_PHOTO_REQUIRED -------------

check("a doorway present with a missing top casing yields TARGETED_PHOTO_REQUIRED naming exactly that fact", () => {
  let store = anchorsPlaced();
  for (const write of [
    { type: "WALL_PLANE" as const, scopeId: "leg-A-B", value: { kind: "BOOLEAN" as const, value: true } },
    { type: "BASEBOARD_CONTINUITY" as const, scopeId: "leg-A-B", value: { kind: "BOOLEAN" as const, value: true } },
    { type: "DOORWAY_PRESENCE" as const, scopeId: "leg-A-B", value: { kind: "BOOLEAN" as const, value: true } },
    { type: "DOORWAY_LEFT_CASING" as const, scopeId: "leg-A-B", value: { kind: "OBJECT_REF" as const, objectId: "left", imageId: IMAGE } },
    { type: "DOORWAY_RIGHT_CASING" as const, scopeId: "leg-A-B", value: { kind: "OBJECT_REF" as const, objectId: "right", imageId: IMAGE } },
  ]) {
    const result = writeRouteAssistFactV1(store, { ...write, evidenceImageIds: [IMAGE], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true });
    store = result.outcome === "WRITTEN" ? result.store : store;
  }
  const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
  assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
  assert.deepEqual(escalation.missingFactTypes, ["DOORWAY_TOP_CASING"]);
});

// --- 9: locked fact cannot be overwritten by targeted resolution ----------

check("a targeted fact-resolution response cannot overwrite an already-locked fact", () => {
  let store = anchorsPlaced();
  const firstRequest: RouteAssistFactResolutionRequestV1 = {
    version: 1,
    targetFactType: "WALL_PLANE",
    scopeId: "leg-A-B",
    imageId: IMAGE,
    imageUrl: "https://example.invalid/photo-1.jpg",
    lockedFacts: [],
  };
  const firstResponse = { version: 1 as const, targetFactType: "WALL_PLANE" as const, scopeId: "leg-A-B", value: { kind: "BOOLEAN" as const, value: true }, evidenceImageIds: [IMAGE] };
  const first = applyRouteAssistFactResolutionV1(store, firstRequest, firstResponse, "test-provider");
  assert.equal(first.outcome, "WRITTEN");
  store = first.outcome === "WRITTEN" ? first.store : store;
  assert.equal(store.facts["WALL_PLANE:leg-A-B"].state, "LOCKED");

  // A second targeted resolution asked about the SAME fact, disagreeing with
  // the first (true -> false), must be refused -- not silently accepted as
  // a "correction."
  const secondResponse = { ...firstResponse, value: { kind: "BOOLEAN" as const, value: false } };
  const second = applyRouteAssistFactResolutionV1(store, firstRequest, secondResponse, "test-provider");
  assert.equal(second.outcome, "REFUSED_LOCKED");
  assert.equal(store.facts["WALL_PLANE:leg-A-B"].value.kind === "BOOLEAN" && store.facts["WALL_PLANE:leg-A-B"].value.value, true);
});

check("a fact-resolution response naming a DIFFERENT fact than requested is refused before it ever reaches the store", () => {
  const store = anchorsPlaced();
  const request: RouteAssistFactResolutionRequestV1 = {
    version: 1,
    targetFactType: "DOORWAY_TOP_CASING",
    scopeId: "leg-A-B",
    imageId: IMAGE,
    imageUrl: "https://example.invalid/photo-1.jpg",
    lockedFacts: [],
  };
  const wrongResponse = { version: 1 as const, targetFactType: "SOURCE_ANCHOR" as const, scopeId: "A", value: { kind: "ANCHOR" as const, point: { x: 0.9, y: 0.9, imageId: IMAGE }, markerType: "RECEPTACLE" as const }, evidenceImageIds: [IMAGE] };
  const outcome = applyRouteAssistFactResolutionV1(store, request, wrongResponse, "test-provider");
  assert.equal(outcome.outcome, "REFUSED_PROVENANCE");
  assert.deepEqual(outcome.store, store);
});

console.log(`\nRoute Assist photo-first verification: ${passed} passed, 0 failed.`);
