import { applyConfirmation } from "./confirmation";
import { buildRouteAssistResult } from "./result";
import type { AcceptedRouteAssistScanGraphV1 } from "./scanCandidateAcceptance";
import type { RouteAssistConfirmationDecision } from "./taxonomy";
import type {
  RouteAssistCaptureArtifacts,
  RouteAssistDestinationType,
  RouteAssistMode,
  RouteAssistOutcome,
} from "./types";
import { isRouteAssistIncomplete } from "./types";

export type FinalizeAcceptedScanRouteInputV1 = {
  graph: AcceptedRouteAssistScanGraphV1;
  mode: RouteAssistMode;
  destinationType: RouteAssistDestinationType;
  drywallAccessAllowed: boolean | null;
  captureArtifacts: RouteAssistCaptureArtifacts;
  customerNotes?: string | null;
  routeReviewDecision: RouteAssistConfirmationDecision;
};

/**
 * Re-enter the normal Route Assist result builder after scan candidates have
 * already crossed the explicit atomic acceptance boundary.
 *
 * This function owns no CV, measurement, Routing V2, material, labor or price
 * logic. It simply rebuilds the canonical RouteAssistResult from the accepted
 * graph, then applies the existing whole-route homeowner confirmation rule.
 *
 * The accepted graph is never mutated. ADJUSTED/RETAKE remain unconfirmed and
 * contractor-review-required exactly as confirmation.ts already specifies.
 */
export function finalizeAcceptedScanRouteV1(
  input: FinalizeAcceptedScanRouteInputV1,
): RouteAssistOutcome {
  const built = buildRouteAssistResult({
    mode: input.mode,
    destinationType: input.destinationType,
    points: input.graph.points.map((point) => ({ ...point })),
    segments: input.graph.segments.map((segment) => ({ ...segment })),
    drywallAccessAllowed: input.drywallAccessAllowed,
    captureArtifacts: {
      imageIds: [...input.captureArtifacts.imageIds],
      overlayImageIds: [...input.captureArtifacts.overlayImageIds],
    },
    customerNotes: input.customerNotes ?? null,
  });

  if (isRouteAssistIncomplete(built)) return built;
  return applyConfirmation(built, input.routeReviewDecision);
}
