import { concealedNmSupportCount } from "./concealedRouteMaterialConfiguration";
import { evaluateRecessedLightingAtomicLabor } from "./lightingRouteAtomicLaborBridge";
import { platformLaborHours } from "./platformLaborBaseline";

export type RecessedLightingComponentLaborPackage = {
  componentKey: string;
  fullRecipeHours: number;
  incrementHours: number;
  incrementScheduleMinutes: number;
  evidence: string;
};

export type RecessedLightingComponentMaterialRecipe = {
  componentKey: "RECESSED_ADDITIONAL_ACCESSIBLE" | "RECESSED_ADDITIONAL_FINISHED";
  evidence: string;
  lines: readonly { role: string; quantity: number }[];
};

const hours = (args: {
  access: "ACCESSIBLE" | "FINISHED";
  lightCount: number;
  routeFeet: number;
}): number => {
  const evaluation = evaluateRecessedLightingAtomicLabor({
    access: args.access,
    lightCount: args.lightCount,
    interLightCableFeet: args.routeFeet,
    nmCableSupportCount: args.access === "ACCESSIBLE" ? concealedNmSupportCount(args.routeFeet, 4.5, true) : 0,
    perpendicularCeilingFeet: args.access === "FINISHED" ? args.routeFeet : 0,
    framingSpacingInches: 16,
    existingLightingSourceConfirmed: true,
    contractorHours: platformLaborHours(),
  });
  if (evaluation.kind !== "READY") throw new Error("recessed-lighting cannot be assembled from the platform atomic labor baseline");
  return evaluation.hours;
};

const accessibleBaseHours = hours({ access: "ACCESSIBLE", lightCount: 1, routeFeet: 25 });
const finishedBaseHours = hours({ access: "FINISHED", lightCount: 1, routeFeet: 25 });
const inputs = [
  {
    componentKey: "RECESSED_ADDITIONAL_ACCESSIBLE",
    fullRecipeHours: hours({ access: "ACCESSIBLE", lightCount: 2, routeFeet: 35 }),
    comparisonHours: accessibleBaseHours,
    evidence: "second accessible light relative to the first-light package; adds one wafer opening/installation, 10 route feet and two policy-derived supports",
  },
  {
    componentKey: "RECESSED_FIRST_LIGHT_FINISHED",
    fullRecipeHours: finishedBaseHours,
    comparisonHours: accessibleBaseHours,
    evidence: "same first-light 25-foot atomic recipe; finished route relative to accessible route; all-perpendicular 16-inch framing envelope",
  },
  {
    componentKey: "RECESSED_ADDITIONAL_FINISHED",
    fullRecipeHours: hours({ access: "FINISHED", lightCount: 2, routeFeet: 35 }),
    comparisonHours: finishedBaseHours,
    evidence: "second finished light relative to the first finished-light package; adds one wafer opening/installation and a conservative 10-foot all-perpendicular 16-inch framing segment",
  },
] as const;

/**
 * These compatibility components describe increments over the 25-foot
 * first-light package. Their hours are differences between complete atomic
 * evaluations, not standalone guesses. The live recessed-light service stays
 * review-led and prices contractor-measured layout geometry.
 */
export const RECESSED_LIGHTING_COMPONENT_LABOR_PACKAGES: readonly RecessedLightingComponentLaborPackage[] = inputs.map((input) => {
  const incrementHours = input.fullRecipeHours - input.comparisonHours;
  return {
    componentKey: input.componentKey,
    fullRecipeHours: input.fullRecipeHours,
    incrementHours,
    incrementScheduleMinutes: Math.ceil(incrementHours * 60 - 1e-6),
    evidence: input.evidence,
  };
});

export const recessedLightingComponentLaborPackageByComponent = new Map(
  RECESSED_LIGHTING_COMPONENT_LABOR_PACKAGES.map((entry) => [entry.componentKey, entry]),
);

/**
 * Incremental material only. The host service owns the one-per-job
 * consumables package, and the base package owns the first wafer and home run.
 * Wire remains per foot; accessible supports remain per used item.
 */
export const RECESSED_LIGHTING_COMPONENT_MATERIAL_RECIPES: readonly RecessedLightingComponentMaterialRecipe[] = [
  {
    componentKey: "RECESSED_ADDITIONAL_ACCESSIBLE",
    evidence: "one additional wafer, 10 additional cable feet and two additional supports at the reviewed 4.5-foot policy",
    lines: [
      { role: "RECESSED_WAFER", quantity: 1 },
      { role: "WIRE_14_2", quantity: 10 },
      { role: "NM_CABLE_SUPPORT", quantity: 2 },
    ],
  },
  {
    componentKey: "RECESSED_ADDITIONAL_FINISHED",
    evidence: "one additional wafer and 10 additional cable feet; finished concealed routing uses no accessible NM support allowance",
    lines: [
      { role: "RECESSED_WAFER", quantity: 1 },
      { role: "WIRE_14_2", quantity: 10 },
    ],
  },
] as const;
