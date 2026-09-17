/**
 * Proves the guided-continuation multi-frame architecture: frameContinuation.
 * ts's overlap-link rule and chain rule, composed on top of the UNCHANGED
 * per-frame evaluator (captureEscalation.ts) and the UNCHANGED per-photo
 * adapter (livePhotoFactAdapter.ts). No database, no network, same style as
 * verify-route-assist-live-photo-interpretation.ts.
 *
 * Covers the product scenarios named in the guided-continuation task:
 *   A. one wide photo containing the whole route -> PHOTO_SUFFICIENT
 *   B. later destinations leave frame, a second overlapping photo connects
 *      through a visible transition -> GUIDED_CONTINUATION_REQUIRED after
 *      frame 1, PHOTO_SUFFICIENT after frame 2
 *   C. a third overlapping still remains valid without a sweep
 *   D. insufficient overlap -> not silently stitched, stays unresolved
 *   E. a window/ceiling-line/etc, not just a corner, can anchor overlap
 *   F. disconnected views with no reliable shared evidence, after repeated
 *      attempts -> SWEEP_REQUIRED
 *   G. movable furniture/windows don't prevent overlap when the structural
 *      connection remains traceable
 *   H. existing PHOTO_SUFFICIENT single-photo cases are unaffected
 *
 * Run: npx tsx scripts/verify-route-assist-guided-continuation.ts
 */
import assert from "node:assert/strict";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "../lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1, type RouteAssistCaptureEscalationResultV1 } from "../lib/visual-assist/route-assist/captureEscalation";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "../lib/visual-assist/route-assist/livePhotoFactAdapter";
import { routeAssistFeatureInstanceScopeIdV1 } from "../lib/visual-assist/route-assist/routeFeatureScope";
import {
  evaluateRouteAssistFrameOverlapV1,
  evaluateRouteAssistGuidedContinuationChainV1,
  ROUTE_ASSIST_GUIDED_CONTINUATION_MAX_OVERLAP_ATTEMPTS_V1,
  type RouteAssistContinuationFrameV1,
  type RouteAssistFrameOverlapObservationV1,
} from "../lib/visual-assist/route-assist/frameContinuation";
import type { RouteAssistVisibleSceneSemanticsV1 } from "../lib/visual-assist/route-assist/visualSceneSemantics";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const LEG = "leg-A-B";
const CORNER_1 = routeAssistFeatureInstanceScopeIdV1("corner", LEG, 1);
const FRAME_1 = "frame-1";
const FRAME_2 = "frame-2";
const FRAME_3 = "frame-3";

function box(x: number, width = 0.06): { x: number; y: number; width: number; height: number } {
  return { x, y: 0.4, width, height: 0.3 };
}

function anchorsPlaced(): RouteAssistFactStoreV1 {
  let store = emptyRouteAssistFactStoreV1();
  const at = new Date().toISOString();
  for (const write of [
    { type: "SOURCE_ANCHOR" as const, scopeId: "A", value: { kind: "ANCHOR" as const, point: { x: 0.08, y: 0.55, imageId: FRAME_1 }, markerType: "RECEPTACLE" as const } },
    { type: "DESTINATION_ANCHOR" as const, scopeId: "B", value: { kind: "ANCHOR" as const, point: { x: 0.86, y: 0.5, imageId: FRAME_1 }, markerType: "CEILING_LIGHT" as const } },
  ]) {
    const result = writeRouteAssistFactV1(store, { ...write, evidenceImageIds: [], provenance: { source: "HOMEOWNER_PLACEMENT", at } });
    assert.equal(result.outcome, "WRITTEN");
    store = result.outcome === "WRITTEN" ? result.store : store;
  }
  return store;
}

