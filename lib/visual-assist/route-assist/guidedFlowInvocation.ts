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
import { adaptRouteAssistResult } from "../../electrical/routeAssistAdapter";

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

/**
 * ROUTING V2 — measured feet stay measured feet.
 *
 * The V1 resolver above collapses a measurement into `under_10 / 10_to_20 /
 * over_20` because that is what `outlet_run_distance` authored. A Routing V2
 * distance question is a NUMBER whose authored ranges decide what the value
 * MEANS, so banding here would throw away the only thing the tree needs and
 * re-introduce the distance model V2 exists to replace.
 *
 * Everything numeric comes through the adapter, so the integer-only contract
 * and the "nothing is silently dropped" rule are applied in exactly one place.
 * An invalid measurement returns null — persist the capture for the
 * contractor, send the homeowner back to the plain question, never invent.
 *
 * MODE MUST AGREE WITH THE QUESTION. A surface capture may not answer a
 * concealed question and vice versa: they are different physical installs, and
 * letting one answer the other would put a raceway measurement into a
 * fished-wall route.
 */
function measuredFeetFor(
  /**
   * NOT optional, and deliberately has no "any mode" case.
   *
   * `accessible_route_feet` was bound here briefly with no mode constraint.
   * That was an observation-authority error, not a pricing one: an accessible
   * concealed route runs through an attic, crawlspace or unfinished basement,
   * and a camera capture of the ROOM has not observed that path at all. Turning
   * estimated room geometry into known accessible-path footage claims a
   * measurement nobody took.
   *
   * The homeowner still answers that question in the ordinary Guided Pricing
   * UI, and the canonical question and its Routing V2 support are untouched —
   * only the camera auto-answer is gone. If an explicit accessible-path
   * observation is built later, it earns its own separately authorised mapping.
   *
   * Requiring a concrete mode here means re-adding a mode-less binding is a
   * type error rather than a judgement call somebody has to remember.
   */
  expected: "surface" | "concealed"
): (result: RouteAssistResult) => string | null {
  return (result) => {
    if (!result.customerConfirmedRoute || result.needsContractorReview) return null;
    const { mapped, invalid } = adaptRouteAssistResult(result);
    if (invalid.length > 0) return null;
    if (mapped.installMethod !== expected) return null;
    return mapped.routeLengthFt === null ? null : String(mapped.routeLengthFt);
  };
}

/** Corner counts are already whole counts; the adapter still owns validation. */
function measuredCount(pick: "insideCorners" | "outsideCorners") {
  return (result: RouteAssistResult): string | null => {
    if (!result.customerConfirmedRoute || result.needsContractorReview) return null;
    const { mapped, invalid } = adaptRouteAssistResult(result);
    if (invalid.length > 0) return null;
    if (mapped.installMethod !== "surface") return null;
    const v = mapped[pick];
    return v === null ? null : String(v);
  };
}

/**
 * Routing V2 answer keys, as authored in prisma/_surfaceRouteModule.ts,
 * prisma/_concealedRouteModules.ts and prisma/_finishedWallModule.ts.
 *
 * Written as literals because those modules import PrismaClient and this file
 * is reachable from a "use client" component. scripts/verify-route-assist-v2-
 * adapter.ts asserts every one of them still matches the authoring constant,
 * so a rename there turns a test red rather than silently unbinding capture.
 */
const V2_SURFACE_FEET = "surface_route_feet";
const V2_SURFACE_INSIDE = "surface_inside_corner_count";
const V2_SURFACE_OUTSIDE = "surface_outside_corner_count";
const V2_CONCEALED_FEET = "concealed_route_feet";

const REGISTRY: Record<string, Record<string, RouteAssistQuestionInvocation>> = {
  "new-120v-outlet": {
    /**
     * LEGACY / DEPRECATED COMPATIBILITY — do not remove.
     *
     * Production and every unmigrated tenant still author this question, so
     * this entry is what Route Assist binds to for them. It bands the
     * measurement because that is the contract `outlet_run_distance` has.
     * Routing V2 tenants never reach it: their tree asks the NUMBER questions
     * below instead, so the registry chooses by the AUTHORED question rather
     * than by anything about the tenant.
     */
    outlet_run_distance: {
      taskKey: "outlet_run_distance",
      destinationType: "RECEPTACLE",
      sourceHint: "Tap the existing outlet or panel you'd run the power from.",
      destinationHint: "Tap where you'd like the new outlet.",
      actionLabel: "Not sure? Measure the route with your phone.",
      resolveAnswerValue: resolveOutletRunDistance,
    },

    // ROUTING V2 — the authored NUMBER questions. Measured feet, unbanded.
    [V2_SURFACE_FEET]: {
      taskKey: V2_SURFACE_FEET,
      destinationType: "RECEPTACLE",
      sourceHint: "Tap the existing outlet you'd run the power from.",
      destinationHint: "Tap where you'd like the new outlet.",
      actionLabel: "Not sure? Measure the route with your phone.",
      resolveAnswerValue: measuredFeetFor("surface"),
    },
    [V2_SURFACE_INSIDE]: {
      taskKey: V2_SURFACE_INSIDE,
      destinationType: "RECEPTACLE",
      sourceHint: "Tap the existing outlet you'd run the power from.",
      destinationHint: "Tap where you'd like the new outlet.",
      actionLabel: "Count the inside corners with your phone.",
      resolveAnswerValue: measuredCount("insideCorners"),
    },
    [V2_SURFACE_OUTSIDE]: {
      taskKey: V2_SURFACE_OUTSIDE,
      destinationType: "RECEPTACLE",
      sourceHint: "Tap the existing outlet you'd run the power from.",
      destinationHint: "Tap where you'd like the new outlet.",
      actionLabel: "Count the outside corners with your phone.",
      resolveAnswerValue: measuredCount("outsideCorners"),
    },
    [V2_CONCEALED_FEET]: {
      taskKey: V2_CONCEALED_FEET,
      destinationType: "RECEPTACLE",
      sourceHint: "Tap the existing outlet you'd run the power from.",
      destinationHint: "Tap where you'd like the new outlet.",
      actionLabel: "Not sure? Measure the route with your phone.",
      resolveAnswerValue: measuredFeetFor("concealed"),
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
