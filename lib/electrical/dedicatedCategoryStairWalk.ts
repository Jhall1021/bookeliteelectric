import {
  stairWalkToDedicatedAnswers,
  type StairWalkResult,
  type SwAnswers,
  type SwMode,
} from "./stairWalk";
import { routeSectionsAnswerKey } from "./mixedRouteSections";
import { DEDICATED_STAIR_ROUTE_KEYS } from "./dedicatedStairRoute";

export type DedicatedCategoryStairWalkSlug =
  | "dedicated-120v-circuit-outlet"
  | "electric-fireplace-circuit"
  | "new-240v-appliance-circuit";

type LegacyProfile = {
  questionKey: "fireplace_route_access" | "appliance_240v_route_access";
  distanceKey: "fireplace_distance" | "appliance_240v_distance";
};

const LEGACY_PROFILES: Record<Exclude<DedicatedCategoryStairWalkSlug, "dedicated-120v-circuit-outlet">, LegacyProfile> = {
  "electric-fireplace-circuit": {
    questionKey: "fireplace_route_access",
    distanceKey: "fireplace_distance",
  },
  "new-240v-appliance-circuit": {
    questionKey: "appliance_240v_route_access",
    distanceKey: "appliance_240v_distance",
  },
};

export function isDedicatedCategoryStairWalkQuestion(serviceSlug: string, questionKey: string): serviceSlug is DedicatedCategoryStairWalkSlug {
  if (serviceSlug === "dedicated-120v-circuit-outlet") return questionKey === "dedicated_route_access";
  if (serviceSlug === "electric-fireplace-circuit" || serviceSlug === "new-240v-appliance-circuit") {
    return questionKey === LEGACY_PROFILES[serviceSlug].questionKey;
  }
  return false;
}

export function dedicatedCategoryStairWalkAccessKey(serviceSlug: DedicatedCategoryStairWalkSlug): string {
  return serviceSlug === "dedicated-120v-circuit-outlet"
    ? "dedicated_route_access"
    : LEGACY_PROFILES[serviceSlug].questionKey;
}

export function dedicatedCategoryStairWalkMarkerKey(serviceSlug: DedicatedCategoryStairWalkSlug): string {
  return serviceSlug === "dedicated-120v-circuit-outlet"
    ? "dedicated_stair_walk"
    : `${serviceSlug}_stair_walk`;
}

function legacyAccessValue(answers: SwAnswers): "unfinished_basement" | "accessible_attic" | "combination" {
  if (answers.openSpace === "attic" || answers.garageAttic === "yes") return "accessible_attic";
  if (answers.panelPlace === "basement" || answers.openSpace === "below") return "unfinished_basement";
  return "combination";
}

function legacyReview(
  serviceSlug: Exclude<DedicatedCategoryStairWalkSlug, "dedicated-120v-circuit-outlet">,
  code: string,
): Record<string, string> {
  const profile = LEGACY_PROFILES[serviceSlug];
  return {
    [profile.questionKey]: "not_accessible_or_unsure",
    [profile.distanceKey]: "over_50_or_unsure",
    [dedicatedCategoryStairWalkMarkerKey(serviceSlug)]: `review:${code}`,
  };
}

/**
 * Translate the shared Stair Walk into the two older dedicated-category
 * service contracts. Those packages currently price only ordinary accessible
 * routes of 50 feet or less. We retain that reviewed boundary: the customer
 * still gets the route drawing, but finished, mixed, multi-floor and longer
 * routes go to the existing photo-review branch instead of being understated.
 */
export function stairWalkToDedicatedCategoryAnswers(
  answers: SwAnswers,
  serviceSlug: DedicatedCategoryStairWalkSlug,
  mode: SwMode = { routeOnly: true },
): StairWalkResult {
  const result = stairWalkToDedicatedAnswers(answers, mode);
  if (serviceSlug === "dedicated-120v-circuit-outlet" || result.kind !== "PRICE_INPUTS") return result;

  const profile = LEGACY_PROFILES[serviceSlug];
  const measured = Number(result.answers.dedicated_distance);
  const routeFeet = Number.isFinite(measured)
    ? measured
    : result.answers.dedicated_distance === "under_25" ? 25
      : result.answers.dedicated_distance === "25_to_50" ? 50
        : 0;
  const hasMixedRoute = Boolean(result.answers[routeSectionsAnswerKey("dedicated_distance")]);
  const hasFloorChange = Object.values(DEDICATED_STAIR_ROUTE_KEYS)
    .some((key) => result.answers[key] !== undefined);
  const unsupported = result.answers.dedicated_route_access !== "accessible"
    || hasMixedRoute
    || hasFloorChange
    || result.answers.dedicated_surface_conduit === "yes"
    || routeFeet < 1
    || routeFeet > 50;

  if (unsupported) {
    return {
      kind: "PRICE_INPUTS",
      answers: legacyReview(serviceSlug, "ROUTE_REQUIRES_REVIEW"),
      facts: result.facts,
      inferred: result.inferred,
      flags: [...result.flags, "ROUTE_REQUIRES_REVIEW"],
    };
  }

  return {
    kind: "PRICE_INPUTS",
    answers: {
      [profile.questionKey]: legacyAccessValue(answers),
      [profile.distanceKey]: routeFeet <= 25 ? "under_25" : "25_to_50",
    },
    facts: result.facts,
    inferred: result.inferred,
    flags: result.flags,
  };
}

export function dedicatedCategoryReviewAnswers(
  serviceSlug: DedicatedCategoryStairWalkSlug,
  code: string,
): Record<string, string> {
  if (serviceSlug === "dedicated-120v-circuit-outlet") {
    return {
      dedicated_route_access: "finished",
      dedicated_distance: "over_50",
      dedicated_stair_walk: `review:${code}`,
    };
  }
  return legacyReview(serviceSlug, code);
}
