import { evaluateSwitchLegAtomicLabor, type LightingAccess } from "./lightingRouteAtomicLaborBridge";
import { platformLaborHours } from "./platformLaborBaseline";

export type LightingControlLaborPackage = {
  componentKey: string;
  access: LightingAccess;
  routeFeet: number;
  perpendicularCeilingFeet: number;
  framingSpacingInches: number;
  laborHours: number;
  scheduleMinutes: number;
  evidence: string;
};

type PackageInput = Omit<LightingControlLaborPackage, "laborHours" | "scheduleMinutes" | "evidence">;

const PACKAGE_INPUTS: readonly PackageInput[] = [
  { componentKey: "SWITCHLEG_ACCESSIBLE_UNDER_10", access: "ACCESSIBLE", routeFeet: 10, perpendicularCeilingFeet: 0, framingSpacingInches: 16 },
  { componentKey: "SWITCHLEG_ACCESSIBLE_10_20", access: "ACCESSIBLE", routeFeet: 20, perpendicularCeilingFeet: 0, framingSpacingInches: 16 },
  { componentKey: "SWITCHLEG_FINISHED_UNDER_10", access: "FINISHED", routeFeet: 10, perpendicularCeilingFeet: 10, framingSpacingInches: 16 },
  { componentKey: "SWITCHLEG_FINISHED_10_20", access: "FINISHED", routeFeet: 20, perpendicularCeilingFeet: 20, framingSpacingInches: 16 },
  { componentKey: "SWITCH_POWER_RUN_ACCESSIBLE", access: "ACCESSIBLE", routeFeet: 25, perpendicularCeilingFeet: 0, framingSpacingInches: 16 },
  { componentKey: "SWITCH_POWER_RUN_FINISHED", access: "FINISHED", routeFeet: 25, perpendicularCeilingFeet: 25, framingSpacingInches: 16 },
] as const;

/**
 * Fixed-price lighting-control packages translated from the atomic recipe.
 *
 * Distance bands use their upper bound, matching the material allowances. A
 * finished route uses the conservative all-perpendicular envelope at 16-inch
 * framing because the homeowner flow establishes distance and access but not
 * joist direction. That keeps the branch priceable without silently treating
 * hidden framing crossings as zero. Routes beyond the bounded bands remain
 * review-only in the decision tree.
 */
export const LIGHTING_CONTROL_LABOR_PACKAGES: readonly LightingControlLaborPackage[] = PACKAGE_INPUTS.map((input) => {
  const evaluation = evaluateSwitchLegAtomicLabor({
    access: input.access,
    routeFeet: input.routeFeet,
    perpendicularCeilingFeet: input.perpendicularCeilingFeet,
    framingSpacingInches: input.framingSpacingInches,
    contractorHours: platformLaborHours(),
  });
  if (evaluation.kind !== "READY") {
    throw new Error(`${input.componentKey} cannot be assembled from the platform atomic labor baseline`);
  }
  return {
    ...input,
    laborHours: evaluation.hours,
    scheduleMinutes: Math.ceil(evaluation.hours * 60 - 1e-6),
    evidence: `atomic switch-leg recipe; ${input.routeFeet}-foot upper-bound route; ${input.access === "FINISHED" ? "all-perpendicular 16-inch framing envelope" : "accessible route"}`,
  };
});

export const lightingControlLaborPackageByComponent = new Map(
  LIGHTING_CONTROL_LABOR_PACKAGES.map((entry) => [entry.componentKey, entry]),
);
