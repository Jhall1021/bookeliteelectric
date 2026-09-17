import {
  evaluateRouteAssistPhotoEscalationV1,
  type RouteAssistCaptureEscalationResultV1,
  type RouteAssistSupportPathKindV1,
} from "./captureEscalation";
import type { RouteAssistFactStoreV1 } from "./factModel";
import type { RouteAssistDestinationType } from "./taxonomy";
import {
  applyTransformV1,
  composeTransformsV1,
  identityTransformV1,
  invertTransformV1,
  isTransformSaneV1,
  registerFrameV1,
  ROUTE_ASSIST_LOCAL_UNIT_CORNERS_V1,
  type RouteAssistPointCorrespondenceV1,
  type RouteAssistRegistrationResultV1,
  type RouteAssistTransformMatrixV1,
  type RouteAssistTransformTypeV1,
} from "./imageRegistration";

/**
 * PRODUCT CORRECTION: device markers were previously frame-scoped
 * (RouteAssistPhotoMarkerV1 carried an imageId, and evaluating a leg that
 * spanned frames meant decomposing it into per-frame sub-evaluations). The
 * homeowner should never place devices on individual capture frames --
 * captured photos are only evidence used to construct ONE connected
 * representation of the work area. This module replaces that model:
 *
 *   capture photo(s) -> validate overlap/coverage -> register/stitch into
 *   one connected workspace -> homeowner marks capture complete -> devices
 *   are placed ONCE, in WORKSPACE coordinates -> Route Assist evaluates
 *   route topology.
 *
 * REAL-REGISTRATION CORRECTION (real-phone finding): earlier passes placed
 * frames from capture order plus a semantic AI's overlapFraction/direction
 * guess -- approximate by construction, and a real-phone test showed the
 * predictable result: a hard seam, geometry that didn't actually line up,
 * and unused black canvas. Placement is now driven by REAL geometric
 * image-to-image registration (imageRegistration.ts): candidate point
 * correspondences (proposed by a semantic AI, but never trusted blindly --
 * see that module's own doc comment) are fit to the smallest transform
 * model (translation -> similarity -> affine -> homography) that a robust
 * consensus of the ACTUAL points supports, and a frame is registered ONLY
 * when that fit clears an explicit quality bar. Every frame's placement is
 * a full 3x3 transform matrix (RouteAssistTransformMatrixV1) into shared
 * workspace space, composed transitively through whichever earlier frame
 * it was registered against -- capture ORDER is retained purely as
 * provenance metadata and never drives placement math anywhere in this
 * module. Workspace coordinates may go negative in either axis, and a
 * frame may be rotated/skewed relative to workspace axes; nothing here
 * assumes an axis-aligned rectangle.
 *
 * V1 SCOPING (deliberate, documented, not a hidden limitation): this is a
 * trustworthy 2D registered composite, not full 3D reconstruction, SLAM,
 * or photorealistic panorama blending -- see imageRegistration.ts for the
 * transform hierarchy and quality thresholds this relies on.
 */

export const ROUTE_ASSIST_STITCHED_WORKSPACE_SCOPE_V1 = "__route-assist-stitched-workspace__";

export type RouteAssistWorkspaceFrameRegistrationV1 = {
  imageId: string;
  /** Capture order, PROVENANCE ONLY -- never consulted by any placement/bounds/mapping function in this module. Visual placement comes entirely from transformToWorkspace. */
  order: number;
  /** This frame's own pixel width/height ratio -- needed to know its local unit square's true shape before any transform is applied. */
  aspectRatio: number;
  /** Maps this frame's own normalized [0,1]x[0,1] local space into shared workspace coordinates. For the first frame this is the identity (it defines the workspace's own coordinate frame); for every later frame it is composed from the registration transform fit against whichever frame it was registered relative to. */
  transformToWorkspace: RouteAssistTransformMatrixV1;
  /** The exact inverse of transformToWorkspace -- stored rather than re-derived on every lookup, since inversion is where a near-degenerate transform could fail and callers should not have to handle that at every read site. */
  transformFromWorkspace: RouteAssistTransformMatrixV1;
  /** Registration provenance -- inspectable, not just "trust me": which transform type was fit, and the objective quality evidence behind it. */
  registration:
    | { source: "FIRST_FRAME" }
    | { source: "GEOMETRIC_REGISTRATION"; fromImageId: string; transformType: RouteAssistTransformTypeV1; inlierCount: number; candidateCount: number; meanReprojectionError: number };
};

