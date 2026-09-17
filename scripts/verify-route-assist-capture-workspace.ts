/**
 * Proves the capture-the-work-area-first architecture: captureWorkspace.ts's
 * capture-completeness / route-evaluation boundary, composed on top of the
 * UNCHANGED per-frame evaluator (captureEscalation.ts), the UNCHANGED
 * per-photo adapter (livePhotoFactAdapter.ts), and the UNCHANGED frame-
 * overlap rule (frameContinuation.ts). No database, no network, same style
 * as verify-route-assist-guided-continuation.ts.
 *
 * Run: npx tsx scripts/verify-route-assist-capture-workspace.ts
 */
import assert from "node:assert/strict";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "../lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1 } from "../lib/visual-assist/route-assist/captureEscalation";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "../lib/visual-assist/route-assist/livePhotoFactAdapter";
import type { RouteAssistFrameOverlapObservationV1 } from "../lib/visual-assist/route-assist/frameContinuation";
import {
  addRouteAssistCaptureWorkspaceFrameV1,
  emptyRouteAssistCaptureWorkspaceV1,
  evaluateRouteAssistWorkspaceLegV1,
  frameOrderForImageV1,
  markRouteAssistCaptureWorkspaceCompleteV1,
  routeAssistFrameScopedLegIdV1,
  ROUTE_ASSIST_CAPTURE_WORKSPACE_SCOPE_V1,
  type RouteAssistCaptureWorkspaceV1,
} from "../lib/visual-assist/route-assist/captureWorkspace";
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

function writeAnchor(store: RouteAssistFactStoreV1, type: "SOURCE_ANCHOR" | "DESTINATION_ANCHOR", scopeId: string, point: { x: number; y: number; imageId: string }): RouteAssistFactStoreV1 {
  const result = writeRouteAssistFactV1(store, {
    type,
    scopeId,
    value: { kind: "ANCHOR", point, markerType: "RECEPTACLE" },
    evidenceImageIds: [],
    provenance: { source: "HOMEOWNER_PLACEMENT", at: new Date().toISOString() },
  });
  assert.equal(result.outcome, "WRITTEN");
  return result.outcome === "WRITTEN" ? result.store : store;
}

/** A fully resolved, doorway-free, single-frame leg: source and destination both visible, connected by a plain wall (no corner). Reused everywhere a "this frame's own portion is fully resolved" fixture is needed. */
function resolvedFlatWallSemantics(imageId: string, legScopeId = "leg-A-B"): RouteAssistVisibleSceneSemanticsV1 {
  return {
    version: 1,
    captureImageIds: [imageId],
    objects: [
      { id: "src", kind: "SOURCE_RECEPTACLE", imageId, confidence: 0.97, box: box(0.05), pointId: "A" },
      { id: "bb", kind: "BASEBOARD_OR_TRIM", imageId, confidence: 0.9, box: box(0.4) },
      { id: "dst", kind: "DESTINATION_MARKER", imageId, confidence: 0.96, box: box(0.85), pointId: "B" },
    ],
    segmentObservations: [{ segmentId: legScopeId, imageId, objectIds: ["bb", "dst"], confidence: 0.9, noDoorwayOnSegment: true }],
  };
}

/**
 * A cross-frame leg's ENDPOINT-frame contribution: only the anchor that is
 * REALLY visible in this specific frame is reported (the other endpoint's
 * anchor point genuinely is not in this frame -- it lives on a different
 * frame). This matters structurally, not just cosmetically: the adapter
 * writes ANCHOR_OBJECT_MATCH keyed by the point's own label ("A"/"B"),
 * shared across every frame that leg touches, so a fixture that (wrongly)
 * claims to see BOTH anchors in every frame of a cross-frame leg would
 * collide with itself on the second frame's apply (REFUSED_LOCKED) --
 * exactly the kind of duplicate-claim bug this split fixture exists to
 * avoid. evaluateRouteAssistPhotoEscalationV1 itself never reads
 * ANCHOR_OBJECT_MATCH at all, so omitting the not-really-present anchor
 * object does not weaken this frame's own WALL_PLANE/baseboard/doorway
 * resolution -- it only stops a false anchor-sighting claim.
 */
