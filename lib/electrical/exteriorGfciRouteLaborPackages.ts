import { concealedNmSupportCount } from "./concealedRouteMaterialConfiguration";
import { projectElectricalServiceLabor } from "./laborServiceApproval";
import { platformLaborHours } from "./platformLaborBaseline";

export type ExteriorGfciRouteLaborPackage = {
  componentKey: string;
  access: "ACCESSIBLE" | "FINISHED";
  routeFeet: number;
  fullRecipeHours: number;
  incrementHours: number;
  incrementScheduleMinutes: number;
  evidence: string;
};

const decisions = Object.entries(platformLaborHours()).map(([operationKey, hoursPerUnit]) => ({
  operationKey,
  hoursPerUnit,
  source: "APPROVED_PROPOSAL" as const,
}));

const readyHours = (facts: Record<string, string | number | boolean | null | undefined>): number => {
  const projection = projectElectricalServiceLabor("exterior-gfci-other-routing", decisions, facts);
  if (projection.kind !== "READY_FOR_APPROVAL") {
    throw new Error(`exterior-gfci-other-routing cannot be assembled from the platform atomic labor baseline (${projection.kind})`);
  }
  return projection.suggestedHours;
};

const supportCount = (routeFeet: number) => concealedNmSupportCount(routeFeet, 4.5, true);
const accessibleFacts = (routeFeet: number) => ({
  accessibleRoute: true,
  finishedRoute: false,
  accessibleRouteFeet: routeFeet,
  nmCableSupportCount: supportCount(routeFeet),
});
const finishedFacts = (routeFeet: number) => ({
  accessibleRoute: false,
  finishedRoute: true,
  concealedRouteFeet: routeFeet,
  perpendicularFramingFeet: routeFeet,
  framingSpacingInches: 16,
});

const baseHours = readyHours(accessibleFacts(10));
const inputs = [
  { componentKey: "EXT_GFCI_RUN_ACCESSIBLE_UNDER_10", access: "ACCESSIBLE", routeFeet: 10 },
  { componentKey: "EXT_GFCI_RUN_ACCESSIBLE_10_20", access: "ACCESSIBLE", routeFeet: 20 },
  { componentKey: "EXT_GFCI_RUN_FINISHED_UNDER_10", access: "FINISHED", routeFeet: 10 },
  { componentKey: "EXT_GFCI_RUN_FINISHED_10_20", access: "FINISHED", routeFeet: 20 },
] as const;

/**
 * Legacy route components are increments over the service's accessible
 * under-10-foot base. Each increment is therefore the difference between two
 * complete evaluations of the same routed exterior-GFCI recipe.
 *
 * Distance bands use their upper bound. Accessible support counts follow the
 * rehearsal's reviewed 4.5-foot spacing plus both terminations. A finished
 * fixed-price envelope treats the bounded path as perpendicular to 16-inch
 * framing so hidden crossings are never silently priced as zero. The live
 * service remains contractor-review led and uses measured geometry instead.
 */
export const EXTERIOR_GFCI_ROUTE_LABOR_PACKAGES: readonly ExteriorGfciRouteLaborPackage[] = inputs.map((input) => {
  const fullRecipeHours = readyHours(input.access === "ACCESSIBLE"
    ? accessibleFacts(input.routeFeet)
    : finishedFacts(input.routeFeet));
  const incrementHours = fullRecipeHours - baseHours;
  return {
    ...input,
    fullRecipeHours,
    incrementHours,
    incrementScheduleMinutes: Math.ceil(incrementHours * 60 - 1e-6),
    evidence: `same routed exterior-GFCI atomic recipe relative to the accessible 10-foot base; ${input.routeFeet}-foot upper-bound route; ${input.access === "FINISHED" ? "all-perpendicular 16-inch framing envelope" : "4.5-foot support spacing plus terminal supports"}`,
  };
});

export const exteriorGfciRouteLaborPackageByComponent = new Map(
  EXTERIOR_GFCI_ROUTE_LABOR_PACKAGES.map((entry) => [entry.componentKey, entry]),
);
