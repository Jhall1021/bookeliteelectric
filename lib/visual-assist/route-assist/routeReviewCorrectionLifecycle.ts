import type { RouteAssistReviewCorrectionV1 } from "./routeReviewCorrection";
import type { RouteAssistVisibleOverlayPathV1, RouteAssistVisibleTrimRouteOverlayV1 } from "./visibleTrimRouteOverlay";

export type RouteAssistReviewCorrectionStatusV1 =
  | "SATISFIED_IN_REVISED_PROPOSAL"
  | "UNRESOLVED"
  | "SUPERSEDED";

export type RouteAssistReviewCorrectionResolutionV1 = {
  correctionId: string;
  status: RouteAssistReviewCorrectionStatusV1;
  /** Review explanation only; never physical-fact provenance. */
  reason: string;
};

function distanceToSegment(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function distanceToPath(path: RouteAssistVisibleOverlayPathV1 | undefined, point: { x: number; y: number }): number {
  if (!path?.points.length) return Number.POSITIVE_INFINITY;
  if (path.points.length === 1) return Math.hypot(point.x - path.points[0].x, point.y - path.points[0].y);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.points.length - 1; index++) {
    best = Math.min(best, distanceToSegment(point, path.points[index], path.points[index + 1]));
  }
  return best;
}

function sameAnchorKind(a: RouteAssistReviewCorrectionV1, b: RouteAssistReviewCorrectionV1): boolean {
  return (
    (a.kind === "SOURCE_ANCHOR_WRONG" && b.kind === "SOURCE_ANCHOR_WRONG") ||
    (a.kind === "DESTINATION_ANCHOR_WRONG" && b.kind === "DESTINATION_ANCHOR_WRONG")
  );
}

function isSuperseded(corrections: readonly RouteAssistReviewCorrectionV1[], index: number): boolean {
  const current = corrections[index];
  if (current.kind !== "SOURCE_ANCHOR_WRONG" && current.kind !== "DESTINATION_ANCHOR_WRONG") return false;
  return corrections.slice(index + 1).some((candidate) => sameAnchorKind(current, candidate));
}

/**
 * Compare a revised review overlay with homeowner correction intent.
 *
 * This classifies only whether the *proposal* appears to honor an instruction.
 * It does not validate physical truth, accept Route Assist geometry, establish
 * measurement or obstacle evidence, or bind Routing V2 facts.
 */
export function evaluateRouteAssistReviewCorrectionLifecycleV1(args: {
  corrections: readonly RouteAssistReviewCorrectionV1[];
  revisedOverlay: RouteAssistVisibleTrimRouteOverlayV1 | null;
  passTolerance?: number;
  avoidClearance?: number;
  anchorTolerance?: number;
}): RouteAssistReviewCorrectionResolutionV1[] {
  const passTolerance = args.passTolerance ?? 0.035;
  const avoidClearance = args.avoidClearance ?? 0.06;
  const anchorTolerance = args.anchorTolerance ?? 0.045;

  return args.corrections.map((correction, index) => {
    if (isSuperseded(args.corrections, index)) {
      return { correctionId: correction.correctionId, status: "SUPERSEDED", reason: "a newer correction replaces this anchor instruction" };
    }
    const path = args.revisedOverlay?.paths.find((candidate) => candidate.imageId === correction.imageId);
    if (!path) {
      return { correctionId: correction.correctionId, status: "UNRESOLVED", reason: "the revised proposal has no review path on this captured frame" };
    }

    if (correction.kind === "ROUTE_SHOULD_PASS_HERE") {
      const satisfied = distanceToPath(path, correction.point) <= passTolerance;
      return { correctionId: correction.correctionId, status: satisfied ? "SATISFIED_IN_REVISED_PROPOSAL" : "UNRESOLVED", reason: satisfied ? "the revised proposal passes through the requested review area" : "the revised proposal does not yet pass through the requested review area" };
    }
    if (correction.kind === "ROUTE_SHOULD_AVOID_HERE") {
      const satisfied = distanceToPath(path, correction.point) >= avoidClearance;
      return { correctionId: correction.correctionId, status: satisfied ? "SATISFIED_IN_REVISED_PROPOSAL" : "UNRESOLVED", reason: satisfied ? "the revised proposal clears the requested review area" : "the revised proposal still approaches the requested avoid area" };
    }
    if (correction.kind === "SOURCE_ANCHOR_WRONG") {
      const first = path.points[0];
      const satisfied = Boolean(first) && Math.hypot(first.x - correction.point.x, first.y - correction.point.y) <= anchorTolerance;
      return { correctionId: correction.correctionId, status: satisfied ? "SATISFIED_IN_REVISED_PROPOSAL" : "UNRESOLVED", reason: satisfied ? "the revised proposal starts at the requested review anchor" : "the revised proposal start anchor has not moved to the requested review area" };
    }
    if (correction.kind === "DESTINATION_ANCHOR_WRONG") {
      const last = path.points[path.points.length - 1];
      const satisfied = Boolean(last) && Math.hypot(last.x - correction.point.x, last.y - correction.point.y) <= anchorTolerance;
      return { correctionId: correction.correctionId, status: satisfied ? "SATISFIED_IN_REVISED_PROPOSAL" : "UNRESOLVED", reason: satisfied ? "the revised proposal ends at the requested review anchor" : "the revised proposal destination anchor has not moved to the requested review area" };
    }
    return { correctionId: correction.correctionId, status: "UNRESOLVED", reason: "this correction kind requires explicit homeowner or contractor review" };
  });
}

/** Only unresolved instructions are candidates for another provider revision. */
export function unresolvedRouteAssistReviewCorrectionsV1(args: {
  corrections: readonly RouteAssistReviewCorrectionV1[];
  resolutions: readonly RouteAssistReviewCorrectionResolutionV1[];
}): RouteAssistReviewCorrectionV1[] {
  const unresolved = new Set(args.resolutions.filter((resolution) => resolution.status === "UNRESOLVED").map((resolution) => resolution.correctionId));
  return args.corrections.filter((correction) => unresolved.has(correction.correctionId)).map((correction) => ({ ...correction, point: { ...correction.point } }));
}
