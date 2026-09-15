/**
 * Whole-capture confirmation.
 *
 * A ROUTE capture confirms a proposed wiring path and therefore still applies
 * concealed-route complexity review. A PLACEMENT_LAYOUT confirms only where
 * the homeowner wants fixtures/devices; it makes no claim about the eventual
 * wiring topology, so route complexity cannot invalidate the placement itself.
 */

import type { RouteAssistConfirmationDecision } from "./taxonomy";
import type { RouteAssistConfirmation, RouteAssistResult } from "./types";

export function applyConfirmation(
  result: RouteAssistResult,
  decision: RouteAssistConfirmationDecision
): RouteAssistResult {
  if (decision === "ACCEPTED") {
    if (result.captureKind === "PLACEMENT_LAYOUT") {
      return { ...result, customerConfirmedRoute: true, needsContractorReview: false };
    }

    const complexityRequiresReview =
      result.mode === "CONCEALED" &&
      (result.concealedRouteComplexity === "COMPLEX" || result.concealedRouteComplexity === "UNCERTAIN");
    return { ...result, customerConfirmedRoute: true, needsContractorReview: complexityRequiresReview };
  }

  return { ...result, customerConfirmedRoute: false, needsContractorReview: true };
}

export function decisionRecord(decision: RouteAssistConfirmationDecision): RouteAssistConfirmation {
  return { decision, decidedAt: new Date().toISOString() };
}
