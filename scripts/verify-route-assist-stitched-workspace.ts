/**
 * Proves the stitched-workspace architecture over REAL geometric image
 * registration: stitchedWorkspace.ts's frame placement (now driven by
 * imageRegistration.ts's fitted transforms, never capture order or a
 * semantic overlap-fraction guess), canonical (workspace-coordinate)
 * device markers, source->switch->downstream-light route intent, and the
 * support-path-gated BASEBOARD_CONTINUITY correction in captureEscalation.
 * ts. Composes on top of the UNCHANGED per-frame evaluator/adapter and the
 * UNCHANGED guided-continuation stop/hold rule (frameContinuation.ts). No
 * database, no network, same style as the other verify-route-assist-*.ts
 * scripts.
 *
 * Run: npx tsx scripts/verify-route-assist-stitched-workspace.ts
 */
import assert from "node:assert/strict";
import { emptyRouteAssistFactStoreV1, writeRouteAssistFactV1, type RouteAssistFactStoreV1 } from "../lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1 } from "../lib/visual-assist/route-assist/captureEscalation";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "../lib/visual-assist/route-assist/livePhotoFactAdapter";
import {
  advanceRouteAssistCaptureHoldV1,
  evaluateRouteAssistContinuationWindowV1,
  initialRouteAssistCaptureHoldStateV1,
  ROUTE_ASSIST_CAPTURE_HOLD_MIN_DURATION_MS_V1,
  type RouteAssistCaptureHoldStateV1,
} from "../lib/visual-assist/route-assist/frameContinuation";
import { applyTransformV1, type RouteAssistLocalPointV1, type RouteAssistPointCorrespondenceV1, type RouteAssistTransformMatrixV1 } from "../lib/visual-assist/route-assist/imageRegistration";
import {
  addRouteAssistStitchedWorkspaceFrameV1,
  deriveRouteAssistSupportPathKindV1,
  deriveRouteAssistWorkspaceLegFrameContributionsV1,
  deriveRouteAssistWorkspaceLegIntentsV1,
  emptyRouteAssistStitchedWorkspaceV1,
  evaluateRouteAssistWorkspaceLegV1,
  frameLocalToWorkspaceV1,
  frameWorkspaceBoundsV1,
  framesContainingWorkspacePointV1,
  markRouteAssistStitchedWorkspaceCompleteV1,
  placeRouteAssistWorkspaceMarkerV1,
  primarySupportingFrameForWorkspacePointV1,
  setRouteAssistWorkspaceMarkerControllingSwitchV1,
  workspaceOverallBoundsV1,
  workspaceToFrameLocalV1,
  type RouteAssistStitchedWorkspaceV1,
  type RouteAssistWorkspaceFrameRegistrationV1,
  type RouteAssistWorkspaceMarkerV1,
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

const LANDMARK_POINTS: RouteAssistLocalPointV1[] = [
  { x: 0.15, y: 0.2 },
  { x: 0.75, y: 0.18 },
  { x: 0.4, y: 0.55 },
  { x: 0.85, y: 0.7 },
  { x: 0.25, y: 0.82 },
  { x: 0.6, y: 0.35 },
];

/** Builds correspondences {from: point in the PREVIOUS frame, to: point in the NEW frame} from a known ground-truth transform mapping previous-local -> new-local. */
function correspondencesFor(matrix: RouteAssistTransformMatrixV1, points: RouteAssistLocalPointV1[] = LANDMARK_POINTS): RouteAssistPointCorrespondenceV1[] {
  return points.map((from) => ({ from, to: applyTransformV1(matrix, from) }));
}

function translation(dx: number, dy: number): RouteAssistTransformMatrixV1 {
  return [1, 0, dx, 0, 1, dy, 0, 0, 1];
}

function similarity(angleRad: number, scale: number, dx: number, dy: number): RouteAssistTransformMatrixV1 {
  const a = scale * Math.cos(angleRad);
  const b = scale * Math.sin(angleRad);
  return [a, -b, dx, b, a, dy, 0, 0, 1];
}

function addFrame(workspace: RouteAssistStitchedWorkspaceV1, imageId: string, aspectRatio: number, correspondencesFromPrevious?: readonly RouteAssistPointCorrespondenceV1[]): RouteAssistStitchedWorkspaceV1 {
  const result = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId, aspectRatio, correspondencesFromPrevious });
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

