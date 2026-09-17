/**
 * Proves the stitched-workspace architecture: stitchedWorkspace.ts's
 * registration model, canonical (workspace-coordinate) device markers,
 * source->switch->downstream-light route intent, and the support-path-
 * gated BASEBOARD_CONTINUITY correction in captureEscalation.ts. Composes
 * on top of the UNCHANGED per-frame evaluator/adapter and the UNCHANGED
 * frame-overlap rule (frameContinuation.ts). No database, no network, same
 * style as the other verify-route-assist-*.ts scripts.
 *
 * Run: npx tsx scripts/verify-route-assist-stitched-workspace.ts
 */
import assert from "node:assert/strict";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "../lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1 } from "../lib/visual-assist/route-assist/captureEscalation";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "../lib/visual-assist/route-assist/livePhotoFactAdapter";
import { evaluateRouteAssistContinuationGuidanceV1 } from "../lib/visual-assist/route-assist/frameContinuation";
import {
  addRouteAssistStitchedWorkspaceFrameV1,
  deriveRouteAssistSupportPathKindV1,
  deriveRouteAssistWorkspaceLegFrameContributionsV1,
  deriveRouteAssistWorkspaceLegIntentsV1,
  emptyRouteAssistStitchedWorkspaceV1,
  evaluateRouteAssistWorkspaceLegV1,
  framesContainingWorkspacePointV1,
  markRouteAssistStitchedWorkspaceCompleteV1,
  placeRouteAssistWorkspaceMarkerV1,
  primarySupportingFrameForWorkspacePointV1,
  setRouteAssistWorkspaceMarkerControllingSwitchV1,
  workspaceOverallBoundsV1,
  type RouteAssistStitchedWorkspaceV1,
  type RouteAssistWorkspaceMarkerV1,
  type RouteAssistWorkspaceOverlapCandidateV1,
} from "../lib/visual-assist/route-assist/stitchedWorkspace";
import type { RouteAssistVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/visualSceneSemantics";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const FRAME_1 = "frame-1";
const FRAME_2 = "frame-2";
const FRAME_3 = "frame-3";

function box(x: number, width = 0.06): { x: number; y: number; width: number; height: number } {
  return { x, y: 0.4, width, height: 0.3 };
}

function connectedCandidate(overlapFraction: number, confidence = 0.9): RouteAssistWorkspaceOverlapCandidateV1 {
  return { evidenceKind: "CORNER", fromObjectId: "prior-evidence", toObjectId: "new-evidence", confidence, overlapFraction };
}

function addFrame(workspace: RouteAssistStitchedWorkspaceV1, imageId: string, candidate?: RouteAssistWorkspaceOverlapCandidateV1): RouteAssistStitchedWorkspaceV1 {
  const result = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId, overlapFromPrevious: candidate });
  assert.equal(result.outcome, "ADDED", JSON.stringify(result));
  return result.workspace;
}

function complete(workspace: RouteAssistStitchedWorkspaceV1): RouteAssistStitchedWorkspaceV1 {
  const result = markRouteAssistStitchedWorkspaceCompleteV1(workspace);
  assert.equal(result.outcome, "MARKED_COMPLETE", JSON.stringify(result));
  return result.workspace;
}

function writeAnchor(store: RouteAssistFactStoreV1, type: "SOURCE_ANCHOR" | "DESTINATION_ANCHOR", scopeId: string, imageId: string): RouteAssistFactStoreV1 {
  const result = writeRouteAssistFactV1(store, {
    type,
    scopeId,
    value: { kind: "ANCHOR", point: { x: 0.5, y: 0.5, imageId }, markerType: "RECEPTACLE" },
    evidenceImageIds: [],
    provenance: { source: "HOMEOWNER_PLACEMENT", at: new Date().toISOString() },
  });
  assert.equal(result.outcome, "WRITTEN");
  return result.outcome === "WRITTEN" ? result.store : store;
}