export type RouteAssistWorkspaceBoundsV1 = { minX: number; minY: number; maxX: number; maxY: number };

export type RouteAssistStitchedWorkspaceV1 = {
  version: 1;
  frames: RouteAssistWorkspaceFrameRegistrationV1[];
  /** Homeowner-declared, never inferred. */
  captureComplete: boolean;
};

export function emptyRouteAssistStitchedWorkspaceV1(): RouteAssistStitchedWorkspaceV1 {
  return { version: 1, frames: [], captureComplete: false };
}

export type RouteAssistStitchedWorkspaceAddFrameResultV1 =
  | { outcome: "ADDED"; workspace: RouteAssistStitchedWorkspaceV1; registration: RouteAssistRegistrationResultV1 & { outcome: "REGISTERED" } }
  | { outcome: "REFUSED"; workspace: RouteAssistStitchedWorkspaceV1; problem: string; registration: RouteAssistRegistrationResultV1 | null };

/**
 * Appends a frame and registers it into workspace space using REAL
 * geometric registration. The FIRST frame needs no correspondences and
 * defines the workspace's own coordinate frame (identity transform) -- but
 * still needs its own real aspectRatio, since even the first frame's
 * uncropped extent must be represented correctly. Every later frame
 * REQUIRES point correspondences against the immediately preceding frame;
 * imageRegistration.ts's registerFrameV1 decides whether any transform
 * model fits them with sufficient quality. REJECTED means exactly that:
 * this function REFUSES the frame outright -- the existing valid workspace
 * is returned completely unchanged, and there is no approximate/fallback
 * placement anywhere in this path.
 */