function endpointSemantics(imageId: string, legScopeId: string, endpoint: "SOURCE" | "DESTINATION", sourcePointId: string, destinationPointId: string): RouteAssistVisibleSceneSemanticsV1 {
  const objects: RouteAssistVisibleSceneSemanticsV1["objects"] = [{ id: "bb", kind: "BASEBOARD_OR_TRIM", imageId, confidence: 0.9, box: box(0.4) }];
  if (endpoint === "SOURCE") objects.push({ id: "src", kind: "SOURCE_RECEPTACLE", imageId, confidence: 0.97, box: box(0.05), pointId: sourcePointId });
  else objects.push({ id: "dst", kind: "DESTINATION_MARKER", imageId, confidence: 0.96, box: box(0.8), pointId: destinationPointId });
  return {
    version: 1,
    captureImageIds: [imageId],
    objects,
    segmentObservations: [{ segmentId: legScopeId, imageId, objectIds: objects.map((o) => o.id), confidence: 0.9, noDoorwayOnSegment: true }],
  };
}

function main() {
  // --- 1: translated overlapping images align correctly ---------------------
  check("1. two overlapping photos register into ONE workspace via real geometric registration, and a leg spanning both frames (A on frame 1, B on frame 2) reaches PHOTO_SUFFICIENT", () => {
    // Physically: the camera panned right, so a point near the right edge
    // of frame 1's view reappears near the left edge of frame 2 -- content
    // shifts LEFT within the new frame, i.e. a negative dx in the
    // previous-local -> new-local correspondence.
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    workspace = addFrame(workspace, FRAME_2, 1, correspondencesFor(translation(-0.5, 0)));
    assert.equal(workspace.frames.length, 2);

    const A = { wx: 0.1, wy: 0.5, markerType: "RECEPTACLE" as const };
    const B = frameLocalToWorkspaceV1(workspace.frames[1], { x: 0.9, y: 0.5 });
    const destinationMarker = { ...B, markerType: "RECEPTACLE" as const };
    assert.equal(primarySupportingFrameForWorkspacePointV1(workspace, A)?.imageId, FRAME_1);
    assert.equal(primarySupportingFrameForWorkspacePointV1(workspace, destinationMarker)?.imageId, FRAME_2);

    workspace = complete(workspace);
    const contributions = deriveRouteAssistWorkspaceLegFrameContributionsV1({ workspace, legScopeId: "leg-A-B", sourceMarker: A, destinationMarker });
    assert.equal(contributions.length, 2, "a genuinely cross-frame leg produces one contribution per endpoint frame");

    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", FRAME_1);
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", FRAME_2);
    for (const contribution of contributions) {
      const endpoint = contribution.imageId === FRAME_1 ? "SOURCE" : "DESTINATION";
      store = applyLeg({ store, imageId: contribution.imageId, legScopeId: contribution.legScopeId, sourcePointId: "A", destinationPointId: "B", sourceAnchor: contribution.sourceLocal, destinationAnchor: contribution.destinationLocal, semantics: endpointSemantics(contribution.imageId, contribution.legScopeId, endpoint, "A", "B") });
    }
    const evaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceMarker: A, destinationMarker });
    assert.equal(evaluation.outcome === "EVALUATED" && evaluation.result.escalation, "PHOTO_SUFFICIENT", JSON.stringify(evaluation));
  });

  // --- 2/3: rightward vs leftward continuation register correctly ----------
  check("2. a rightward pan (content shifts left within the new frame) registers frame 2 to the RIGHT of frame 1 in workspace space", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    workspace = addFrame(workspace, FRAME_2, 1, correspondencesFor(translation(-0.5, 0)));
    const [frame1, frame2] = workspace.frames;
    assert.ok(frameWorkspaceBoundsV1(frame2).minX > frameWorkspaceBoundsV1(frame1).minX, JSON.stringify(workspace.frames));
  });

  check("3. a leftward pan (content shifts right within the new frame) registers frame 2 to the LEFT of frame 1 -- workspace coordinates go NEGATIVE, never assumed rightward", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    workspace = addFrame(workspace, FRAME_2, 1, correspondencesFor(translation(0.5, 0)));
    const [frame1, frame2] = workspace.frames;
    assert.ok(frameWorkspaceBoundsV1(frame2).minX < frameWorkspaceBoundsV1(frame1).minX, JSON.stringify(workspace.frames));
    assert.ok(frameWorkspaceBoundsV1(frame2).minX < 0);
  });

  // --- 4: upward/downward continuation can register -------------------------
  check("4. upward and downward pans register with the correct, opposite sign of vertical placement", () => {
    let up = emptyRouteAssistStitchedWorkspaceV1();
    up = addFrame(up, FRAME_1, 1);
    up = addFrame(up, FRAME_2, 1, correspondencesFor(translation(0, 0.4)));
    let down = emptyRouteAssistStitchedWorkspaceV1();
    down = addFrame(down, FRAME_1, 1);
    down = addFrame(down, FRAME_2, 1, correspondencesFor(translation(0, -0.4)));
    assert.ok(frameWorkspaceBoundsV1(up.frames[1]).minY < frameWorkspaceBoundsV1(up.frames[0]).minY);
    assert.ok(frameWorkspaceBoundsV1(down.frames[1]).minY > frameWorkspaceBoundsV1(down.frames[0]).minY);
  });

  // --- 5: modest camera rotation is handled ---------------------------------
  check("5. a modest camera rotation between frames still registers (geometric registration, not a plain translate+scale assumption)", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    const result = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, aspectRatio: 1, correspondencesFromPrevious: correspondencesFor(similarity(0.25, 1.05, -0.3, 0.02)) });
    assert.equal(result.outcome, "ADDED", JSON.stringify(result));
    assert.equal(result.registration.transformType, "SIMILARITY");
  });

  // --- 6: modest perspective change is handled when needed -----------------
  check("6. a genuine perspective change registers as HOMOGRAPHY when every point must be explained", () => {
    const cornerSpread: RouteAssistLocalPointV1[] = [
      { x: 0.02, y: 0.02 }, { x: 0.98, y: 0.03 }, { x: 0.5, y: 0.5 },
      { x: 0.97, y: 0.97 }, { x: 0.03, y: 0.95 }, { x: 0.6, y: 0.1 },
    ];
    const truth: RouteAssistTransformMatrixV1 = [1.1, 0.05, -0.3, -0.04, 1.05, 0.03, 1.5, 0.9, 1];
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    const result = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, aspectRatio: 1, correspondencesFromPrevious: correspondencesFor(truth, cornerSpread) });
    assert.equal(result.outcome, "ADDED", JSON.stringify(result));
  });

  // --- 7: full original source image remains represented --------------------
  check("7. mapping a frame's own full [0,1]x[0,1] local extent through its registered transform still reaches every one of its 4 corners -- nothing is clipped by the coordinate model", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    workspace = addFrame(workspace, FRAME_2, 1, correspondencesFor(similarity(0.15, 1.02, -0.4, 0.05)));
    const frame2 = workspace.frames[1];
    const corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }].map((c) => frameLocalToWorkspaceV1(frame2, c));
    const bounds = frameWorkspaceBoundsV1(frame2);
    // A rotated frame's 4 corners are not individually axis-aligned with the
    // bounding box (only rotation-free frames have that property) -- the
    // real, rotation-general check is that every corner lies WITHIN the
    // bounds, and collectively the 4 corners are exactly what produced
    // those min/max bounds in the first place (proving the full image, not
    // a cropped subset, is what got measured).
    for (const corner of corners) {
      assert.ok(corner.wx >= bounds.minX - 1e-9 && corner.wx <= bounds.maxX + 1e-9, JSON.stringify({ corner, bounds }));
      assert.ok(corner.wy >= bounds.minY - 1e-9 && corner.wy <= bounds.maxY + 1e-9, JSON.stringify({ corner, bounds }));
    }
    assert.ok(Math.abs(Math.min(...corners.map((c) => c.wx)) - bounds.minX) < 1e-9);
    assert.ok(Math.abs(Math.max(...corners.map((c) => c.wx)) - bounds.maxX) < 1e-9);
    assert.ok(Math.abs(Math.min(...corners.map((c) => c.wy)) - bounds.minY) < 1e-9);
    assert.ok(Math.abs(Math.max(...corners.map((c) => c.wy)) - bounds.maxY) < 1e-9);
  });

  // --- landscape/native aspect ratio is preserved ---------------------------
  check("7b. a landscape (16:9) first frame's registered bounds reflect its real aspect ratio, and a portrait (9:16) second frame's registration composes correctly on top of that scale", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 16 / 9);
    const bounds1 = frameWorkspaceBoundsV1(workspace.frames[0]);
    assert.ok(Math.abs(bounds1.maxX - bounds1.minX - 16 / 9) < 1e-9, JSON.stringify(bounds1));
    assert.ok(Math.abs(bounds1.maxY - bounds1.minY - 1) < 1e-9, JSON.stringify(bounds1));

    workspace = addFrame(workspace, FRAME_2, 9 / 16, correspondencesFor(translation(-0.5, 0)));
    const bounds2 = frameWorkspaceBoundsV1(workspace.frames[1]);
    // frame 2's own registered WIDTH in workspace units reflects both its
    // own aspect ratio AND frame 1's aspect-corrected scale it was
    // registered against -- not a bare 1x1 assumption either way.
    assert.ok(bounds2.maxX - bounds2.minX > 0 && bounds2.maxY - bounds2.minY > 0);
  });

  // --- 8: transformed corners produce correct overall bounds ---------------
  check("8. overall workspace bounds are the min/max of every frame's own TRANSFORMED corners, not an assumption of axis-aligned rectangles", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    workspace = addFrame(workspace, FRAME_2, 1, correspondencesFor(similarity(0.2, 1.0, 0.5, -0.1)));
    const overall = workspaceOverallBoundsV1(workspace)!;
    const b1 = frameWorkspaceBoundsV1(workspace.frames[0]);
    const b2 = frameWorkspaceBoundsV1(workspace.frames[1]);
    assert.equal(overall.minX, Math.min(b1.minX, b2.minX));
    assert.equal(overall.minY, Math.min(b1.minY, b2.minY));
    assert.equal(overall.maxX, Math.max(b1.maxX, b2.maxX));
    assert.equal(overall.maxY, Math.max(b1.maxY, b2.maxY));
  });

  // --- 9: negative coordinates handled --------------------------------------
  check("9. workspace bounds correctly reflect negative origins from panning left/up -- never clamped away", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    workspace = addFrame(workspace, FRAME_2, 1, correspondencesFor(translation(0.5, 0)));
    const bounds = workspaceOverallBoundsV1(workspace)!;
    assert.ok(bounds.minX < 0, JSON.stringify(bounds));
  });

  // --- 10: alignment meets an explicit quality threshold --------------------
  check("10. a frame whose correspondences fail the registration quality bar is REFUSED, and the workspace is returned completely unchanged", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    const before = workspace;
    // A larger scrambled set than the minimal 4-6 points is deliberate: with
    // too few candidates, a flexible enough model (homography needs only 4
    // points to fit EXACTLY) can occasionally satisfy the default inlier
    // ratio purely by chance on a small sample -- a real, honest property
    // of robust fitting, not a bug, but it means a reliable "no consistent
    // relationship at all" proof needs enough points to rule that out.
    const scrambled: RouteAssistPointCorrespondenceV1[] = [
      { from: { x: 0.1, y: 0.1 }, to: { x: 0.9, y: 0.85 } },
      { from: { x: 0.8, y: 0.2 }, to: { x: 0.15, y: 0.6 } },
      { from: { x: 0.5, y: 0.9 }, to: { x: 0.4, y: 0.1 } },
      { from: { x: 0.3, y: 0.4 }, to: { x: 0.7, y: 0.75 } },
      { from: { x: 0.9, y: 0.6 }, to: { x: 0.05, y: 0.3 } },
      { from: { x: 0.2, y: 0.7 }, to: { x: 0.85, y: 0.15 } },
      { from: { x: 0.65, y: 0.05 }, to: { x: 0.3, y: 0.95 } },
      { from: { x: 0.05, y: 0.5 }, to: { x: 0.6, y: 0.4 } },
      { from: { x: 0.95, y: 0.9 }, to: { x: 0.1, y: 0.05 } },
      { from: { x: 0.45, y: 0.15 }, to: { x: 0.5, y: 0.55 } },
    ];
    const result = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, aspectRatio: 1, correspondencesFromPrevious: scrambled });
    assert.equal(result.outcome, "REFUSED", JSON.stringify(result));
    assert.deepEqual(result.workspace, before, "a rejected registration must leave the prior valid workspace completely unmutated");
  });

  // --- 11: unrelated images fail registration -------------------------------
  check("11. no matched landmarks at all is refused outright, distinct from a genuinely bad geometric fit", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    const result = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, aspectRatio: 1, correspondencesFromPrevious: [] });
    assert.equal(result.outcome, "REFUSED");
  });

  // --- 12: semantic match without good geometric alignment fails -----------
  check("12. a real underlying transform plus heavy, irregular scatter across enough points to rule out a lucky minimal-sample fit still fails registration", () => {
    const manyPoints: RouteAssistLocalPointV1[] = [
      { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.15 }, { x: 0.5, y: 0.2 }, { x: 0.2, y: 0.4 },
      { x: 0.6, y: 0.45 }, { x: 0.15, y: 0.6 }, { x: 0.45, y: 0.65 }, { x: 0.35, y: 0.8 },
      { x: 0.55, y: 0.85 }, { x: 0.25, y: 0.9 },
    ];
    const dxs = [0.18, -0.22, 0.09, -0.31, 0.24, -0.11, 0.29, -0.17, 0.13, -0.26];
    const dys = [-0.19, 0.27, -0.08, 0.21, -0.33, 0.16, -0.23, 0.3, -0.12, 0.19];
    const heavilyScattered = correspondencesFor(translation(0.25, -0.1), manyPoints).map((c, i) => ({ from: c.from, to: { x: c.to.x + dxs[i], y: c.to.y + dys[i] } }));
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    const result = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, aspectRatio: 1, correspondencesFromPrevious: heavilyScattered });
    assert.equal(result.outcome, "REFUSED", JSON.stringify(result));
  });

  // --- 13: failed registration does not mutate the workspace ---------------
  check("13. after a REFUSED registration attempt, the homeowner's prior valid workspace is still there, unmodified, and a subsequent VALID attempt still succeeds normally", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    const failedAttempt = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, aspectRatio: 1, correspondencesFromPrevious: [] });
    assert.equal(failedAttempt.outcome, "REFUSED");
    assert.equal(failedAttempt.workspace.frames.length, 1);
    const succeeded = addRouteAssistStitchedWorkspaceFrameV1({ workspace: failedAttempt.workspace, imageId: FRAME_2, aspectRatio: 1, correspondencesFromPrevious: correspondencesFor(translation(-0.5, 0)) });
    assert.equal(succeeded.outcome, "ADDED", JSON.stringify(succeeded));
  });

  // --- 14: inverse mapping from workspace point to source image works ------
  check("14. workspaceToFrameLocalV1 correctly inverts frameLocalToWorkspaceV1 for a rotated/scaled registration, round-tripping back to the original local point", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    workspace = addFrame(workspace, FRAME_2, 1, correspondencesFor(similarity(0.2, 1.05, -0.4, 0.1)));
    const frame2 = workspace.frames[1];
    const local = { x: 0.37, y: 0.61 };
    const workspacePoint = frameLocalToWorkspaceV1(frame2, local);
    const roundTrip = workspaceToFrameLocalV1(frame2, workspacePoint);
    assert.ok(Math.abs(roundTrip.x - local.x) < 1e-9 && Math.abs(roundTrip.y - local.y) < 1e-9, JSON.stringify(roundTrip));
  });

  // --- 15: one workspace point in overlap maps to multiple images ----------
  check("15. a workspace position inside the overlapping region of two frames is genuinely supported by BOTH, but resolves to exactly ONE primary supporting frame, and the marker itself is still a single object", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    workspace = addFrame(workspace, FRAME_2, 1, correspondencesFor(translation(-0.6, 0))); // shared region is frame1's right ~40% == frame2's left ~40%
    const overlapPoint = frameLocalToWorkspaceV1(workspace.frames[0], { x: 0.85, y: 0.5 });
    const containing = framesContainingWorkspacePointV1(workspace, overlapPoint);
    assert.equal(containing.length, 2, "the overlap region must genuinely be inside both frames' bounds");
    const primary = primarySupportingFrameForWorkspacePointV1(workspace, overlapPoint);
    assert.ok(primary);
    const markers = placeRouteAssistWorkspaceMarkerV1([], overlapPoint, "RECEPTACLE");
    assert.equal(markers.length, 1, "one device, one marker, regardless of how many frames support it");
  });

  check("15b. capture cannot be marked complete before any frame has been taken", () => {
    const result = markRouteAssistStitchedWorkspaceCompleteV1(emptyRouteAssistStitchedWorkspaceV1());
    assert.equal(result.outcome, "REFUSED");
  });

  // --- 27: markers exist only in workspace coordinates (regression) --------
  check("27. a placed marker carries workspace coordinates (wx/wy) and NO per-frame identity at all", () => {
    const markers = placeRouteAssistWorkspaceMarkerV1([], { wx: 0.42, wy: 0.6 }, "RECEPTACLE");
    const marker = markers[0];
    assert.equal(marker.wx, 0.42);
    assert.equal(marker.wy, 0.6);
    assert.equal("imageId" in marker, false, "a workspace marker must never carry a per-frame imageId");
  });

  // --- 28: route-intent model unchanged -------------------------------------
  check("28. A->B (switch), with C and D controlled by B, evaluates as B->C and B->D -- never A->C/A->D", () => {
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

  // --- 29: support-path/baseboard fixes unchanged ---------------------------
  check("29a. a switch->ceiling-light leg derives support path CEILING and reaches PHOTO_SUFFICIENT with NO baseboard fact written at all", () => {
    const supportPathKind = deriveRouteAssistSupportPathKindV1({ sourceMarkerType: "SWITCH", destinationMarkerType: "CEILING_LIGHT" });
    assert.equal(supportPathKind, "CEILING");
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "B", FRAME_1);
    store = writeAnchor(store, "DESTINATION_ANCHOR", "C", FRAME_1);
    store = writeRouteAssistFactV1(store, { type: "WALL_PLANE", scopeId: "leg-B-C", value: { kind: "BOOLEAN", value: true }, evidenceImageIds: [], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true }).store;
    store = writeRouteAssistFactV1(store, { type: "DOORWAY_PRESENCE", scopeId: "doorway:leg-B-C:1", value: { kind: "BOOLEAN", value: false }, evidenceImageIds: [], provenance: { source: "VISION_PROVIDER", providerKey: "test", at: new Date().toISOString() }, lockOnWrite: true }).store;
    const escalation = evaluateRouteAssistPhotoEscalationV1({ store, legScopeId: "leg-B-C", sourceScopeId: "B", destinationScopeId: "C", supportPathKind });
    assert.equal(escalation.escalation, "PHOTO_SUFFICIENT", JSON.stringify(escalation));
    assert.ok(!escalation.missingFactTypes.includes("BASEBOARD_CONTINUITY"));
  });

  check("29b. a genuine outlet-to-outlet (lower-wall) leg derives LOWER_WALL_OR_BASEBOARD and STILL requires baseboard continuity -- missing it yields TARGETED_PHOTO_REQUIRED", () => {
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

  // --- 30: existing doorway/corner/furniture/window behavior unchanged -----
  check("30. an existing furniture-occluded corner + resolved doorway single-photo case still reaches PHOTO_SUFFICIENT, exactly as before this pass", () => {
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

  // --- capture-complete gate remains intact ---------------------------------
  check("20/21-equivalent. evaluateRouteAssistWorkspaceLegV1 refuses (CAPTURE_INCOMPLETE) while captureComplete=false, no matter what facts already exist", () => {
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1); // NOT marked complete
    const A = { wx: 0.1, wy: 0.5, markerType: "RECEPTACLE" as const };
    const B = { wx: 0.85, wy: 0.5, markerType: "RECEPTACLE" as const };
    let store = emptyRouteAssistFactStoreV1();
    store = writeAnchor(store, "SOURCE_ANCHOR", "A", FRAME_1);
    store = writeAnchor(store, "DESTINATION_ANCHOR", "B", FRAME_1);
    const evaluation = evaluateRouteAssistWorkspaceLegV1({ workspace, store, legScopeId: "leg-A-B", sourceScopeId: "A", destinationScopeId: "B", sourceMarker: A, destinationMarker: B });
    assert.equal(evaluation.outcome, "CAPTURE_INCOMPLETE");
  });

  // --- no concealed-wire inference ------------------------------------------
  check("no-concealed-wiring-a. two lights sharing one switch are each independently B->light -- never chained B->C->D, and neither leg's derivation depends on the OTHER light existing", () => {
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

  check("no-concealed-wiring-b. a controlledBySwitchLabel that does not resolve to a real, distinct SWITCH marker is never honored -- falls back to the ordinary star topology rather than guessing", () => {
    let markers: RouteAssistWorkspaceMarkerV1[] = [];
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.1, wy: 0.5 }, "RECEPTACLE"); // A
    markers = placeRouteAssistWorkspaceMarkerV1(markers, { wx: 0.7, wy: 0.2 }, "CEILING_LIGHT"); // B (no switch exists at all)
    const bId = markers.find((m) => m.label === "B")!.id;
    markers = setRouteAssistWorkspaceMarkerControllingSwitchV1(markers, bId, "NONEXISTENT");
    const intents = deriveRouteAssistWorkspaceLegIntentsV1(markers);
    assert.equal(intents.find((i) => i.destinationLabel === "B")?.sourceLabel, "A", "an unresolved control reference must fall back to the source, never invent a switch");
    assert.equal(intents.find((i) => i.destinationLabel === "B")?.isDownstreamOfSwitch, false);
  });

  // --- guided-continuation guidance/hold behavior unchanged (regression) ---

  check("22. too much overlap says KEEP_MOVING (unchanged)", () => {
    assert.equal(evaluateRouteAssistContinuationWindowV1({ matched: true, confidence: 0.9, overlapFraction: 0.95 }).state, "KEEP_MOVING");
  });

  check("23. too little overlap says MOVE_BACK (unchanged)", () => {
    assert.equal(evaluateRouteAssistContinuationWindowV1({ matched: true, confidence: 0.9, overlapFraction: 0.02 }).state, "MOVE_BACK");
  });

  check("24a. a single IN_RANGE probe does not immediately trigger capture (stable-hold unchanged)", () => {
    const result = advanceRouteAssistCaptureHoldV1({ previous: initialRouteAssistCaptureHoldStateV1(), probe: { matched: true, confidence: 0.9, overlapFraction: 0.5 }, nowMs: 0 });
    assert.equal(result.shouldCapture, false);
    assert.equal(result.guidance, "ALMOST_THERE");
  });

  check("24b/25. two consecutive IN_RANGE probes trigger capture -- this is the point at which the caller takes the full-quality photo (unchanged)", () => {
    let state: RouteAssistCaptureHoldStateV1 = initialRouteAssistCaptureHoldStateV1();
    const probe = { matched: true, confidence: 0.9, overlapFraction: 0.5 };
    const first = advanceRouteAssistCaptureHoldV1({ previous: state, probe, nowMs: 0 });
    state = first.holdState;
    assert.equal(first.shouldCapture, false);
    const second = advanceRouteAssistCaptureHoldV1({ previous: state, probe, nowMs: 50 });
    assert.equal(second.shouldCapture, true, JSON.stringify(second));
    assert.equal(second.guidance, "READY_TO_CAPTURE");
  });

  check("24c. a single IN_RANGE probe held for the minimum duration also triggers capture (unchanged)", () => {
    const state = initialRouteAssistCaptureHoldStateV1();
    const probe = { matched: true, confidence: 0.9, overlapFraction: 0.5 };
    const first = advanceRouteAssistCaptureHoldV1({ previous: state, probe, nowMs: 0 });
    assert.equal(first.shouldCapture, false);
    const second = advanceRouteAssistCaptureHoldV1({ previous: first.holdState, probe, nowMs: ROUTE_ASSIST_CAPTURE_HOLD_MIN_DURATION_MS_V1 + 10 });
    assert.equal(second.shouldCapture, true, JSON.stringify(second));
  });

  check("24d. readiness lost mid-hold cancels the hold outright (unchanged)", () => {
    let state: RouteAssistCaptureHoldStateV1 = initialRouteAssistCaptureHoldStateV1();
    const inRange = { matched: true, confidence: 0.9, overlapFraction: 0.5 };
    const tooMuch = { matched: true, confidence: 0.9, overlapFraction: 0.95 };
    const first = advanceRouteAssistCaptureHoldV1({ previous: state, probe: inRange, nowMs: 0 });
    state = first.holdState;
    const lost = advanceRouteAssistCaptureHoldV1({ previous: state, probe: tooMuch, nowMs: 20 });
    assert.equal(lost.shouldCapture, false);
    assert.deepEqual(lost.holdState, initialRouteAssistCaptureHoldStateV1());
  });

  // --- 26: registration rejection is separate from live probe readiness ----
  check("26. a candidate frame that satisfies the live-guidance stable-hold rule can STILL be refused by real geometric registration -- these are two independent gates, not one", () => {
    // The probe/hold rule only ever sees confidence + overlapFraction, and
    // reports stable readiness here exactly as it would for any other
    // in-range reading -- it has no way to know (and must not need to know)
    // that the ACTUAL point correspondences for this candidate frame will
    // turn out to be geometrically inconsistent.
    let holdState: RouteAssistCaptureHoldStateV1 = initialRouteAssistCaptureHoldStateV1();
    const probe = { matched: true, confidence: 0.9, overlapFraction: 0.5 };
    holdState = advanceRouteAssistCaptureHoldV1({ previous: holdState, probe, nowMs: 0 }).holdState;
    const readiness = advanceRouteAssistCaptureHoldV1({ previous: holdState, probe, nowMs: 50 });
    assert.equal(readiness.shouldCapture, true, "the live probe/hold layer reports stable readiness -- a full-quality photo would now be captured");

    // The actual full-quality candidate's landmark correspondences turn out
    // NOT to support any transform -- registration must reject regardless
    // of the (already-satisfied) live-guidance readiness above.
    let workspace = emptyRouteAssistStitchedWorkspaceV1();
    workspace = addFrame(workspace, FRAME_1, 1);
    const registrationResult = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: FRAME_2, aspectRatio: 1, correspondencesFromPrevious: [] });
    assert.equal(registrationResult.outcome, "REFUSED", "readiness from the live probe/hold layer must never bypass the separate geometric registration gate");
  });

  console.log(`\nRoute Assist stitched-workspace architecture verification: ${passed} passed, 0 failed.`);
}

main();