/** One wide photo showing source, a resolved corner transition, and the destination -- the "everything fits" scenario. */
function wholeRouteInOneFrameSemantics(): RouteAssistVisibleSceneSemanticsV1 {
  return {
    version: 1,
    captureImageIds: [FRAME_1],
    objects: [
      { id: "src", kind: "SOURCE_RECEPTACLE", imageId: FRAME_1, confidence: 0.97, box: box(0.05), pointId: "A" },
      { id: "corner", kind: "CORNER", imageId: FRAME_1, confidence: 0.92, box: box(0.4) },
      { id: "bb-near", kind: "BASEBOARD_OR_TRIM", imageId: FRAME_1, confidence: 0.9, box: box(0.2) },
      { id: "bb-far", kind: "BASEBOARD_OR_TRIM", imageId: FRAME_1, confidence: 0.9, box: box(0.6) },
      { id: "dst", kind: "DESTINATION_MARKER", imageId: FRAME_1, confidence: 0.96, box: box(0.85), pointId: "B" },
    ],
    segmentObservations: [{ segmentId: LEG, imageId: FRAME_1, objectIds: ["corner", "bb-far", "dst"], confidence: 0.9, noDoorwayOnSegment: true }],
  };
}

/** Frame 1 of a two-frame sequence: source + a corner transition, EXPLICITLY confirmed to continue beyond this frame -- the destination is not here. */
function firstFrameOfSequenceSemantics(evidenceObjectId = "corner"): RouteAssistVisibleSceneSemanticsV1 {
  return {
    version: 1,
    captureImageIds: [FRAME_1],
    objects: [
      { id: "src", kind: "SOURCE_RECEPTACLE", imageId: FRAME_1, confidence: 0.97, box: box(0.05), pointId: "A" },
      { id: evidenceObjectId, kind: evidenceObjectId === "window" ? "WINDOW" : "CORNER", imageId: FRAME_1, confidence: 0.92, box: box(0.5) },
      { id: "bb-near", kind: "BASEBOARD_OR_TRIM", imageId: FRAME_1, confidence: 0.9, box: box(0.2) },
    ],
    segmentObservations: [
      { segmentId: LEG, imageId: FRAME_1, objectIds: [evidenceObjectId], confidence: 0.9 },
      { segmentId: LEG, imageId: FRAME_1, objectIds: [], confidence: 0.9, routeContinuesBeyondFrame: true },
    ],
  };
}

/** A frame that re-acquires the same physical feature (now near the LEFT edge of this new frame) and finally reaches the destination. `imageId` is parameterized so the SAME shape can stand in for frame 2 or frame 3 of a sequence. */
function frameReachingDestinationSemantics(imageId: string, evidenceObjectId = "corner-again"): RouteAssistVisibleSceneSemanticsV1 {
  return {
    version: 1,
    captureImageIds: [imageId],
    objects: [
      { id: evidenceObjectId, kind: evidenceObjectId.includes("window") ? "WINDOW" : "CORNER", imageId, confidence: 0.9, box: box(0.05) },
      { id: "bb-far", kind: "BASEBOARD_OR_TRIM", imageId, confidence: 0.9, box: box(0.5) },
      { id: "dst", kind: "DESTINATION_MARKER", imageId, confidence: 0.96, box: box(0.85), pointId: "B" },
    ],
    segmentObservations: [{ segmentId: LEG, imageId, objectIds: [evidenceObjectId, "bb-far", "dst"], confidence: 0.9, noDoorwayOnSegment: true }],
  };
}

/** Frame 2 that does NOT yet reach the destination either -- a third frame will be required (scenario C). */
function secondFrameStillMidRouteSemantics(): RouteAssistVisibleSceneSemanticsV1 {
  return {
    version: 1,
    captureImageIds: [FRAME_2],
    objects: [
      { id: "corner-again", kind: "CORNER", imageId: FRAME_2, confidence: 0.9, box: box(0.05) },
      { id: "corner-2", kind: "CORNER", imageId: FRAME_2, confidence: 0.9, box: box(0.85) },
      { id: "bb-mid", kind: "BASEBOARD_OR_TRIM", imageId: FRAME_2, confidence: 0.9, box: box(0.4) },
    ],
    segmentObservations: [
      { segmentId: LEG, imageId: FRAME_2, objectIds: ["corner-again", "bb-mid", "corner-2"], confidence: 0.9 },
      { segmentId: LEG, imageId: FRAME_2, objectIds: [], confidence: 0.9, routeContinuesBeyondFrame: true },
    ],
  };
}

