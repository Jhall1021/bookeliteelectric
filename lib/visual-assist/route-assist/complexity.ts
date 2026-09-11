/**
 * Concealed-mode complexity classification and the access-opening range.
 *
 * PROVISIONAL, same posture as pricesight-v1.md's aggregation layer: these
 * thresholds are a declared, reviewable default, not locked policy. They
 * exist so V1 ships with something honest rather than nothing, and are
 * expected to move into contractor-configurable settings once real jobs
 * have run through this (docs/design/route-assist-v1.md §9).
 */

import type { RouteAssistMode, RouteComplexity } from "./taxonomy";

export type ComplexityInputs = {
  mode: RouteAssistMode;
  insideCorners: number;
  outsideCorners: number;
  wallTransitions: number;
  wallToCeiling: number;
  wallToFloor: number;
  doorwayBypasses: number;
  windowBypasses: number;
  sameWall: boolean | null;
};

/** Only meaningful for CONCEALED mode — callers must not use this for SURFACE. */
export function classifyConcealedComplexity(inputs: ComplexityInputs): RouteComplexity {
  // Not enough surface tagging to say same-wall or not — the honest answer
  // is UNCERTAIN, not a guessed midpoint (§2.B of the brief).
  if (inputs.sameWall === null) return "UNCERTAIN";

  const changeCount =
    inputs.insideCorners +
    inputs.outsideCorners +
    inputs.wallTransitions +
    inputs.wallToCeiling +
    inputs.wallToFloor +
    inputs.doorwayBypasses +
    inputs.windowBypasses;

  if (inputs.sameWall && changeCount === 0) return "SIMPLE";
  if (changeCount <= 2) return "MODERATE";
  return "COMPLEX";
}

/**
 * §2.B — "we may eventually choose to support an approximate access-opening
 * range, but this must never be presented as an exact hole count." Returns
 * `null` for UNCERTAIN: if the complexity itself is unclear, offering a
 * numeric range would look more confident than the input supports.
 */
export function suggestedAccessOpeningRange(
  complexity: RouteComplexity
): { min: number; max: number } | null {
  switch (complexity) {
    case "SIMPLE":
      return { min: 1, max: 2 };
    case "MODERATE":
      return { min: 2, max: 4 };
    case "COMPLEX":
      return { min: 3, max: 6 };
    case "UNCERTAIN":
      return null;
  }
}