function applyLeg(args: { store: RouteAssistFactStoreV1; imageId: string; legScopeId: string; sourcePointId: string; destinationPointId: string; sourceAnchor: { x: number; y: number }; destinationAnchor: { x: number; y: number }; semantics: RouteAssistVisibleSceneSemanticsV1 }): RouteAssistFactStoreV1 {
  const application = applyRouteAssistLiveVisibleSceneFactsV1({
    store: args.store,
    semantics: args.semantics,
    legScopeId: args.legScopeId,
    sourcePointId: args.sourcePointId,
    destinationPointId: args.destinationPointId,
    imageId: args.imageId,
    sourceAnchor: args.sourceAnchor,
    destinationAnchor: args.destinationAnchor,
    providerKey: "fixture.test",
  });
  const realProblems = application.problems.filter((p) => !p.startsWith("ANCHOR_OBJECT_MATCH:"));
  assert.equal(realProblems.length, 0, JSON.stringify(realProblems));
  return application.store;
}

/** Endpoint-only fixture: only claims to see the anchor REALLY in this frame (see the doc comment on the old capture-workspace tests this pattern originates from -- still applies identically here). */
function endpointSemantics(imageId: string, legScopeId: string, endpoint: "SOURCE" | "DESTINATION", sourcePointId: string, destinationPointId: string, opts: { noDoorway?: boolean; corner?: boolean } = {}): RouteAssistVisibleSceneSemanticsV1 {
  const objects: RouteAssistVisibleSceneSemanticsV1["objects"] = [{ id: "bb", kind: "BASEBOARD_OR_TRIM", imageId, confidence: 0.9, box: box(0.4) }];
  if (opts.corner) objects.push({ id: "corner", kind: "CORNER", imageId, confidence: 0.9, box: box(0.5) });
  if (endpoint === "SOURCE") objects.push({ id: "src", kind: "SOURCE_RECEPTACLE", imageId, confidence: 0.97, box: box(0.05), pointId: sourcePointId });
  else objects.push({ id: "dst", kind: "DESTINATION_MARKER", imageId, confidence: 0.96, box: box(0.8), pointId: destinationPointId });
  return {
    version: 1,
    captureImageIds: [imageId],
    objects,
    segmentObservations: [{ segmentId: legScopeId, imageId, objectIds: objects.map((o) => o.id), confidence: 0.9, noDoorwayOnSegment: opts.noDoorway ?? true }],
  };
}

