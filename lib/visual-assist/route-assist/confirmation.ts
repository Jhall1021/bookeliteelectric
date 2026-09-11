/**
 * §11 of the brief — the customer's response to the route overlay. Mirrors
 * ../confirmation.ts's shape (a decision, an audit record) at the
 * whole-route grain instead of per-field, since Route Assist confirms one
 * route, not a set of independently-scored fields.
 *
 * `needsContractorReview` is decided in exactly one place: here. `result.ts`
 * always builds a fresh result with `customerConfirmedRoute: false,
 * needsContractorReview: true` — nothing is "clear" before the customer has
 * seen it. This function is what can lower that flag, and only on ACCEPTED,
 * and only when the route's own complexity doesn't independently require a
 * human look.
 */

import type { RouteAssistConfirmationDecision } from "./taxonomy";
import type { RouteAssistConfirmation, RouteAssistResult } from "./types";

export function applyConfirmation(
  result: RouteAssistResult,
  decision: RouteAssistConfirmationDecision
): RouteAssistResult {
  if (decision === "ACCEPTED") {
    const complexityRequiresReview =
      result.mode === "CONCEALED" &&
      (result.concealedRouteComplexity === "COMPLEX" || result.concealedRouteComplexity === "UNCERTAIN");
    return { ...result, customerConfirmedRoute: true, needsContractorReview: complexityRequiresReview };
  }
  // ADJUSTED and RETAKE both mean "not this yet" — the caller sends the
  // customer back into capture. Recorded as unconfirmed either way; which
  // one happened is in the audit record (decisionRecord), not on the result
  // itself, since the result only needs to say whether it can be trusted.
  return { ...result, customerConfirmedRoute: false, needsContractorReview: true };
}

export function decisionRecord(decision: RouteAssistConfirmationDecision): RouteAssistConfirmation {
  return { decision, decidedAt: new Date().toISOString() };
}
