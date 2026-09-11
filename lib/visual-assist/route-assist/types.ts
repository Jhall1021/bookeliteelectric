/**
 * Route Assist's domain types.
 *
 * `RouteAssistResult` is the brief's illustrative model (§7), adapted in two
 * places — see docs/design/route-assist-v1.md §3 for why:
 *   - `RoutePoint.obstacle` is new, so doorway/window bypass counts are a
 *     count of what the customer tagged, not a guess.
 *   - `RouteSegment.estimatedLengthFt` is customer/contractor-entered, not
 *     inferred from pixels — Phase 1 has no scale reference.
 *
 * Everything here is a plain data shape. No function in this file reads a
 * database, calls a provider, or computes anything — that's geometry.ts,
 * complexity.ts and result.ts.
 */

import type {
  RouteAssistConfirmationDecision,
  RouteAssistDestinationType,
  RouteAssistIncompleteReason,
  RouteAssistMode,
  RouteComplexity,
  RouteObstacle,
  RoutePointKind,
  RouteSurface,
} from "./taxonomy";

/**
 * A point the customer placed on a captured photo.
 *
 * `x`/`y` are normalized 0..1 image-space coordinates (not pixels), so a
 * point is meaningful regardless of the photo's stored resolution.
 * `imageId` lets a route span more than one photo (§9 Step 1 — "multiple
 * images if one angle cannot show the entire route").
 */
export type RoutePoint = {
  id: string;
  x: number;
  y: number;
  imageId: string;
  kind: RoutePointKind;
  surface?: RouteSurface | null;
  /** Set only on a WAYPOINT the customer tagged as routing around this. */
  obstacle?: RouteObstacle | null;
};

/**
 * One leg of the route, between two points already in `points`.
 *
 * `transitionAtEnd: true` means the surface changes between this segment and
 * the next one sharing `toPointId` — e.g. this segment is WALL and the next
 * is CEILING. Left `null`/unset when there's no next segment (the last leg)
 * or the customer hasn't tagged either segment's surface.
 */
export type RouteSegment = {
  id: string;
  fromPointId: string;
  toPointId: string;
  surface?: RouteSurface | null;
  /** Customer/contractor estimate for this leg alone. Never inferred. */
  estimatedLengthFt?: number | null;
  transitionAtEnd?: boolean | null;
};

/** Photos and any rendered route overlays kept with the result. */
export type RouteAssistCaptureArtifacts = {
  imageIds: string[];
  overlayImageIds: string[];
};

/**
 * A completed, confirmable Route Assist result.
 *
 * `needsContractorReview` is always present and is never inferred by the
 * reader — see result.ts for the one function allowed to set it, and
 * invariants.ts #5 for the structural rule tying it to
 * `customerConfirmedRoute`.
 */
export type RouteAssistResult = {
  mode: RouteAssistMode;
  destinationType: RouteAssistDestinationType;

  points: RoutePoint[];
  segments: RouteSegment[];

  customerConfirmedRoute: boolean;

  estimatedTotalRouteLengthFt: number | null;

  sameWall: boolean | null;

  wallTransitionsCount: number;
  insideCornersCount: number;
  outsideCornersCount: number;

  doorwayBypassesCount: number;
  windowBypassesCount: number;

  verticalTransitionsCount: number;
  wallToCeilingTransitionsCount: number;
  wallToFloorTransitionsCount: number;

  /** Any waypoint with no `obstacle` tag but that is still a direction
   * change not otherwise classified as a surface transition or an inside/
   * outside corner — kept honest as its own bucket rather than folded into
   * "corner," since a detour around something unnamed is a different fact
   * than a corner. */
  visibleObstacleDetoursCount: number;

  concealedRouteComplexity: RouteComplexity | null;

  suggestedAccessOpeningsMin: number | null;
  suggestedAccessOpeningsMax: number | null;

  needsContractorReview: boolean;

  captureArtifacts: RouteAssistCaptureArtifacts;

  customerNotes: string | null;

  /** §8: only meaningful when `mode` is CONCEALED. Carried onto the result
   * (not just the capture input) because the contractor-facing summary
   * (§13) states it directly. */
  drywallAccessAllowed: boolean | null;
};

/**
 * §22 of the brief. The only other thing `buildRouteAssistResult` can
 * return. Never partially filled in alongside a result — it's one or the
 * other.
 */
export type RouteAssistIncomplete = {
  reason: RouteAssistIncompleteReason;
  /** Homeowner-facing recovery copy — see uncertainty.ts. */
  recoveryPrompt: string;
  /** Whether recovery is another photo or straight to contractor review. */
  recovery: "RETAKE_PHOTO" | "CONTRACTOR_REVIEW";
};

export type RouteAssistOutcome = RouteAssistResult | RouteAssistIncomplete;

export function isRouteAssistIncomplete(
  outcome: RouteAssistOutcome
): outcome is RouteAssistIncomplete {
  return "reason" in outcome;
}

/**
 * What `buildRouteAssistResult` (result.ts) takes as input — the raw
 * customer-placed geometry plus the two questions asked up front (§8).
 */
export type RouteAssistCaptureInput = {
  mode: RouteAssistMode;
  destinationType: RouteAssistDestinationType;
  points: RoutePoint[];
  segments: RouteSegment[];
  /** §8: only meaningful when mode is CONCEALED. */
  drywallAccessAllowed: boolean | null;
  captureArtifacts: RouteAssistCaptureArtifacts;
  customerNotes?: string | null;
};

/** §11's confirmation step, recorded. Mirrors ../confirmation.ts's shape. */
export type RouteAssistConfirmation = {
  decision: RouteAssistConfirmationDecision;
  decidedAt: string;
};
