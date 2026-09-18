/**
 * Declarative registry for optional Route Assist experiences inside existing
 * Guided Pricing questions.
 *
 * This file can resolve only to an EXISTING answer value or capture evidence
 * without answering anything. It never computes a price and never changes the
 * authored tree.
 */

import type {
  RouteAssistCaptureKind,
  RouteAssistDestinationType,
} from "./taxonomy";
import type { RouteAssistResult } from "./types";

export type RouteAssistCompletionMode = "RESOLVE_QUESTION" | "CAPTURE_ONLY";

export type RouteAssistQuestionInvocation = {
  taskKey: string;
  destinationType: RouteAssistDestinationType;
  sourceHint: string;
  destinationHint: string;
  actionLabel: string;
  captureKind?: RouteAssistCaptureKind;
  placementHint?: string;
  minPlacements?: number;
  maxPlacements?: number;
  completionMode?: RouteAssistCompletionMode;
  /** Prior authored answers decide whether Route Assist is appropriate. */
  isEligible?: (answers: Record<string, string>) => boolean;
  /** Existing answer value, or null when capture must not answer this question. */
  resolveAnswerValue: (result: RouteAssistResult) => string | null;
};

function resolveOutletRunDistance(result: RouteAssistResult): string | null {
  if (!result.customerConfirmedRoute || result.needsContractorReview) return null;
  const ft = result.estimatedTotalRouteLengthFt;
  if (ft === null) return null;
  if (ft < 10) return "under_10";
  if (ft <= 20) return "10_to_20";
  return "over_20";
}

/** Fixture count comes from homeowner placement intent, not inferred wiring topology. */
function resolveRecessedLightCount(result: RouteAssistResult): string | null {
  if (!result.customerConfirmedRoute || result.captureKind !== "PLACEMENT_LAYOUT") return null;
  const count = (result.placements ?? []).filter(
    (placement) => placement.destinationType === "RECESSED_LIGHT"
  ).length;
  if (!Number.isInteger(count) || count < 1 || count > 8) return null;
  return String(count);
}

const finishedCeilingOnly = (answers: Record<string, string>) => answers.ceiling_access === "finished";
const noAccessibleOutletRoute = (answers: Record<string, string>) => answers.below_above_access === "no_access";

const CAPTURE_ONLY = () => null;

const REGISTRY: Record<string, Record<string, RouteAssistQuestionInvocation>> = {
  "new-120v-outlet": {
    outlet_run_distance: {
      taskKey: "outlet_run_distance",
      destinationType: "RECEPTACLE",
      sourceHint: "Tap the existing outlet or panel you'd run the power from.",
      destinationHint: "Tap where you'd like the new outlet.",
      actionLabel: "Show us the route with your phone",
      captureKind: "ROUTE",
      isEligible: noAccessibleOutletRoute,
      resolveAnswerValue: resolveOutletRunDistance,
    },
  },

  "recessed-lighting": {
    recessed_light_count: {
      taskKey: "recessed_light_layout",
      destinationType: "RECESSED_LIGHT",
      sourceHint:
        "Tap the existing switch or light you'd like us to use as the starting reference. If the control will be new, tap where you'd like that control to be.",
      destinationHint: "Tap the ceiling where you want each recessed light.",
      placementHint:
        "Tap the ceiling where you want the first light, then add the rest. These dots show placement only — they do not assume how the electrician will wire between them.",
      actionLabel: "Place the lights with your phone",
      captureKind: "PLACEMENT_LAYOUT",
      minPlacements: 1,
      maxPlacements: 8,
      isEligible: finishedCeilingOnly,
      completionMode: "RESOLVE_QUESTION",
      resolveAnswerValue: resolveRecessedLightCount,
    },
  },

  "new-ceiling-light": {
    lighting_control: {
      taskKey: "new_ceiling_light_layout",
      destinationType: "CEILING_LIGHT",
      sourceHint:
        "If there's an existing switch or light you want us to start from, tap it. Otherwise tap where you'd like the new control to be.",
      destinationHint: "Tap the ceiling where you want the new light fixture.",
      placementHint: "Tap the exact ceiling location where you want the new light fixture.",
      actionLabel: "Mark the new light location with your phone",
      captureKind: "PLACEMENT_LAYOUT",
      minPlacements: 1,
      maxPlacements: 1,
      isEligible: finishedCeilingOnly,
      completionMode: "CAPTURE_ONLY",
      resolveAnswerValue: CAPTURE_ONLY,
    },
  },

  "new-ceiling-fan": {
    lighting_control: {
      taskKey: "new_ceiling_fan_layout",
      destinationType: "CEILING_FAN",
      sourceHint:
        "If there's an existing switch or light you want us to start from, tap it. Otherwise tap where you'd like the new control to be.",
      destinationHint: "Tap the ceiling where you want the new fan.",
      placementHint: "Tap the exact ceiling location where you want the new fan.",
      actionLabel: "Mark the new fan location with your phone",
      captureKind: "PLACEMENT_LAYOUT",
      minPlacements: 1,
      maxPlacements: 1,
      isEligible: finishedCeilingOnly,
      completionMode: "CAPTURE_ONLY",
      resolveAnswerValue: CAPTURE_ONLY,
    },
  },
};

/** Eligibility is evaluated from answers the existing tree already collected. */
export function getRouteAssistInvocation(
  serviceSlug: string,
  questionKey: string,
  answers: Record<string, string> = {}
): RouteAssistQuestionInvocation | null {
  const invocation = REGISTRY[serviceSlug]?.[questionKey] ?? null;
  if (!invocation) return null;
  if (invocation.isEligible && !invocation.isEligible(answers)) return null;
  return invocation;
}

/**
 * Phone-handoff recovery. Task creation already proved eligibility, so the
 * opaque task key is enough to recover the same capture configuration on the
 * second device without re-running tree semantics there.
 */
export function getRouteAssistInvocationByTaskKey(
  serviceSlug: string,
  taskKey: string | null | undefined
): RouteAssistQuestionInvocation | null {
  if (!taskKey) return null;
  return Object.values(REGISTRY[serviceSlug] ?? {}).find((invocation) => invocation.taskKey === taskKey) ?? null;
}