/** Applies one frame's semantics against a fresh store scoped to this leg/corner and returns its local escalation result (mirrors what the live adapter + evaluator already do for a single photo, unchanged by this module). */
function localEscalationForFrame(semantics: RouteAssistVisibleSceneSemanticsV1, imageId: string): RouteAssistCaptureEscalationResultV1 {
  const store = anchorsPlaced();
  const application = applyRouteAssistLiveVisibleSceneFactsV1({
    store,
    semantics,
    legScopeId: LEG,
    sourcePointId: "A",
    destinationPointId: "B",
    imageId,
    sourceAnchor: { x: 0.08, y: 0.55 },
    destinationAnchor: { x: 0.86, y: 0.5 },
    providerKey: "fixture.test",
  });
  assert.equal(application.problems.length, 0, JSON.stringify(application.problems));
  return evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: LEG, sourceScopeId: "A", destinationScopeId: "B" });
}

function frames(...orderedImageIds: string[]): RouteAssistContinuationFrameV1[] {
  return orderedImageIds.map((imageId, index) => ({ imageId, order: index + 1 }));
}

function connectedLink(fromImageId: string, toImageId: string, evidenceKind: RouteAssistFrameOverlapObservationV1["evidenceKind"] = "CORNER", confidence = 0.9): RouteAssistFrameOverlapObservationV1 {
  return { legScopeId: LEG, fromImageId, toImageId, evidenceKind, fromObjectId: `${fromImageId}-evidence`, toObjectId: `${toImageId}-evidence`, confidence };
}

