/**
 * Declarative registry: which (service slug, question key) pairs have an
 * optional Route Assist measurement path, and how a completed
 * `RouteAssistResult` resolves to one of that question's EXISTING
 * `AnswerOption` values — never a new one, never a computed price.
 *
 * The point of this file existing at all is keeping that mapping out of
 * `GuidedFlowEngine`/`QuestionStep`, which stay unaware Route Assist exists.
 * A second service is a second entry here, not a second conditional
 * somewhere in the rendering tree. Deliberately not a framework: no config
 * loader, no schema, no per-question DB field — a plain object literal is
 * enough for one entry, and the moment a second one arrives is the moment
 * to notice if this shape needs to grow, not before.
 *
 * `new-120v-outlet` / `outlet_run_distance` — prisma/seed-new-outlet.ts:
 * "Less than 10 feet" (under_10) / "10 to 20 feet" (10_to_20) / "More than
 * 20 feet" (over_20). Those three literal values are the entire contract
 * with the tree; this file never invents a fourth.
 */

import type { RouteAssistDestinationType } from "./taxonomy";
import type { RouteAssistResult } from "./types";

export type RouteAssistQuestionInvocation = {
  /**
   * Stable per-question key for the `GuidedFlowVisualAssistTask` this
   * invocation creates. Scopes "is there already a task for THIS
   * question" so a reload, resume, or repeated click never creates a
   * duplicate — see RouteAssistWithHandoff's taskKey-scoped lookup.
   */
  taskKey: string;
  destinationType: RouteAssistDestinationType;
  sourceHint: string;
  destinationHint: string;
  actionLabel: string;
  /**
   * A completed `RouteAssistResult` -> the existing `AnswerOption.value` it
   * resolves to, or `null` when the result isn't trustworthy enough to
   * auto-answer (no usable measurement, or Route Assist itself flagged the
   * capture for review). `null` means: persist the result for contractor
   * context, but send the homeowner back to the plain question — never
   * fabricate an answer.
   */
  resolveAnswerValue: (result: RouteAssistResult) => string | null;
};

/**
 * The exact three distance bands `outlet_run_distance` already has. A
 * result that isn't confirmed, or that Route Assist itself flagged for
 * review, is not "sufficiently trustworthy to auto-answer" regardless of
 * what `estimatedTotalRouteLengthFt` says — checked explicitly here (not
 * left to fall out of the domain's own confirm/review coupling) so this
 * reads as a decision this integration makes, not a side effect.
 *
 * `needsContractorReview` and `concealedRouteComplexity` never override the
 * distance band the measurement itself supports: an under-20 measurement
 * flagged for review returns `null` (falls back to manual) rather than
 * being pushed onto "More than 20 feet" — overloading that answer with a
 * second meaning would corrupt what it means to the tree.
 */
function resolveOutletRunDistance(result: RouteAssistResult): string | null {
  if (!result.customerConfirmedRoute || result.needsContractorReview) return null;

  const ft = result.estimatedTotalRouteLengthFt;
  if (ft === null) return null;

  if (ft < 10) return "under_10";
  if (ft <= 20) return "10_to_20";
  return "over_20";
}

const REGISTRY: Record<string, Record<string, RouteAssistQuestionInvocation>> = {
  "new-120v-outlet": {
    outlet_run_distance: {
      taskKey: "outlet_run_distance",
      destinationType: "RECEPTACLE",
      sourceHint: "Tap the existing outlet or panel you'd run the power from.",
      destinationHint: "Tap where you'd like the new outlet.",
      actionLabel: "Not sure? Measure the route with your phone.",
      resolveAnswerValue: resolveOutletRunDistance,
    },
  },
};

/** `null` when this (service, question) pair has no Route Assist path — the only thing a caller needs to check. */
export function getRouteAssistInvocation(
  serviceSlug: string,
  questionKey: string
): RouteAssistQuestionInvocation | null {
  return REGISTRY[serviceSlug]?.[questionKey] ?? null;
}