function main() {
  // --- 1: one photo becomes one workspace -----------------------------------
  check("1. one photo becomes one workspace: a single frame, marked complete, with A and B placed on it, reaches PHOTO_SUFFICIENT", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    assert.equal(workspace.frames.length, 1);
    assert.deepEqual(workspaceOverallBoundsV1(workspace), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    workspace = complete(workspace);

    const markers: RouteAssistWorkspaceMarkerV1[] = placeRouteAssistWorkspaceMarkerV1(placeRouteAssistWorkspaceMarkerV1([], { wx: 0.1, wy: 0.5 }, "RECEPTACLE"), { wx: 0.85, wy: 0.5 }, "RECEPTACLE");
    const [source, destination] = markers;

    // Both anchors are really visible in this one frame -- same-frame legs
    // use exactly one real photo, just like the single-photo tier.
    const semantics: RouteAssistVisibleSceneSemanticsV1 = { ...endpointSemantics(FRAME_1, "leg-A-B", "SOURCE", "A", "B"), objects: [...endpointSemantics(FRAME_1, "leg-A-B", "SOURCE", "A", "B").objects, { id: "dst", kind: "DESTINATION_MARKER", imageId: FRAME_1, confidence: 0.96, box: box(0.8), pointId: "B" }] };
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", FRAME_1);
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", FRAME_1);
    store = applyLeg({ store, imageId: FRAME_1, legScopeId: "leg-A-B", sourcePointId: "A", destinationPointId: "B", sourceAnchor: { x: 0.1, y: 0.5 }, destinationAnchor: { x: 0.85, y: 0.5 }, semantics });

    const evaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceMarker: { ...source, markerType: "RECEPTACLE" }, destinationMarker: { ...destination, markerType: "RECEPTACLE" } });
    assert.equal(evaluation.outcome === "EVALUATED" && evaluation.result.escalation, "PHOTO_SUFFICIENT", JSON.stringify(evaluation));
    assert.equal(evaluation.outcome === "EVALUATED" && evaluation.sourceFrameImageId, FRAME_1);
    assert.equal(evaluation.outcome === "EVALUATED" && evaluation.destinationFrameImageId, FRAME_1);
  });

  // --- 2: two overlapping photos register into one workspace ---------------
  check("2. two overlapping photos register into ONE workspace, and a leg spanning both frames (A on frame 1, B on frame 2) reaches PHOTO_SUFFICIENT", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    workspace = addFrame(workspace, FRAME_2, connectedCandidate(0.5));
    assert.equal(workspace.frames[1].transform.originX, 0.5, "originX = previous originX + previous scale * (1 - overlapFraction)");
    workspace = complete(workspace);

    const A = { wx: 0.1, wy: 0.5, markerType: "RECEPTACLE" as const };
    const B = { wx: 1.3, wy: 0.5, markerType: "RECEPTACLE" as const };
    assert.equal(primarySupportingFrameForWorkspacePointV1(workspace, A)?.imageId, FRAME_1);
    assert.equal(primarySupportingFrameForWorkspacePointV1(workspace, B)?.imageId, FRAME_2);

    const contributions = deriveRouteAssistWorkspaceLegFrameContributionsV1({ workspace, legScopeId: "leg-A-B", sourceMarker: A, destinationMarker: B });
    assert.equal(contributions.length, 2, "a genuinely cross-frame leg produces one contribution per endpoint frame");

    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", FRAME_1);
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", FRAME_2);
    for (const contribution of contributions) {
      const endpoint = contribution.imageId === FRAME_1 ? "SOURCE" : "DESTINATION";
      store = applyLeg({ store, imageId: contribution.imageId, legScopeId: contribution.legScopeId, sourcePointId: "A", destinationPointId: "B", sourceAnchor: contribution.sourceLocal, destinationAnchor: contribution.destinationLocal, semantics: endpointSemantics(contribution.imageId, contribution.legScopeId, endpoint, "A", "B") });
    }

    const evaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceMarker: A, destinationMarker: B });
    assert.equal(evaluation.outcome === "EVALUATED" && evaluation.result.escalation, "PHOTO_SUFFICIENT", JSON.stringify(evaluation));
  });

  // --- 3: three overlapping photos register in order ------------------------
  check("3. three overlapping photos register in strictly increasing order, each frame's originX reflecting its own overlap with the previous", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    workspace = addFrame(workspace, FRAME_2, connectedCandidate(0.6));
    workspace = addFrame(workspace, FRAME_3, connectedCandidate(0.3));
    assert.deepEqual(workspace.frames.map((f) => f.order), [1, 2, 3]);
    assert.equal(workspace.frames[1].transform.originX, 0.4);
    assert.equal(workspace.frames[2].transform.originX, 0.4 + 0.7);
    assert.ok(workspace.frames[2].transform.originX > workspace.frames[1].transform.originX);
  });

  // --- 4/5: the stop rule at both the live-guidance and acceptance layers ---
  check("4. overlap with no meaningful new coverage (overlapFraction too high) does not trigger capture -- KEEP_MOVING, and the frame is refused if attempted anyway", () => {
    const guidance = evaluateRouteAssistContinuationGuidanceV1({ matched: true, confidence: 0.9, overlapFraction: 0.95 });
    assert.equal(guidance.state, "KEEP_MOVING");
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    const attempt = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, overlapFromPrevious: connectedCandidate(0.95) });
    assert.equal(attempt.outcome, "REFUSED");
    assert.equal(attempt.workspace.frames.length, 1);
  });

  check("5. sufficient overlap AND meaningful new coverage triggers READY_TO_CAPTURE, and the frame is accepted", () => {
    const guidance = evaluateRouteAssistContinuationGuidanceV1({ matched: true, confidence: 0.9, overlapFraction: 0.5 });
    assert.equal(guidance.state, "READY_TO_CAPTURE");
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    const attempt = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, overlapFromPrevious: connectedCandidate(0.5) });
    assert.equal(attempt.outcome, "ADDED");
    assert.equal(attempt.workspace.frames.length, 2);
  });

  // --- 6: disconnected frames are refused -----------------------------------
  check("6. a frame with no overlap candidate at all, or a candidate with overlap lost (too little overlap), is refused every time -- never silently stitched", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    for (const candidate of [undefined, connectedCandidate(0.02)] as (RouteAssistWorkspaceOverlapCandidateV1 | undefined)[]) {
      const attempt = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, overlapFromPrevious: candidate });
      assert.equal(attempt.outcome, "REFUSED");
      assert.equal(attempt.workspace.frames.length, 1);
    }
  });

  check("6b. capture cannot be marked complete before any frame has been taken", () => {
    const result = markRouteAssistStitchedWorkspaceCompleteV1(emptyRouteAssistStitchedWorkspaceV1());
    assert.equal(result.outcome, "REFUSED");
  });

  // --- 7: markers exist only in workspace coordinates ------------------------
  check("7. a placed marker carries workspace coordinates (wx/wy) and NO per-frame identity at all", () => {
    const markers = placeRouteAssistWorkspaceMarkerV1([], { wx: 0.42, wy: 0.6 }, "RECEPTACLE");
    const marker = markers[0];
    assert.equal(marker.wx, 0.42);
    assert.equal(marker.wy, 0.6);
    assert.equal("imageId" in marker, false, "a workspace marker must never carry a per-frame imageId");
  });

  // --- 8: one marker remains one device even with multi-frame support ------
  check("8. a workspace position inside the overlapping region of two frames is genuinely supported by BOTH, but resolves to exactly ONE primary supporting frame, and the marker itself is still a single object", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    workspace = addFrame(workspace, FRAME_2, connectedCandidate(0.6)); // frame2 origin = 0.4, so [0.4,1.0] overlaps
    const overlapPoint = { wx: 0.7, wy: 0.5 };
    const containing = framesContainingWorkspacePointV1(workspace, overlapPoint);
    assert.equal(containing.length, 2, "the overlap region must genuinely be inside both frames' bounds");
    const primary = primarySupportingFrameForWorkspacePointV1(workspace, overlapPoint);
    assert.ok(primary);
    const markers = placeRouteAssistWorkspaceMarkerV1([], overlapPoint, "RECEPTACLE");
    assert.equal(markers.length, 1, "one device, one marker, regardless of how many frames support it");
  });

  // --- 9: source -> switch -> lights representation preserved --------------
  check("9. A->B (switch), with C and D controlled by B, evaluates as B->C and B->D -- never A->C/A->D", () => {
    let markers: RouteAssistWorkspaceMarkerV1[] = [];
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.1, wy: 0.5 }, "RECEPTACLE"); // A
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.4, wy: 0.5 }, "SWITCH"); // B
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.7, wy: 0.2 }, "CEILING_LIGHT"); // C
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.8, wy: 0.2 }, "CEILING_LIGHT"); // D
    const cMarker = markers.find((m) => m.label === "C")!;
    const dMarker = markers.find((m) => m.label === "D")!;
    markers = setRouteAssistWorkspaceMarkerControllingSwitchV1(markers, cMarker.id, "B");
    markers = setRouteAssistWorkspaceMarkerControllingSwitchV1(markers, dMarker.id, "B");

    const intents = deriveRouteAssistWorkspaceLegIntentsV1(markers);
    const byDestination = new Map(intents.map((intent) => [intent.destinationLabel, intent]));
    assert.equal(byDestination.get("B")?.sourceLabel, "A");
    assert.equal(byDestination.get("B")?.isDownstreamOfSwitch, false);
    assert.equal(byDestination.get("C")?.sourceLabel, "B", "C must be evaluated as wired FROM the switch, not the ultimate source");
    assert.equal(byDestination.get("C")?.isDownstreamOfSwitch, true);
    assert.equal(byDestination.get("D")?.sourceLabel, "B");
    assert.equal(byDestination.get("D")?.isDownstreamOfSwitch, true);
  });

  // --- 10/11: the baseboard support-path correction -------------------------
  check("10. a switch->ceiling-light leg derives support path CEILING and reaches PHOTO_SUFFICIENT with NO baseboard fact written at all", () => {
    const supportPathKind = deriveRouteAssistSupportPathKindV1({ sourceMarkerType: "SWITCH", destinationMarkerType: "CEILING_LIGHT" });
    assert.equal(supportPathKind, "CEILING");
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "B", FRAME_1);
    store = writeAnchor(store, "DESTINATION_ANCHOR", "C", FRAME_1);
    store = writeRouteAssistFactV1(store, { type: "WALL_PLANE", scopeId: "leg-B-C", value: { kind: "BOOLEAN", value: true }, evidenceImageIds: [], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true }).store;
    store = writeRouteAssistFactV1(store, { type: "DOORWAY_PRESENCE", scopeId: "doorway:leg-B-C:1", value: { kind: "BOOLEAN", value: false }, evidenceImageIds: [], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true }).store;
    // NOTE: BASEBOARD_CONTINUITY is never written here at all.
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-B-C", sourceScopeId: "B", destinationScopeId: "C", supportPathKind });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT", JSON.stringify(escalation));
    assert.ok(!escalation.missingFactTypes.includes("BASEBOARD_CONTINUITY"));
  });

  check("11. a genuine outlet-to-outlet (lower-wall) leg derives LOWER_WALL_OR_BASEBOARD and STILL requires baseboard continuity -- missing it yields TARGETED_PHOTO_REQUIRED", () => {
    const supportPathKind = deriveRouteAssistSupportPathKindV1({ sourceMarkerType: "RECEPTACLE", destinationMarkerType: "RECEPTACLE" });
    assert.equal(supportPathKind, "LOWER_WALL_OR_BASEBOARD");
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", FRAME_1);
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", FRAME_1);
    store = writeRouteAssistFactV1(store, { type: "WALL_PLANE", scopeId: "leg-A-B", value: { kind: "BOOLEAN", value: true }, evidenceImageIds: [], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true }).store;
    store = writeRouteAssistFactV1(store, { type: "DOORWAY_PRESENCE", scopeId: "doorway:leg-A-B:1", value: { kind: "BOOLEAN", value: false }, evidenceImageIds: [], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true }).store;
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", supportPathKind });
    assert.equal(escalation.escalation, "TARGETED_PHOTO_REQUIRED");
    assert.ok(escalation.missingFactTypes.includes("BASEBOARD_CONTINUITY"));
  });

  // --- 12: doorway/corner/furniture/window behavior remains intact ---------
  check("12. an existing furniture-occluded corner + resolved doorway single-photo case still reaches PHOTO_SUFFICIENT, exactly as before this pass, with the default (lower-wall) support path", () => {
    const semantics: RouteAssistVisibleSceneSemanticsV1 = {
      version: 1,
      captureImageIds: [FRAME_1],
      objects: [
        { id: "src", kind: "SOURCE_RECEPTACLE", imageId: FRAME_1, confidence: 0.97, box: box(0.05), pointId: "A" },
        { id: "corner", kind: "CORNER", imageId: FRAME_1, confidence: 0.92, box: box(0.45) },
        { id: "bb-far", kind: "BASEBOARD_OR_TRIM", imageId: FRAME_1, confidence: 0.9, box: box(0.65) },
        { id: "window", kind: "WINDOW", imageId: FRAME_1, confidence: 0.9, box: box(0.78, 0.1) },
        { id: "dst", kind: "DESTINATION_MARKER", imageId: FRAME_1, confidence: 0.96, box: box(0.85), pointId: "B" },
        { id: "door", kind: "DOORWAY", imageId: FRAME_1, confidence: 0.94, box: box(0.72, 0.12) },
        { id: "left", kind: "DOOR_SIDE_CASING", imageId: FRAME_1, confidence: 0.93, box: box(0.71) },
        { id: "top", kind: "DOOR_TOP_CASING", imageId: FRAME_1, confidence: 0.93, box: box(0.72) },
        { id: "right", kind: "DOOR_SIDE_CASING", imageId: FRAME_1, confidence: 0.93, box: box(0.82) },
      ],
      segmentObservations: [{ segmentId: "leg-A-B", imageId: FRAME_1, objectIds: ["corner", "bb-far", "dst"], confidence: 0.9 }],
      doorwayGroups: [{ id: "dg", doorwayObjectId: "door", leftCasingObjectId: "left", topCasingObjectId: "top", rightCasingObjectId: "right", entrySide: "LEFT" }],
    };
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", FRAME_1);
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", FRAME_1);
    store = applyLeg({ store, imageId: FRAME_1, legScopeId: "leg-A-B", sourcePointId: "A", destinationPointId: "B", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics });
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT", JSON.stringify(escalation));
  });

  // --- 13: captureComplete gate remains intact ------------------------------
  check("13. evaluateRouteAssistWorkspaceLegV1 refuses (CAPTURE_INCOMPLETE) while captureComplete=false, no matter what facts already exist", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1); // NOT marked complete
    const A = { wx: 0.1, wy: 0.5, markerType: "RECEPTACLE" as const };
    const B = { wx: 0.85, wy: 0.5, markerType: "RECEPTACLE" as const };
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", FRAME_1);
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", FRAME_1);
    const evaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceMarker: A, destinationMarker: B });
    assert.equal(evaluation.outcome, "CAPTURE_INCOMPLETE");
  });

  // --- 14: no concealed-wire inference --------------------------------------
  check("14a. two lights sharing one switch are each independently B->light -- never chained B->C->D, and neither leg's derivation depends on the OTHER light existing", () => {
    let markers: RouteAssistWorkspaceMarkerV1[] = [];
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.1, wy: 0.5 }, "RECEPTACLE");
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.4, wy: 0.5 }, "SWITCH");
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.7, wy: 0.2 }, "CEILING_LIGHT");
    const cId = markers.find((m) => m.label === "C")!.id;
    markers = setRouteAssistWorkspaceMarkerControllingSwitchV1(markers, cId, "B");
    const intentsWithOnlyC = deriveRouteAssistWorkspaceLegIntentsV1(markers);
    assert.equal(intentsWithOnlyC.find((i) => i.destinationLabel === "C")?.sourceLabel, "B");

    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.8, wy: 0.2 }, "CEILING_LIGHT");
    const dId = markers.find((m) => m.label === "D")!.id;
    markers = setRouteAssistWorkspaceMarkerControllingSwitchV1(markers, dId, "B");
    const intentsWithBoth = deriveRouteAssistWorkspaceLegIntentsV1(markers);
    const cIntent = intentsWithBoth.find((i) => i.destinationLabel === "C");
    assert.equal(cIntent?.sourceLabel, "B", "adding a second light on the same switch must not change C's own leg at all");
    assert.equal(intentsWithBoth.filter((i) => i.sourceLabel === "B").length, 2, "exactly two independent B-> legs, never a single inferred chain");
  });

  check("14b. a controlledBySwitchLabel that does not resolve to a real, distinct SWITCH marker is never honored -- falls back to the ordinary star topology rather than guessing", () => {
    let markers: RouteAssistWorkspaceMarkerV1[] = [];
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.1, wy: 0.5 }, "RECEPTACLE"); // A
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.7, wy: 0.2 }, "CEILING_LIGHT"); // B (no switch exists at all)
    const bId = markers.find((m) => m.label === "B")!.id;
    markers = setRouteAssistWorkspaceMarkerControllingSwitchV1(markers, bId, "NONEXISTENT");
    const intents = deriveRouteAssistWorkspaceLegIntentsV1(markers);
    assert.equal(intents.find((i) => i.destinationLabel === "B")?.sourceLabel, "A", "an unresolved control reference must fall back to the source, never invent a switch");
    assert.equal(intents.find((i) => i.destinationLabel === "B")?.isDownstreamOfSwitch, false);
  });

  console.log(`\nRoute Assist stitched-workspace architecture verification: ${passed} passed, 0 failed.`);
}

main();