export function addRouteAssistStitchedWorkspaceFrameV1(args: {
  workspace: RouteAssistStitchedWorkspaceV1;
  imageId: string;
  aspectRatio: number;
  correspondencesFromPrevious?: readonly RouteAssistPointCorrespondenceV1[];
}): RouteAssistStitchedWorkspaceAddFrameResultV1 {
  const { workspace } = args;
  if (workspace.captureComplete) {
    return { outcome: "REFUSED", workspace, problem: "cannot add a frame after the work area has been marked fully captured", registration: null };
  }
  if (workspace.frames.some((frame) => frame.imageId === args.imageId)) {
    return { outcome: "REFUSED", workspace, problem: `frame ${args.imageId} has already been added to this workspace`, registration: null };
  }
  if (!Number.isFinite(args.aspectRatio) || args.aspectRatio <= 0) {
    return { outcome: "REFUSED", workspace, problem: `frame ${args.imageId} has an invalid aspect ratio`, registration: null };
  }

  const previous = workspace.frames[workspace.frames.length - 1];
  if (!previous) {
    // The FIRST frame defines the workspace's own coordinate scale. Its
    // local space is normalized [0,1]x[0,1] INDEPENDENTLY per axis (the
    // same convention markers/anchors already use everywhere in this
    // codebase), which is only literally square when aspectRatio happens to
    // be 1 -- so the identity transform alone would silently treat every
    // frame's real width/height as equal. Scaling the FIRST frame's own
    // transform by its aspectRatio here (rather than leaving it pure
    // identity) makes 1 workspace-x-unit and 1 workspace-y-unit correspond
    // to the same real physical distance from then on -- and because every
    // later frame's transform is composed relative to this one (see the
    // ADDED branch below), that correction propagates through the whole
    // chain automatically, with no special-casing needed anywhere else
    // (bounds, rendering, inverse mapping) for a frame's own aspect ratio.
    const firstFrameTransform: RouteAssistTransformMatrixV1 = [args.aspectRatio, 0, 0, 0, 1, 0, 0, 0, 1];
    const frame: RouteAssistWorkspaceFrameRegistrationV1 = {
      imageId: args.imageId,
      order: 1,
      aspectRatio: args.aspectRatio,
      transformToWorkspace: firstFrameTransform,
      transformFromWorkspace: invertTransformV1(firstFrameTransform) ?? identityTransformV1(),
      registration: { source: "FIRST_FRAME" },
    };
    return { outcome: "ADDED", workspace: { ...workspace, frames: [frame] }, registration: { outcome: "REGISTERED", transformType: "TRANSLATION", matrix: identityTransformV1(), inverseMatrix: identityTransformV1(), inlierCount: 0, candidateCount: 0, meanReprojectionError: 0, inlierIndices: [] } };
  }

  if (!args.correspondencesFromPrevious || args.correspondencesFromPrevious.length === 0) {
    return { outcome: "REFUSED", workspace, problem: `frame ${args.imageId} requires matched point correspondences back to ${previous.imageId} before it can be registered`, registration: null };
  }

  const registration = registerFrameV1({ correspondences: args.correspondencesFromPrevious });
  if (registration.outcome === "REJECTED") {
    return {
      outcome: "REFUSED",
      workspace,
      problem: `frame ${args.imageId} could not be geometrically aligned with ${previous.imageId}: ${registration.reason} (best inlier count ${registration.bestInlierCount}/${registration.candidateCount})`,
      registration,
    };
  }

  // registration.matrix maps a point in the PREVIOUS frame's local space to
  // the corresponding point in the NEW frame's local space (correspondences
  // are {from: point in previous frame, to: point in new frame}). To place
  // the new frame into WORKSPACE space: newLocal -> [invert(matrix)] ->
  // previousLocal -> [previous.transformToWorkspace] -> workspace. This is
  // exactly composeTransformsV1(outer=previous's own transform, inner=the
  // inverse of the fitted matrix) -- and it composes correctly transitively
  // through any number of earlier frames, since each one's own
  // transformToWorkspace already carries its own full chain.
  const matrixInverse = invertTransformV1(registration.matrix);
  if (!matrixInverse) {
    return { outcome: "REFUSED", workspace, problem: `frame ${args.imageId} produced a degenerate (non-invertible) registration transform`, registration };
  }
  const transformToWorkspace = composeTransformsV1(previous.transformToWorkspace, matrixInverse);
  const transformFromWorkspace = invertTransformV1(transformToWorkspace);
  if (!transformFromWorkspace) {
    return { outcome: "REFUSED", workspace, problem: `frame ${args.imageId} produced a degenerate (non-invertible) workspace transform`, registration };
  }
  // Defense in depth: registerFrameV1 already rejected a pathological RAW
  // fit (isTransformSaneV1), but this checks the actual COMPOSED workspace
  // transform -- the one rendering/bounds/marker-mapping will really use --
  // in case composing through a long chain of otherwise-sane individual
  // registrations ever produced something degenerate. "Do not show black
  // screens" is enforced at both layers, not just the first one.
  if (!isTransformSaneV1(transformToWorkspace)) {
    return { outcome: "REFUSED", workspace, problem: `frame ${args.imageId} produced a pathological workspace transform once composed with the existing chain`, registration };
  }

  const frame: RouteAssistWorkspaceFrameRegistrationV1 = {
    imageId: args.imageId,
    order: previous.order + 1,
    aspectRatio: args.aspectRatio,
    transformToWorkspace,
    transformFromWorkspace,
    registration: {
      source: "GEOMETRIC_REGISTRATION",
      fromImageId: previous.imageId,
      transformType: registration.transformType,
      inlierCount: registration.inlierCount,
      candidateCount: registration.candidateCount,
      meanReprojectionError: registration.meanReprojectionError,
    },
  };
  return { outcome: "ADDED", workspace: { ...workspace, frames: [...workspace.frames, frame] }, registration };
}

export type RouteAssistStitchedWorkspaceCompleteResultV1 =
  | { outcome: "MARKED_COMPLETE"; workspace: RouteAssistStitchedWorkspaceV1 }
  | { outcome: "REFUSED"; workspace: RouteAssistStitchedWorkspaceV1; problem: string };

/** The homeowner's own "entire work area captured" declaration -- the ONLY way captureComplete becomes true. Refuses only on zero frames. */
export function markRouteAssistStitchedWorkspaceCompleteV1(workspace: RouteAssistStitchedWorkspaceV1): RouteAssistStitchedWorkspaceCompleteResultV1 {
  if (workspace.frames.length === 0) {
    return { outcome: "REFUSED", workspace, problem: "cannot mark the work area captured before at least one frame has been taken" };
  }
  return { outcome: "MARKED_COMPLETE", workspace: { ...workspace, captureComplete: true } };
}