function resolvedFlatWallEndpointSemantics(imageId: string, legScopeId: string, endpoint: "SOURCE" | "DESTINATION", destinationPointId: string, includeAnchorObject = true): RouteAssistVisibleSceneSemanticsV1 {
  const objects: RouteAssistVisibleSceneSemanticsV1["objects"] = [{ id: "bb", kind: "BASEBOARD_OR_TRIM", imageId, confidence: 0.9, box: box(0.4) }];
  // includeAnchorObject=false: this frame already established ANCHOR_OBJECT_
  // MATCH for this point via an EARLIER leg's contribution from the same
  // frame (that fact is scoped by point label alone, not by leg, so it is
  // interpreted once per frame and reused -- re-claiming it here would hit
  // the ledger's own REFUSED_LOCKED, exactly as it should for a genuine
  // repeat claim). WALL_PLANE/baseboard/doorway resolution for THIS leg's
  // own scope is unaffected either way.
  if (includeAnchorObject) {
    if (endpoint === "SOURCE") objects.push({ id: "src", kind: "SOURCE_RECEPTACLE", imageId, confidence: 0.97, box: box(0.05), pointId: "A" });
    else objects.push({ id: "dst", kind: "DESTINATION_MARKER", imageId, confidence: 0.96, box: box(0.85), pointId: destinationPointId });
  }
  return {
    version: 1,
    captureImageIds: [imageId],
    objects,
    segmentObservations: [{ segmentId: legScopeId, imageId, objectIds: objects.map((o) => o.id), confidence: 0.9, noDoorwayOnSegment: true }],
  };
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
  assert.equal(application.problems.length, 0, JSON.stringify(application.problems));
  return application.store;
}

function connectedOverlap(fromImageId: string, toImageId: string): RouteAssistFrameOverlapObservationV1 {
  return { legScopeId: ROUTE_ASSIST_CAPTURE_WORKSPACE_SCOPE_V1, fromImageId, toImageId, evidenceKind: "CORNER", fromObjectId: `${fromImageId}-evidence`, toObjectId: `${toImageId}-evidence`, confidence: 0.9 };
}

function unresolvedOverlap(fromImageId: string, toImageId: string): RouteAssistFrameOverlapObservationV1 {
  // Confidence below the floor -- an explicit but insufficiently confident claim, not silence.
  return { legScopeId: ROUTE_ASSIST_CAPTURE_WORKSPACE_SCOPE_V1, fromImageId, toImageId, evidenceKind: "CORNER", fromObjectId: `${fromImageId}-evidence`, toObjectId: `${toImageId}-evidence`, confidence: 0.3 };
}

function addFrame(workspace: RouteAssistCaptureWorkspaceV1, imageId: string, overlapFromPrevious?: RouteAssistFrameOverlapObservationV1): RouteAssistCaptureWorkspaceV1 {
  const result = addRouteAssistCaptureWorkspaceFrameV1({ workspace, imageId, overlapFromPrevious });
  assert.equal(result.outcome, "ADDED", JSON.stringify(result));
  return result.workspace;
}

function complete(workspace: RouteAssistCaptureWorkspaceV1): RouteAssistCaptureWorkspaceV1 {
  const result = markRouteAssistCaptureWorkspaceCompleteV1(workspace);
  assert.equal(result.outcome, "MARKED_COMPLETE", JSON.stringify(result));
  return result.workspace;
}