function main() {
  // --- A: one wide photo containing the whole route -------------------------
  check("A. a single wide photo with source, a resolved corner, and the destination all visible reaches PHOTO_SUFFICIENT -- one photo remains sufficient, no continuation invoked", () => {
    const last = localEscalationForFrame(wholeRouteInOneFrameSemantics(), FRAME_1);
    assert.equal(last.escalation, "PHOTO_SUFFICIENT", JSON.stringify(last));
    const chain = evaluateRouteAssistGuidedContinuationChainV1({ legScopeId: LEG, frames: frames(FRAME_1), overlapObservations: [], lastFrameEscalation: last });
    assert.equal(chain.outcome, "PHOTO_SUFFICIENT");
    assert.equal((chain as { frameCount: number }).frameCount, 1);
  });

  // --- B: destination leaves frame; a second overlapping photo connects -----
  check("B1. frame 1 alone (destination off-frame, explicit continuation signal at the corner) reports GUIDED_CONTINUATION_REQUIRED, naming frame 1 as the frame to keep visible", () => {
    const frame1Local = localEscalationForFrame(firstFrameOfSequenceSemantics(), FRAME_1);
    assert.equal(frame1Local.escalation, "GUIDED_CONTINUATION_REQUIRED", JSON.stringify(frame1Local));
    const chain = evaluateRouteAssistGuidedContinuationChainV1({ legScopeId: LEG, frames: frames(FRAME_1), overlapObservations: [], lastFrameEscalation: frame1Local });
    assert.deepEqual(chain, { outcome: "GUIDED_CONTINUATION_REQUIRED", reason: frame1Local.reason, continueFromImageId: FRAME_1, boundary: "DESTINATION_NOT_YET_REACHED" });
  });

  check("B2. once frame 2 is captured with a confident, structurally-tied overlap observation back to frame 1, AND frame 2's own local evidence reaches the destination, the chain reports PHOTO_SUFFICIENT with frameCount 2", () => {
    const frame2Local = localEscalationForFrame(frameReachingDestinationSemantics(FRAME_2), FRAME_2);
    assert.equal(frame2Local.escalation, "PHOTO_SUFFICIENT", JSON.stringify(frame2Local));
    const chain = evaluateRouteAssistGuidedContinuationChainV1({
      legScopeId: LEG,
      frames: frames(FRAME_1, FRAME_2),
      overlapObservations: [connectedLink(FRAME_1, FRAME_2)],
      lastFrameEscalation: frame2Local,
    });
    assert.deepEqual(chain, { outcome: "PHOTO_SUFFICIENT", reason: chain.outcome === "PHOTO_SUFFICIENT" ? chain.reason : "", frameCount: 2 });
  });

  // --- C: a third overlapping still remains valid without a sweep -----------
  check("C. a route requiring THREE overlapping stills remains guided continuation throughout -- never escalates to a sweep merely because more than one continuation frame was needed", () => {
    const frame2Local = localEscalationForFrame(secondFrameStillMidRouteSemantics(), FRAME_2);
    assert.equal(frame2Local.escalation, "GUIDED_CONTINUATION_REQUIRED", JSON.stringify(frame2Local));
    const chainAfterFrame2 = evaluateRouteAssistGuidedContinuationChainV1({
      legScopeId: LEG,
      frames: frames(FRAME_1, FRAME_2),
      overlapObservations: [connectedLink(FRAME_1, FRAME_2)],
      lastFrameEscalation: frame2Local,
    });
    assert.deepEqual(chainAfterFrame2, { outcome: "GUIDED_CONTINUATION_REQUIRED", reason: frame2Local.reason, continueFromImageId: FRAME_2, boundary: "DESTINATION_NOT_YET_REACHED" });

    const frame3Local = localEscalationForFrame(frameReachingDestinationSemantics(FRAME_3, "corner-3"), FRAME_3);
    assert.equal(frame3Local.escalation, "PHOTO_SUFFICIENT", JSON.stringify(frame3Local));
    const chainAfterFrame3 = evaluateRouteAssistGuidedContinuationChainV1({
      legScopeId: LEG,
      frames: frames(FRAME_1, FRAME_2, FRAME_3),
      overlapObservations: [connectedLink(FRAME_1, FRAME_2), connectedLink(FRAME_2, FRAME_3)],
      lastFrameEscalation: frame3Local,
    });
    assert.equal(chainAfterFrame3.outcome, "PHOTO_SUFFICIENT");
    assert.equal((chainAfterFrame3 as { frameCount: number }).frameCount, 3);
  });

  // --- D: insufficient overlap is never silently stitched --------------------
  check("D. frame 2 with NO confident overlap observation back to frame 1 stays GUIDED_CONTINUATION_REQUIRED at boundary UNRESOLVED_OVERLAP -- never silently stitched onto frame 1, regardless of what frame 2's own local facts say", () => {
    const frame2Local = localEscalationForFrame(frameReachingDestinationSemantics(FRAME_2), FRAME_2);
    assert.equal(frame2Local.escalation, "PHOTO_SUFFICIENT", "frame 2 looks locally complete on its own -- the point of this test is that this must NOT be enough without a proven overlap link");
    const chain = evaluateRouteAssistGuidedContinuationChainV1({ legScopeId: LEG, frames: frames(FRAME_1, FRAME_2), overlapObservations: [], lastFrameEscalation: frame2Local });
    assert.equal(chain.outcome, "GUIDED_CONTINUATION_REQUIRED");
    assert.equal((chain as { boundary: string }).boundary, "UNRESOLVED_OVERLAP");
    assert.equal((chain as { continueFromImageId: string }).continueFromImageId, FRAME_1, "must ask to recapture the SAME boundary, not silently accept frame 2 as if it were connected");
  });

  check("D2. a one-sided overlap claim (evidence identified in frame 1 but no matching object named in frame 2) is UNRESOLVED at the link level -- confidence alone is not enough without both identities", () => {
    const link = evaluateRouteAssistFrameOverlapV1({
      legScopeId: LEG,
      fromImageId: FRAME_1,
      toImageId: FRAME_2,
      observations: [{ legScopeId: LEG, fromImageId: FRAME_1, toImageId: FRAME_2, evidenceKind: "CORNER", fromObjectId: "corner", toObjectId: "", confidence: 0.95 }],
    });
    assert.equal(link.outcome, "UNRESOLVED");
  });

  // --- E: a window/ceiling-line, not just a corner, can anchor overlap -------
  // The STRUCTURAL trigger for "this route leaves the frame" is still the
  // corner/transition mechanism (the only one the fact model has), but the
  // frame-to-frame OVERLAP LINK that re-acquires the route in the next photo
  // does not have to be anchored on that same corner -- a stable window edge
  // (or ceiling/wall line, doorway casing, ...) the provider can confidently
  // identify in both frames is equally valid evidence per ROUTE_ASSIST_
  // FRAME_OVERLAP_EVIDENCE_KINDS_V1, and frameContinuation.ts treats every
  // evidence kind in that closed set identically.
  check("E. the route leaves frame 1 at a corner, but the overlap CONNECTING frame 2 back to it is anchored on a nearby WINDOW_EDGE instead of the corner itself -- guided continuation, not sweep, regardless of which stable evidence kind ties the frames together", () => {
    const frame1Local = localEscalationForFrame(firstFrameOfSequenceSemantics(), FRAME_1);
    assert.equal(frame1Local.escalation, "GUIDED_CONTINUATION_REQUIRED", JSON.stringify(frame1Local));
    const frame2Local = localEscalationForFrame(frameReachingDestinationSemantics(FRAME_2), FRAME_2);
    assert.equal(frame2Local.escalation, "PHOTO_SUFFICIENT", JSON.stringify(frame2Local));
    const chain = evaluateRouteAssistGuidedContinuationChainV1({
      legScopeId: LEG,
      frames: frames(FRAME_1, FRAME_2),
      overlapObservations: [connectedLink(FRAME_1, FRAME_2, "WINDOW_EDGE")],
      lastFrameEscalation: frame2Local,
    });
    assert.equal(chain.outcome, "PHOTO_SUFFICIENT");
  });

  // --- F: disconnected views with no reliable shared evidence, repeated -----
  check("F. after the maximum number of failed overlap attempts at the same boundary, the chain escalates to a genuine SWEEP_REQUIRED rather than asking for another guided photo indefinitely", () => {
    const frame2Local = localEscalationForFrame(frameReachingDestinationSemantics(FRAME_2), FRAME_2);
    const chain = evaluateRouteAssistGuidedContinuationChainV1({
      legScopeId: LEG,
      frames: frames(FRAME_1, FRAME_2),
      overlapObservations: [],
      lastFrameEscalation: frame2Local,
      failedOverlapAttemptsAtLastBoundary: ROUTE_ASSIST_GUIDED_CONTINUATION_MAX_OVERLAP_ATTEMPTS_V1,
    });
    assert.equal(chain.outcome, "SWEEP_REQUIRED", JSON.stringify(chain));
  });

  check("F2. below the attempt threshold, the SAME unresolved overlap still yields GUIDED_CONTINUATION_REQUIRED, not an immediate sweep -- one failed attempt does not exhaust guided capture", () => {
    const frame2Local = localEscalationForFrame(frameReachingDestinationSemantics(FRAME_2), FRAME_2);
    const chain = evaluateRouteAssistGuidedContinuationChainV1({
      legScopeId: LEG,
      frames: frames(FRAME_1, FRAME_2),
      overlapObservations: [],
      lastFrameEscalation: frame2Local,
      failedOverlapAttemptsAtLastBoundary: ROUTE_ASSIST_GUIDED_CONTINUATION_MAX_OVERLAP_ATTEMPTS_V1 - 1,
    });
    assert.equal(chain.outcome, "GUIDED_CONTINUATION_REQUIRED");
  });

  // --- G: furniture/windows don't prevent overlap when traceable -------------
  check("G. a coherent segment observation still ties the corner in on frame 2 even with the near-side baseboard entirely unreported (furniture occlusion) -- reaches PHOTO_SUFFICIENT, and the confirmed overlap link is unaffected by that same occlusion", () => {
    const furnitureOccludedFrame2: RouteAssistVisibleSceneSemanticsV1 = {
      version: 1,
      captureImageIds: [FRAME_2],
      objects: [
        { id: "corner-again", kind: "CORNER", imageId: FRAME_2, confidence: 0.9, box: box(0.05) },
        // no near-side baseboard object at all -- furniture hides it completely
        { id: "bb-far", kind: "BASEBOARD_OR_TRIM", imageId: FRAME_2, confidence: 0.9, box: box(0.5) },
        { id: "dst", kind: "DESTINATION_MARKER", imageId: FRAME_2, confidence: 0.96, box: box(0.85), pointId: "B" },
      ],
      segmentObservations: [{ segmentId: LEG, imageId: FRAME_2, objectIds: ["corner-again", "bb-far", "dst"], confidence: 0.9, noDoorwayOnSegment: true }],
    };
    const frame2Local = localEscalationForFrame(furnitureOccludedFrame2, FRAME_2);
    assert.equal(frame2Local.escalation, "PHOTO_SUFFICIENT", JSON.stringify(frame2Local));
    const chain = evaluateRouteAssistGuidedContinuationChainV1({
      legScopeId: LEG,
      frames: frames(FRAME_1, FRAME_2),
      overlapObservations: [connectedLink(FRAME_1, FRAME_2)],
      lastFrameEscalation: frame2Local,
    });
    assert.equal(chain.outcome, "PHOTO_SUFFICIENT");
  });

  // --- H: existing single-photo PHOTO_SUFFICIENT cases are unaffected -------
  check("H. an existing furniture-occluded, doorway-free, single-photo PHOTO_SUFFICIENT case is completely unaffected by this module -- wrapping it in a one-frame chain with no overlap observations still yields PHOTO_SUFFICIENT", () => {
    const singlePhoto: RouteAssistVisibleSceneSemanticsV1 = {
      version: 1,
      captureImageIds: [FRAME_1],
      objects: [
        { id: "src", kind: "SOURCE_RECEPTACLE", imageId: FRAME_1, confidence: 0.97, box: box(0.05), pointId: "A" },
        { id: "corner", kind: "CORNER", imageId: FRAME_1, confidence: 0.92, box: box(0.45) },
        { id: "bb-far", kind: "BASEBOARD_OR_TRIM", imageId: FRAME_1, confidence: 0.9, box: box(0.65) },
        { id: "dst", kind: "DESTINATION_MARKER", imageId: FRAME_1, confidence: 0.96, box: box(0.85), pointId: "B" },
      ],
      // near-side baseboard entirely absent (furniture) -- same shape as the
      // existing structural-visibility correction fixtures.
      segmentObservations: [{ segmentId: LEG, imageId: FRAME_1, objectIds: ["corner", "bb-far", "dst"], confidence: 0.9, noDoorwayOnSegment: true }],
    };
    const last = localEscalationForFrame(singlePhoto, FRAME_1);
    assert.equal(last.escalation, "PHOTO_SUFFICIENT", JSON.stringify(last));
    const chain = evaluateRouteAssistGuidedContinuationChainV1({ legScopeId: LEG, frames: frames(FRAME_1), overlapObservations: [], lastFrameEscalation: last });
    assert.equal(chain.outcome, "PHOTO_SUFFICIENT");
  });

  check("H2. a leg-local outcome the chain function does not reinterpret (TARGETED_PHOTO_REQUIRED) passes through unchanged as LEG_LOCAL", () => {
    const targeted: RouteAssistCaptureEscalationResultV1 = { escalation: "TARGETED_PHOTO_REQUIRED", reason: "missing casing", missingFactTypes: ["DOORWAY_LEFT_CASING"] };
    const chain = evaluateRouteAssistGuidedContinuationChainV1({ legScopeId: LEG, frames: frames(FRAME_1), overlapObservations: [], lastFrameEscalation: targeted });
    assert.deepEqual(chain, { outcome: "LEG_LOCAL", escalation: targeted });
  });

  console.log(`\nRoute Assist guided-continuation architecture verification: ${passed} passed, 0 failed.`);
}

main();
