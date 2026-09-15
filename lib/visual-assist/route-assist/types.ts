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
  RoutePhysicalTurn,
  RoutePointKind,
  RouteSurface,
} from "./taxonomy";

export type RoutePoint = {
  id: string;
  x: number;
  y: number;
  imageId: string;
  kind: RoutePointKind;
  surface?: RouteSurface | null;
  obstacle?: RouteObstacle | null;
  physicalTurn?: RoutePhysicalTurn | null;
};

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
  /**
   * Optional opaque private-storage identities for capture evidence. These are
   * never public URLs and are meaningful only to server-side authorized media
   * retrieval. Kept separately from imageIds because image identity is domain
   * provenance while mediaRef is storage provenance.
   */
  mediaRefs?: string[];
};

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
  visibleObstacleDetoursCount: number;
  concealedRouteComplexity: RouteComplexity | null;
  suggestedAccessOpeningsMin: number | null;
  suggestedAccessOpeningsMax: number | null;
  needsContractorReview: boolean;
  captureArtifacts: RouteAssistCaptureArtifacts;
  customerNotes: string | null;
  drywallAccessAllowed: boolean | null;
};

export type RouteAssistIncomplete = {
  reason: RouteAssistIncompleteReason;
  recoveryPrompt: string;
  recovery: "RETAKE_PHOTO" | "CONTRACTOR_REVIEW";
};

export type RouteAssistOutcome = RouteAssistResult | RouteAssistIncomplete;

export function isRouteAssistIncomplete(outcome: RouteAssistOutcome): outcome is RouteAssistIncomplete {
  return "reason" in outcome;
}

export type RouteAssistCaptureInput = {
  mode: RouteAssistMode;
  destinationType: RouteAssistDestinationType;
  points: RoutePoint[];
  segments: RouteSegment[];
  drywallAccessAllowed: boolean | null;
  captureArtifacts: RouteAssistCaptureArtifacts;
  customerNotes?: string | null;
};

export type RouteAssistConfirmation = {
  decision: RouteAssistConfirmationDecision;
  decidedAt: string;
};