function main() {
  // --- 1: one photo -> finish capture -> place A/B -> PHOTO_SUFFICIENT -----
  check("1. one photo, capture finished, A and B both on that one frame -> PHOTO_SUFFICIENT", () => {
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    workspace = complete(workspace);

    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", { x: 0.08, y: 0.5, imageId: FRAME_1 });
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", { x: 0.86, y: 0.5, imageId: FRAME_1 });
    store = applyLeg({ store, imageId: FRAME_1, legScopeId: "leg-A-B", sourcePointId: "A", destinationPointId: "B", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallSemantics(FRAME_1) });

    const evaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceImageId: FRAME_1, destinationImageId: FRAME_1 });
    assert.equal(evaluation.outcome, "EVALUATED");
    assert.equal(evaluation.outcome === "EVALUATED" && evaluation.result.escalation, "PHOTO_SUFFICIENT");
  });

  // --- 2: two overlapping photos -> finish capture -> A/B across frames ----
  check("2. two overlapping photos, capture finished, A on frame 1 and B on frame 2 -> PHOTO_SUFFICIENT via the cross-frame path", () => {
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    workspace = addFrame(workspace, FRAME_2, connectedOverlap(FRAME_1, FRAME_2));
    workspace = complete(workspace);

    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", { x: 0.08, y: 0.5, imageId: FRAME_1 });
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", { x: 0.86, y: 0.5, imageId: FRAME_2 });
    // Each endpoint frame contributes its own local resolution, under its OWN frame-scoped sub-leg id -- and only claims to see the anchor that is REALLY in that frame (A in frame 1, B in frame 2).
    store = applyLeg({ store, imageId: FRAME_1, legScopeId: routeAssistFrameScopedLegIdV1("leg-A-B", FRAME_1), sourcePointId: "A", destinationPointId: "B", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallEndpointSemantics(FRAME_1, routeAssistFrameScopedLegIdV1("leg-A-B", FRAME_1), "SOURCE", "B") });
    store = applyLeg({ store, imageId: FRAME_2, legScopeId: routeAssistFrameScopedLegIdV1("leg-A-B", FRAME_2), sourcePointId: "A", destinationPointId: "B", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallEndpointSemantics(FRAME_2, routeAssistFrameScopedLegIdV1("leg-A-B", FRAME_2), "DESTINATION", "B") });

    const evaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceImageId: FRAME_1, destinationImageId: FRAME_2 });
    assert.equal(evaluation.outcome, "EVALUATED");
    assert.equal(evaluation.outcome === "EVALUATED" && evaluation.result.escalation, "PHOTO_SUFFICIENT", JSON.stringify(evaluation));
  });

  // --- 3: three overlapping photos, lights spread across frames 2-3 --------
  check("3. three overlapping photos: A on frame 1, one light on frame 2 (A->D spans frames 1-2), another light on frame 3 (A->E spans frames 1-2-3) -- neither leg requires a sweep, and the un-involved middle frame is never separately re-evaluated for the longer leg", () => {
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    workspace = addFrame(workspace, FRAME_2, connectedOverlap(FRAME_1, FRAME_2));
    workspace = addFrame(workspace, FRAME_3, connectedOverlap(FRAME_2, FRAME_3));
    workspace = complete(workspace);

    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", { x: 0.08, y: 0.5, imageId: FRAME_1 });
    store = writeAnchor(store, "DESTINATION_ANCHOR", "D", { x: 0.86, y: 0.5, imageId: FRAME_2 });
    store = writeAnchor(store, "DESTINATION_ANCHOR", "E", { x: 0.86, y: 0.5, imageId: FRAME_3 });

    store = applyLeg({ store, imageId: FRAME_1, legScopeId: routeAssistFrameScopedLegIdV1("leg-A-D", FRAME_1), sourcePointId: "A", destinationPointId: "D", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallEndpointSemantics(FRAME_1, routeAssistFrameScopedLegIdV1("leg-A-D", FRAME_1), "SOURCE", "D") });
    store = applyLeg({ store, imageId: FRAME_2, legScopeId: routeAssistFrameScopedLegIdV1("leg-A-D", FRAME_2), sourcePointId: "A", destinationPointId: "D", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallEndpointSemantics(FRAME_2, routeAssistFrameScopedLegIdV1("leg-A-D", FRAME_2), "DESTINATION", "D") });

    // A's ANCHOR_OBJECT_MATCH was already established on frame 1 by the A->D leg above -- this leg's own frame-1 contribution reuses that same frame without re-claiming to see A a second time.
    store = applyLeg({ store, imageId: FRAME_1, legScopeId: routeAssistFrameScopedLegIdV1("leg-A-E", FRAME_1), sourcePointId: "A", destinationPointId: "E", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallEndpointSemantics(FRAME_1, routeAssistFrameScopedLegIdV1("leg-A-E", FRAME_1), "SOURCE", "E", false) });
    store = applyLeg({ store, imageId: FRAME_3, legScopeId: routeAssistFrameScopedLegIdV1("leg-A-E", FRAME_3), sourcePointId: "A", destinationPointId: "E", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallEndpointSemantics(FRAME_3, routeAssistFrameScopedLegIdV1("leg-A-E", FRAME_3), "DESTINATION", "E") });

    const dEvaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-D", sourceScopeId: "A", destinationScopeId: "D", sourceImageId: FRAME_1, destinationImageId: FRAME_2 });
    const eEvaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-E", sourceScopeId: "A", destinationScopeId: "E", sourceImageId: FRAME_1, destinationImageId: FRAME_3 });
    assert.equal(dEvaluation.outcome === "EVALUATED" && dEvaluation.result.escalation, "PHOTO_SUFFICIENT", JSON.stringify(dEvaluation));
    assert.equal(eEvaluation.outcome === "EVALUATED" && eEvaluation.result.escalation, "PHOTO_SUFFICIENT", JSON.stringify(eEvaluation));
    assert.notEqual((dEvaluation as { result?: { escalation: string } }).result?.escalation, "SWEEP_REQUIRED");
    assert.notEqual((eEvaluation as { result?: { escalation: string } }).result?.escalation, "SWEEP_REQUIRED");
  });

  // --- 4/5: overlap acceptance rule -----------------------------------------
  check("4. insufficient overlap (confidence below the floor) is REFUSED -- the next frame is not accepted, and the workspace is unchanged", () => {
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    const attempt = addRouteAssistCaptureWorkspaceFrameV1({ workspace, imageId: FRAME_2, overlapFromPrevious: unresolvedOverlap(FRAME_1, FRAME_2) });
    assert.equal(attempt.outcome, "REFUSED");
    assert.equal(attempt.workspace.frames.length, 1);
  });

  check("5. valid, confident overlap is ACCEPTED -- the next frame is added with its order and the link recorded", () => {
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    const attempt = addRouteAssistCaptureWorkspaceFrameV1({ workspace, imageId: FRAME_2, overlapFromPrevious: connectedOverlap(FRAME_1, FRAME_2) });
    assert.equal(attempt.outcome, "ADDED");
    assert.equal(attempt.workspace.frames.length, 2);
    assert.equal(frameOrderForImageV1(attempt.workspace, FRAME_2), 2);
    assert.equal(attempt.workspace.overlapLinks.length, 1);
  });

  // --- 6: capture is anchor-independent -------------------------------------
  check("6. the homeowner can choose 'add another view' and successfully add a second frame even before ANY destination markers (or even a fact store) exist -- capture completeness never depends on anchors", () => {
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    workspace = addFrame(workspace, FRAME_2, connectedOverlap(FRAME_1, FRAME_2));
    assert.equal(workspace.frames.length, 2);
    assert.equal(workspace.captureComplete, false);
  });

  // --- 7/8: the capture-completeness / evaluation gate itself --------------
  check("7. no leg evaluation occurs while captureComplete=false, no matter what facts already exist -- CAPTURE_INCOMPLETE, not a real result", () => {
    const workspace = emptyRouteAssistCaptureWorkspaceV1(); // frames: [] captureComplete: false, but even with frames it must still refuse
    let workspaceWithFrame = addFrame(workspace, FRAME_1);
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", { x: 0.08, y: 0.5, imageId: FRAME_1 });
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", { x: 0.86, y: 0.5, imageId: FRAME_1 });
    store = applyLeg({ store, imageId: FRAME_1, legScopeId: "leg-A-B", sourcePointId: "A", destinationPointId: "B", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallSemantics(FRAME_1) });

    const wouldBePhotoSufficient = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
    assert.equal(wouldBePhotoSufficient.escalation, "PHOTO_SUFFICIENT", "sanity: the underlying facts really would resolve PHOTO_SUFFICIENT if evaluated directly");

    const evaluation = evaluateRouteAssistWorkspaceLegV1({ workspace: workspaceWithFrame, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceImageId: FRAME_1, destinationImageId: FRAME_1 });
    assert.equal(evaluation.outcome, "CAPTURE_INCOMPLETE", JSON.stringify(evaluation));
  });

  check("8. flipping captureComplete=true (with the SAME facts, unchanged) now enables the real deterministic evaluation", () => {
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", { x: 0.08, y: 0.5, imageId: FRAME_1 });
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", { x: 0.86, y: 0.5, imageId: FRAME_1 });
    store = applyLeg({ store, imageId: FRAME_1, legScopeId: "leg-A-B", sourcePointId: "A", destinationPointId: "B", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallSemantics(FRAME_1) });

    const beforeComplete = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceImageId: FRAME_1, destinationImageId: FRAME_1 });
    assert.equal(beforeComplete.outcome, "CAPTURE_INCOMPLETE");

    workspace = complete(workspace);
    const afterComplete = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceImageId: FRAME_1, destinationImageId: FRAME_1 });
    assert.equal(afterComplete.outcome, "EVALUATED");
    assert.equal(afterComplete.outcome === "EVALUATED" && afterComplete.result.escalation, "PHOTO_SUFFICIENT");
  });

  // --- 9: existing single-photo behavior is a lossless passthrough ---------
  check("9. the workspace wrapper's same-frame path returns EXACTLY what evaluateRouteAssistPhotoEscalationV1 already returns, unchanged -- existing single-photo Route Assist behavior is untouched by this module", () => {
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    workspace = complete(workspace);
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", { x: 0.08, y: 0.5, imageId: FRAME_1 });
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", { x: 0.86, y: 0.5, imageId: FRAME_1 });
    store = applyLeg({ store, imageId: FRAME_1, legScopeId: "leg-A-B", sourcePointId: "A", destinationPointId: "B", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics: resolvedFlatWallSemantics(FRAME_1) });

    const direct = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B" });
    const viaWorkspace = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceImageId: FRAME_1, destinationImageId: FRAME_1 });
    assert.deepEqual(viaWorkspace, { outcome: "EVALUATED", result: direct });
  });

  // --- 10: doorway/furniture/window cases remain unchanged -----------------
  check("10. a furniture-occluded corner + resolved doorway single-photo case still reaches PHOTO_SUFFICIENT through the workspace gate, exactly as it does calling the evaluator directly", () => {
    const semantics: RouteAssistVisibleSceneSemanticsV1 = {
      version: 1,
      captureImageIds: [FRAME_1],
      objects: [
        { id: "src", kind: "SOURCE_RECEPTACLE", imageId: FRAME_1, confidence: 0.97, box: box(0.05), pointId: "A" },
        { id: "corner", kind: "CORNER", imageId: FRAME_1, confidence: 0.92, box: box(0.45) },
        // near-side baseboard entirely absent (furniture) -- structural-visibility correction shape
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
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    workspace = complete(workspace);
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", { x: 0.08, y: 0.5, imageId: FRAME_1 });
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", { x: 0.86, y: 0.5, imageId: FRAME_1 });
    store = applyLeg({ store, imageId: FRAME_1, legScopeId: "leg-A-B", sourcePointId: "A", destinationPointId: "B", sourceAnchor: { x: 0.08, y: 0.5 }, destinationAnchor: { x: 0.86, y: 0.5 }, semantics });
    const evaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceImageId: FRAME_1, destinationImageId: FRAME_1 });
    assert.equal(evaluation.outcome === "EVALUATED" && evaluation.result.escalation, "PHOTO_SUFFICIENT", JSON.stringify(evaluation));
  });

  // --- 11: true disconnected views remain fail-closed -----------------------
  check("11. repeated attempts to add a genuinely disconnected frame are refused every time -- capture never silently proceeds on a frame that never earns a confident overlap link", () => {
    let workspace = emptyRouteAssistCaptureWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = addRouteAssistCaptureWorkspaceFrameV1({ workspace, imageId: FRAME_2, overlapFromPrevious: undefined });
      assert.equal(result.outcome, "REFUSED");
      assert.equal(result.workspace.frames.length, 1, "the workspace must never grow from a refused attempt, no matter how many times it's retried");
    }
  });

  check("11b. capture cannot be marked complete before any frame at all has been taken", () => {
    const workspace = emptyRouteAssistCaptureWorkspaceV1();
    const result = markRouteAssistCaptureWorkspaceCompleteV1(workspace);
    assert.equal(result.outcome, "REFUSED");
  });

  console.log(`\nRoute Assist capture-workspace architecture verification: ${passed} passed, 0 failed.`);
}

main();