/** This frame's own local [0,1]x[0,1] point (its OWN aspect ratio does not enter this math -- correspondences and markers alike are expressed in normalized local space, and the registered transform already captures shape/rotation/perspective), placed into shared workspace coordinates via its real registered transform -- never a bare translate+scale approximation. */
export function frameLocalToWorkspaceV1(frame: RouteAssistWorkspaceFrameRegistrationV1, local: { x: number; y: number }): { wx: number; wy: number } {
  const p = applyTransformV1(frame.transformToWorkspace, local);
  return { wx: p.x, wy: p.y };
}

/** The inverse of frameLocalToWorkspaceV1 -- may return coordinates outside [0,1] when the point is not actually visible in this frame; callers that need "is this point in this frame" should use frameContainsWorkspacePointV1 instead of checking the range themselves. */
export function workspaceToFrameLocalV1(frame: RouteAssistWorkspaceFrameRegistrationV1, point: { wx: number; wy: number }): { x: number; y: number } {
  return applyTransformV1(frame.transformFromWorkspace, { x: point.wx, y: point.wy });
}

/** This frame's own visible rectangle in workspace space, computed from its TRANSFORMED CORNERS (never assumed axis-aligned before transforming) -- "compute workspace bounds from the transformed corners of every accepted image." Never crops: the full [0,1]x[0,1] local extent is exactly what gets transformed. */
export function frameWorkspaceCornersV1(frame: RouteAssistWorkspaceFrameRegistrationV1): Array<{ wx: number; wy: number }> {
  return ROUTE_ASSIST_LOCAL_UNIT_CORNERS_V1.map((corner) => frameLocalToWorkspaceV1(frame, corner));
}

export function frameWorkspaceBoundsV1(frame: RouteAssistWorkspaceFrameRegistrationV1): RouteAssistWorkspaceBoundsV1 {
  const corners = frameWorkspaceCornersV1(frame);
  return {
    minX: Math.min(...corners.map((c) => c.wx)),
    minY: Math.min(...corners.map((c) => c.wy)),
    maxX: Math.max(...corners.map((c) => c.wx)),
    maxY: Math.max(...corners.map((c) => c.wy)),
  };
}

export function workspaceOverallBoundsV1(workspace: RouteAssistStitchedWorkspaceV1): RouteAssistWorkspaceBoundsV1 | null {
  if (workspace.frames.length === 0) return null;
  const bounds = workspace.frames.map(frameWorkspaceBoundsV1);
  return {
    minX: Math.min(...bounds.map((b) => b.minX)),
    minY: Math.min(...bounds.map((b) => b.minY)),
    maxX: Math.max(...bounds.map((b) => b.maxX)),
    maxY: Math.max(...bounds.map((b) => b.maxY)),
  };
}

function frameContainsWorkspacePointV1(frame: RouteAssistWorkspaceFrameRegistrationV1, point: { wx: number; wy: number }): boolean {
  const local = workspaceToFrameLocalV1(frame, point);
  return local.x >= 0 && local.x <= 1 && local.y >= 0 && local.y <= 1;
}

/** Every source frame that actually shows this workspace position, ordered by capture order -- "map workspace positions back to supporting source frames/evidence." */
export function framesContainingWorkspacePointV1(workspace: RouteAssistStitchedWorkspaceV1, point: { wx: number; wy: number }): RouteAssistWorkspaceFrameRegistrationV1[] {
  return workspace.frames.filter((frame) => frameContainsWorkspacePointV1(frame, point)).sort((a, b) => a.order - b.order);
}

/**
 * A device may happen to be visible in more than one source frame, but it
 * still has exactly one canonical workspace position -- and, for the one
 * real photo Route Assist ultimately interprets it against, exactly one
 * PRIMARY supporting frame: whichever containing frame shows it closest to
 * that frame's own center (least likely to be cropped/foreshortened at the
 * edge). Ties break toward the earliest frame, for determinism.
 */
