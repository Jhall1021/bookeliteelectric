import { isTrimHuggingDoorwayBypassV1, type RouteAssistTrimBoundaryV1 } from "./surfaceRacewayRoutingPreference";
import { validateRouteAssistVisibleSceneSemanticsV1, type RouteAssistVisibleSceneObjectV1, type RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";
import type { RoutePoint, RouteSegment } from "./types";

export type RouteAssistVisibleTrimRouteStepV1 = {
  kind: "SOURCE" | "BASEBOARD" | "DOOR_SIDE_UP" | "DOOR_TOP" | "DOOR_SIDE_DOWN" | "DESTINATION";
  objectId: string;
  imageId: string;
};

export type RouteAssistVisibleTrimRouteProposalV1 = {
  version: 1;
  status: "REVIEW_REQUIRED" | "INSUFFICIENT_VISIBLE_EVIDENCE";
  steps: RouteAssistVisibleTrimRouteStepV1[];
  /** Presentation/review boundaries only; no fitting counts are implied. */
  trimBoundaries: RouteAssistTrimBoundaryV1[];
  requiresHomeownerReview: true;
  problems: string[];
};

/**
 * Whether this proposal found a doorway on the source->destination route and,
 * if so, which casing the traversal reaches first — the one durable fact a
 * later review round must not silently contradict.
 *
 * Derived from trimBoundaries rather than object ids on purpose: every field
 * of proposeVisibleTrimHuggingRouteV1's args comes from a FRESH provider call
 * each time this function runs (see visibleSceneReviewPipeline.ts), so a
 * scene object's `id` has no reason to be the same string across two separate
 * calls even when the physical scene hasn't changed. trimBoundaries is
 * already the semantic, id-independent summary this function produces, so
 * comparing on it (rather than inventing a second summary) is the smallest
 * way to get an id-independent signature.
 */
export type RouteAssistDoorwayTopologySignatureV1 = { hasDoorway: boolean; entrySide: "LEFT" | "RIGHT" | null };

export function routeAssistDoorwayTopologySignatureV1(
  proposal: Pick<RouteAssistVisibleTrimRouteProposalV1, "status" | "trimBoundaries">,
): RouteAssistDoorwayTopologySignatureV1 {
  if (proposal.status !== "REVIEW_REQUIRED") return { hasDoorway: false, entrySide: null };
  if (proposal.trimBoundaries[1] === "DOOR_CASING_LEFT") return { hasDoorway: true, entrySide: "LEFT" };
  if (proposal.trimBoundaries[1] === "DOOR_CASING_RIGHT") return { hasDoorway: true, entrySide: "RIGHT" };
  return { hasDoorway: false, entrySide: null };
}

function doorwayTopologyDriftedV1(
  previous: RouteAssistDoorwayTopologySignatureV1,
  next: RouteAssistDoorwayTopologySignatureV1,
): boolean {
  return previous.hasDoorway !== next.hasDoorway || previous.entrySide !== next.entrySide;
}

function byPrimaryCaptureOrder(captureImageIds: string[], objects: RouteAssistVisibleSceneObjectV1[]): RouteAssistVisibleSceneObjectV1[] {
  const order = new Map(captureImageIds.map((id, index) => [id, index]));
  return objects
    .filter((object) => order.has(object.imageId))
    .sort((a, b) => order.get(a.imageId)! - order.get(b.imageId)! || a.id.localeCompare(b.id));
}

/**
 * Build a conservative homeowner-review proposal from already validated visible
 * scene semantics. This is not a graph mutation and does not establish footage,
 * physical turns, fittings, material quantities, labor, or price.
 *
 * Source/destination/baseboard/doorway ordering comes ONLY from the primary
 * ordered sweep. Objects detected in the SAME frame have no cross-object route
 * order: object ids and image-space x/y are never used as room topology.
 * Supplemental recapture objects may complete a coherent doorway group (for
 * example, a missing casing/top-trim view) but their image order is never used
 * as route order or room adjacency.
 */
export function proposeVisibleTrimHuggingRouteV1(args: {
  semantics: RouteAssistVisibleSceneSemanticsV1;
  expectedCaptureImageIds: readonly string[];
  authorizedSupplementalImageIds?: readonly string[];
  points: readonly RoutePoint[];
  segments: readonly RouteSegment[];
  /**
   * The last REVIEW_REQUIRED proposal accepted for this same scan session, if
   * any. Every review round re-runs the provider from scratch over all
   * primary + supplemental evidence (see visibleSceneReviewPipeline.ts), so
   * nothing otherwise stops an unrelated correction/recapture round from
   * quietly returning a different doorway conclusion for the exact same
   * physical doorway. When supplied, a new REVIEW_REQUIRED result whose
   * doorway topology disagrees with this one fails closed instead of silently
   * overwriting an already-accepted fact.
   */
  previousProposal?: Pick<RouteAssistVisibleTrimRouteProposalV1, "status" | "trimBoundaries"> | null;
}): RouteAssistVisibleTrimRouteProposalV1 {
  const problems = validateRouteAssistVisibleSceneSemanticsV1(args);
  if (problems.length) return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems };

  const captureImageIds = [...args.expectedCaptureImageIds];
  const captureOrder = new Map(captureImageIds.map((id, index) => [id, index]));
  const ordered = byPrimaryCaptureOrder(captureImageIds, args.semantics.objects);
  const sources = ordered.filter((object) => object.kind === "SOURCE_RECEPTACLE");
  const destinations = ordered.filter((object) => object.kind === "DESTINATION_MARKER");
  if (sources.length !== 1 || destinations.length !== 1) {
    return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["exactly one visible source and destination anchor are required in the primary sweep"] };
  }
  const source = sources[0];
  const destination = destinations[0];
  const sourceFrameIndex = captureOrder.get(source.imageId);
  const destinationFrameIndex = captureOrder.get(destination.imageId);
  if (sourceFrameIndex === undefined || destinationFrameIndex === undefined) {
    return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["visible source and destination anchors are both required in the primary sweep"] };
  }

  const firstFrame = Math.min(sourceFrameIndex, destinationFrameIndex);
  const lastFrame = Math.max(sourceFrameIndex, destinationFrameIndex);
  const routeWindow = ordered.filter((object) => {
    const index = captureOrder.get(object.imageId);
    return index !== undefined && index >= firstFrame && index <= lastFrame;
  });
  const baseboards = routeWindow.filter((object) => object.kind === "BASEBOARD_OR_TRIM");
  if (!baseboards.length) return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["no visible baseboard or trim continuity between source and destination"] };

  const doorway = routeWindow.find((object) => object.kind === "DOORWAY");
  const steps: RouteAssistVisibleTrimRouteStepV1[] = [{ kind: "SOURCE", objectId: source.id, imageId: source.imageId }];
  const boundaries: RouteAssistTrimBoundaryV1[] = ["BASEBOARD"];
  steps.push({ kind: "BASEBOARD", objectId: baseboards[0].id, imageId: baseboards[0].imageId });

  if (doorway) {
    const groups = (args.semantics.doorwayGroups ?? []).filter((group) => group.doorwayObjectId === doorway.id);
    if (groups.length !== 1) return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["doorway is visible but does not have exactly one coherent doorway group"] };
    const group = groups[0];
    if (group.entrySide === "UNRESOLVED") return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["doorway entry side is unresolved"] };

    const byId = new Map(args.semantics.objects.map((object) => [object.id, object]));
    const left = byId.get(group.leftCasingObjectId)!;
    const top = byId.get(group.topCasingObjectId)!;
    const right = byId.get(group.rightCasingObjectId)!;
    const first = group.entrySide === "LEFT" ? left : right;
    const second = group.entrySide === "LEFT" ? right : left;
    steps.push({ kind: "DOOR_SIDE_UP", objectId: first.id, imageId: first.imageId }, { kind: "DOOR_TOP", objectId: top.id, imageId: top.imageId }, { kind: "DOOR_SIDE_DOWN", objectId: second.id, imageId: second.imageId });
    boundaries.push(group.entrySide === "LEFT" ? "DOOR_CASING_LEFT" : "DOOR_CASING_RIGHT", "DOOR_CASING_TOP", group.entrySide === "LEFT" ? "DOOR_CASING_RIGHT" : "DOOR_CASING_LEFT", "BASEBOARD");
    if (!isTrimHuggingDoorwayBypassV1(boundaries)) return { version: 1, status: "INSUFFICIENT_VISIBLE_EVIDENCE", steps: [], trimBoundaries: [], requiresHomeownerReview: true, problems: ["doorway evidence does not form a trim-hugging bypass"] };
    const afterDoor = baseboards[baseboards.length - 1];
    if (afterDoor.id !== baseboards[0].id) steps.push({ kind: "BASEBOARD", objectId: afterDoor.id, imageId: afterDoor.imageId });
  }

  steps.push({ kind: "DESTINATION", objectId: destination.id, imageId: destination.imageId });
  const result: RouteAssistVisibleTrimRouteProposalV1 = { version: 1, status: "REVIEW_REQUIRED", steps, trimBoundaries: boundaries, requiresHomeownerReview: true, problems: [] };

  if (args.previousProposal) {
    const previousSignature = routeAssistDoorwayTopologySignatureV1(args.previousProposal);
    const nextSignature = routeAssistDoorwayTopologySignatureV1(result);
    if (doorwayTopologyDriftedV1(previousSignature, nextSignature)) {
      return {
        version: 1,
        status: "INSUFFICIENT_VISIBLE_EVIDENCE",
        steps: [],
        trimBoundaries: [],
        requiresHomeownerReview: true,
        problems: ["doorway topology from this review does not match a previously accepted conclusion for this scan; this needs homeowner review rather than silently replacing what was already established"],
      };
    }
  }

  return result;
}