export function primarySupportingFrameForWorkspacePointV1(workspace: RouteAssistStitchedWorkspaceV1, point: { wx: number; wy: number }): RouteAssistWorkspaceFrameRegistrationV1 | null {
  const containing = framesContainingWorkspacePointV1(workspace, point);
  if (containing.length === 0) return null;
  let best = containing[0];
  let bestDistance = centerDistanceV1(best, point);
  for (const frame of containing.slice(1)) {
    const distance = centerDistanceV1(frame, point);
    if (distance < bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }
  return best;
}

function centerDistanceV1(frame: RouteAssistWorkspaceFrameRegistrationV1, point: { wx: number; wy: number }): number {
  const local = workspaceToFrameLocalV1(frame, point);
  return Math.hypot(local.x - 0.5, local.y - 0.5);
}

// --- Device markers, in workspace coordinates only --------------------------

export type RouteAssistWorkspaceMarkerRoleV1 = "SOURCE" | "DESTINATION";

export type RouteAssistWorkspaceMarkerV1 = {
  id: string;
  role: RouteAssistWorkspaceMarkerRoleV1;
  /** "A" for the source; "B", "C", "D", ... for destinations, in placement order. */
  label: string;
  wx: number;
  wy: number;
  markerType: RouteAssistDestinationType;
  /**
   * ROUTE-INTENT CORRECTION: for a DESTINATION marker that is itself wired
   * downstream of a controlling switch placed elsewhere in this workspace
   * (a light on switch B), this names that switch's own label. null/absent
   * means this destination is wired directly from the ultimate source --
   * the ordinary star topology. Homeowner-declared only, exactly like
   * markerType -- never inferred, and this module never guesses concealed
   * cable order between multiple lights sharing one switch.
   */
  controlledBySwitchLabel?: string | null;
};

function markerIdFor(role: RouteAssistWorkspaceMarkerRoleV1, label: string): string {
  return `workspace-marker-${role.toLowerCase()}-${label}`;
}

export function nextRouteAssistWorkspaceMarkerLabelV1(existing: readonly RouteAssistWorkspaceMarkerV1[]): { role: RouteAssistWorkspaceMarkerRoleV1; label: string } {
  if (!existing.some((marker) => marker.role === "SOURCE")) return { role: "SOURCE", label: "A" };
  const destinationCount = existing.filter((marker) => marker.role === "DESTINATION").length;
  return { role: "DESTINATION", label: String.fromCharCode("B".charCodeAt(0) + destinationCount) };
}

export function placeRouteAssistWorkspaceMarkerV1(existing: readonly RouteAssistWorkspaceMarkerV1[], point: { wx: number; wy: number }, markerType: RouteAssistDestinationType): RouteAssistWorkspaceMarkerV1[] {
  const { role, label } = nextRouteAssistWorkspaceMarkerLabelV1(existing);
  const marker: RouteAssistWorkspaceMarkerV1 = { id: markerIdFor(role, label), role, label, wx: point.wx, wy: point.wy, markerType };
  return [...existing, marker];
}

export function repositionRouteAssistWorkspaceMarkerV1(existing: readonly RouteAssistWorkspaceMarkerV1[], markerId: string, point: { wx: number; wy: number }): RouteAssistWorkspaceMarkerV1[] {
  return existing.map((marker) => (marker.id === markerId ? { ...marker, wx: point.wx, wy: point.wy } : marker));
}

export function setRouteAssistWorkspaceMarkerTypeV1(existing: readonly RouteAssistWorkspaceMarkerV1[], markerId: string, markerType: RouteAssistDestinationType): RouteAssistWorkspaceMarkerV1[] {
  return existing.map((marker) => (marker.id === markerId ? { ...marker, markerType } : marker));
}

/** Sets or clears which switch controls this DESTINATION marker. A reference to a label that isn't actually a SWITCH marker (or to itself) is stored as-is but never honored by deriveRouteAssistWorkspaceLegIntentsV1 -- see that function's own doc comment. */
export function setRouteAssistWorkspaceMarkerControllingSwitchV1(existing: readonly RouteAssistWorkspaceMarkerV1[], markerId: string, controllingSwitchLabel: string | null): RouteAssistWorkspaceMarkerV1[] {
  return existing.map((marker) => (marker.id === markerId ? { ...marker, controlledBySwitchLabel: controllingSwitchLabel } : marker));
}

export function removeRouteAssistWorkspaceMarkerV1(existing: readonly RouteAssistWorkspaceMarkerV1[], markerId: string): RouteAssistWorkspaceMarkerV1[] {
  const remaining = existing.filter((marker) => marker.id !== markerId);
  const source = remaining.filter((marker) => marker.role === "SOURCE");
  const destinations = remaining.filter((marker) => marker.role === "DESTINATION");
  const relabeled = destinations.map((marker, index) => {
    const label = String.fromCharCode("B".charCodeAt(0) + index);
    // A downstream light's controllingSwitchLabel reference tracks the
    // switch's OWN (stable) label, never a positional index, so relabeling
    // destinations here never silently repoints one marker's control
    // reference at a different marker.
    return { ...marker, label, id: markerIdFor("DESTINATION", label) };
  });
  return [...source, ...relabeled];
}

// --- Route intent: source -> switch -> downstream light group --------------

export type RouteAssistWorkspaceLegIntentV1 = {
  legScopeId: string;
  sourceLabel: string;
  destinationLabel: string;
  isDownstreamOfSwitch: boolean;
};

/**
 * ROUTE-INTENT CORRECTION: a light explicitly controlled by a switch is
 * wired switch->light, not source->light -- modeling it as an independent
 * A->C/A->D/A->E star alongside A->B ignores the homeowner's own stated
 * intent and asks Route Assist to evidence a path (source directly to the
 * light) that was never the intended route. Each DESTINATION marker's own
 * controlledBySwitchLabel decides its REAL sourceLabel for evaluation
 * purposes; everything else keeps the ordinary star topology from the
 * ultimate source. A controlledBySwitchLabel that does not resolve to a
 * real, distinct SWITCH marker in this workspace is never honored -- it
 * falls back to the star topology rather than guessing. This function
 * itself makes NO claim about wiring order between multiple lights that
 * share one switch (C, D, E all controlled by B are each their own
 * B->light leg) -- concealed cable order between them is never inferred.
 */
export function deriveRouteAssistWorkspaceLegIntentsV1(markers: readonly RouteAssistWorkspaceMarkerV1[]): RouteAssistWorkspaceLegIntentV1[] {
  const source = markers.find((marker) => marker.role === "SOURCE");
  if (!source) return [];
  const byLabel = new Map(markers.map((marker) => [marker.label, marker]));
  const destinations = markers.filter((marker) => marker.role === "DESTINATION");
  return destinations.map((destination) => {
    const controllingMarker = destination.controlledBySwitchLabel ? byLabel.get(destination.controlledBySwitchLabel) : undefined;
    const isDownstreamOfSwitch = Boolean(controllingMarker && controllingMarker.markerType === "SWITCH" && controllingMarker.label !== destination.label);
    const sourceLabel = isDownstreamOfSwitch ? controllingMarker!.label : source.label;
    return { legScopeId: `leg-${sourceLabel}-${destination.label}`, sourceLabel, destinationLabel: destination.label, isDownstreamOfSwitch };
  });
}

// --- Route evidence: which visible support path a leg follows --------------

/**
 * ROUTE EVIDENCE CORRECTION: derives the smallest deterministic support-
 * path representation (captureEscalation.ts's RouteAssistSupportPathKindV1)
 * from the two devices' OWN homeowner-declared types -- never a concealed-
 * wiring inference, only "what kind of fixture sits at each end, which
 * tells us which visible path the route follows." A ceiling light means
 * the visible path ends at the ceiling (baseboard is irrelevant); a wall
 * light means a wall-to-ceiling-adjacent transition; two low-mounted
 * devices (outlet/switch/surface box) means the ordinary lower-wall/
 * baseboard run; anything else defaults to a plain wall run with no
 * baseboard requirement either.
 */
export function deriveRouteAssistSupportPathKindV1(args: { sourceMarkerType: RouteAssistDestinationType; destinationMarkerType: RouteAssistDestinationType }): RouteAssistSupportPathKindV1 {
  if (args.destinationMarkerType === "CEILING_LIGHT") return "CEILING";
  if (args.destinationMarkerType === "WALL_LIGHT") return "WALL_CEILING_TRANSITION";
  const lowMounted: ReadonlySet<RouteAssistDestinationType> = new Set(["RECEPTACLE", "SWITCH", "SURFACE_BOX"]);
  if (lowMounted.has(args.sourceMarkerType) && lowMounted.has(args.destinationMarkerType)) return "LOWER_WALL_OR_BASEBOARD";
  return "WALL";
}

// --- Leg evaluation over the workspace --------------------------------------

/** legScopeId as seen by ONE frame's own local contribution to a leg whose two markers are not both primarily supported by the same frame. */
export function routeAssistFrameScopedLegIdV1(legScopeId: string, imageId: string): string {
  return `${legScopeId}@${imageId}`;
}

export type RouteAssistWorkspaceLegEvaluationV1 =
  | { outcome: "CAPTURE_INCOMPLETE" }
  | { outcome: "NO_SUPPORTING_FRAME"; label: string }
  | { outcome: "EVALUATED"; result: RouteAssistCaptureEscalationResultV1; supportPathKind: RouteAssistSupportPathKindV1; sourceFrameImageId: string; destinationFrameImageId: string };

/**
 * Where a leg's two endpoints project into each other's PRIMARY supporting
 * frame -- the caller uses this to decide which frame(s) actually need
 * interpreting and with what synthetic anchor coordinates, before calling
 * evaluateRouteAssistWorkspaceLegV1 below (which only reads facts the
 * caller has already applied). When both markers share one primary
 * supporting frame, there is exactly one contribution, using each marker's
 * real local position. When they don't, there are two: each endpoint
 * frame's own real anchor for the marker it actually supports, and a
 * PROJECTED position (workspaceToFrameLocalV1) for the other marker,
 * clamped to that frame's nearest edge when the projection falls outside
 * [0,1] -- i.e. genuinely not visible in that frame. This is strictly more
 * accurate than an arbitrary edge guess: registration is real geometry, so
 * a marker that IS visible (even partially) in a non-primary frame
 * projects to a real, usable in-range position.
 */
export function deriveRouteAssistWorkspaceLegFrameContributionsV1(args: {
  workspace: RouteAssistStitchedWorkspaceV1;
  legScopeId: string;
  sourceMarker: { wx: number; wy: number };
  destinationMarker: { wx: number; wy: number };
}): Array<{ imageId: string; legScopeId: string; sourceLocal: { x: number; y: number }; destinationLocal: { x: number; y: number } }> {
  const sourceFrame = primarySupportingFrameForWorkspacePointV1(args.workspace, args.sourceMarker);
  const destinationFrame = primarySupportingFrameForWorkspacePointV1(args.workspace, args.destinationMarker);
  if (!sourceFrame || !destinationFrame) return [];

  if (sourceFrame.imageId === destinationFrame.imageId) {
    return [{ imageId: sourceFrame.imageId, legScopeId: args.legScopeId, sourceLocal: workspaceToFrameLocalV1(sourceFrame, args.sourceMarker), destinationLocal: workspaceToFrameLocalV1(sourceFrame, args.destinationMarker) }];
  }

  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const projectedOnSource = workspaceToFrameLocalV1(sourceFrame, args.destinationMarker);
  const projectedOnDestination = workspaceToFrameLocalV1(destinationFrame, args.sourceMarker);
  return [
    {
      imageId: sourceFrame.imageId,
      legScopeId: routeAssistFrameScopedLegIdV1(args.legScopeId, sourceFrame.imageId),
      sourceLocal: workspaceToFrameLocalV1(sourceFrame, args.sourceMarker),
      destinationLocal: { x: clamp01(projectedOnSource.x), y: clamp01(projectedOnSource.y) },
    },
    {
      imageId: destinationFrame.imageId,
      legScopeId: routeAssistFrameScopedLegIdV1(args.legScopeId, destinationFrame.imageId),
      sourceLocal: { x: clamp01(projectedOnDestination.x), y: clamp01(projectedOnDestination.y) },
      destinationLocal: workspaceToFrameLocalV1(destinationFrame, args.destinationMarker),
    },
  ];
}

const ESCALATION_SEVERITY_RANK_V1 = ["PHOTO_SUFFICIENT", "WORLD_GEOMETRY_REQUIRED", "GUIDED_CONTINUATION_REQUIRED", "TARGETED_PHOTO_REQUIRED", "REVIEW_REQUIRED", "SWEEP_REQUIRED"] as const;

function worseEscalationV1(a: RouteAssistCaptureEscalationResultV1, b: RouteAssistCaptureEscalationResultV1): RouteAssistCaptureEscalationResultV1 {
  const rankA = ESCALATION_SEVERITY_RANK_V1.indexOf(a.escalation);
  const rankB = ESCALATION_SEVERITY_RANK_V1.indexOf(b.escalation);
  if (rankA === rankB) return { ...a, missingFactTypes: [...new Set([...a.missingFactTypes, ...b.missingFactTypes])] };
  return rankA > rankB ? a : b;
}

/**
 * The CAPTURE COMPLETENESS / ROUTE EVALUATION boundary, now over the
 * stitched workspace and canonical (workspace-coordinate) markers rather
 * than frame-scoped ones. Refuses outright (CAPTURE_INCOMPLETE) while
 * workspace.captureComplete is false, no matter what facts already exist.
 * NO_SUPPORTING_FRAME means a marker's workspace position does not fall
 * within any captured frame's bounds -- it should be structurally
 * impossible to place a marker there in the first place, but this function
 * still refuses rather than evaluating against nothing.
 *
 * Reads whatever facts the caller already applied at each frame-scoped
 * legScopeId deriveRouteAssistWorkspaceLegFrameContributionsV1 named (see
 * that function). One contribution: delegates directly to
 * evaluateRouteAssistPhotoEscalationV1, passing the derived supportPathKind
 * -- exactly the single-photo path, unchanged. Two contributions (a
 * genuinely cross-frame leg): evaluates each independently under its own
 * scope and returns the WORSE (most escalated) of the two -- connectivity
 * itself needs no separate re-check here, because the workspace's own
 * registration already guarantees every frame in it is validly connected
 * to its neighbor (addRouteAssistStitchedWorkspaceFrameV1 refuses anything
 * that isn't, before it ever becomes part of the workspace).
 */
export function evaluateRouteAssistWorkspaceLegV1(args: {
  workspace: RouteAssistStitchedWorkspaceV1;
  store: RouteAssistFactStoreV1;
  legScopeId: string;
  sourceScopeId: string;
  destinationScopeId: string;
  sourceMarker: { wx: number; wy: number; markerType: RouteAssistDestinationType };
  destinationMarker: { wx: number; wy: number; markerType: RouteAssistDestinationType };
}): RouteAssistWorkspaceLegEvaluationV1 {
  if (!args.workspace.captureComplete) return { outcome: "CAPTURE_INCOMPLETE" };

  const sourceFrame = primarySupportingFrameForWorkspacePointV1(args.workspace, args.sourceMarker);
  const destinationFrame = primarySupportingFrameForWorkspacePointV1(args.workspace, args.destinationMarker);
  if (!sourceFrame) return { outcome: "NO_SUPPORTING_FRAME", label: args.sourceScopeId };
  if (!destinationFrame) return { outcome: "NO_SUPPORTING_FRAME", label: args.destinationScopeId };

  const supportPathKind = deriveRouteAssistSupportPathKindV1({ sourceMarkerType: args.sourceMarker.markerType, destinationMarkerType: args.destinationMarker.markerType });

  if (sourceFrame.imageId === destinationFrame.imageId) {
    const result = evaluateRouteAssistPhotoEscalationV1({ store: args.store, legScopeId: args.legScopeId, sourceScopeId: args.sourceScopeId, destinationScopeId: args.destinationScopeId, supportPathKind });
    return { outcome: "EVALUATED", result, supportPathKind, sourceFrameImageId: sourceFrame.imageId, destinationFrameImageId: destinationFrame.imageId };
  }

  const sourceContribution = evaluateRouteAssistPhotoEscalationV1({
    store: args.store,
    legScopeId: routeAssistFrameScopedLegIdV1(args.legScopeId, sourceFrame.imageId),
    sourceScopeId: args.sourceScopeId,
    destinationScopeId: args.destinationScopeId,
    supportPathKind,
  });
  const destinationContribution = evaluateRouteAssistPhotoEscalationV1({
    store: args.store,
    legScopeId: routeAssistFrameScopedLegIdV1(args.legScopeId, destinationFrame.imageId),
    sourceScopeId: args.sourceScopeId,
    destinationScopeId: args.destinationScopeId,
    supportPathKind,
  });
  return { outcome: "EVALUATED", result: worseEscalationV1(sourceContribution, destinationContribution), supportPathKind, sourceFrameImageId: sourceFrame.imageId, destinationFrameImageId: destinationFrame.imageId };
}
