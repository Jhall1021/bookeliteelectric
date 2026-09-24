import { projectElectricalServiceLabor } from "./laborServiceApproval";
import { platformLaborHours } from "./platformLaborBaseline";

export type FixtureRouteLaborPackage = {
  componentKey: string;
  serviceSlug: "new-ceiling-light" | "new-ceiling-fan" | "new-wall-sconce";
  accessibleHours: number;
  finishedHours: number;
  premiumHours: number;
  premiumScheduleMinutes: number;
  evidence: string;
};

const COMPONENTS = [
  { componentKey: "NEW_CEILING_LIGHT_FINISHED", serviceSlug: "new-ceiling-light" },
  { componentKey: "NEW_CEILING_FAN_FINISHED", serviceSlug: "new-ceiling-fan" },
  { componentKey: "NEW_WALL_SCONCE_FINISHED_ROUTE", serviceSlug: "new-wall-sconce" },
] as const;

const decisions = Object.entries(platformLaborHours()).map(([operationKey, hoursPerUnit]) => ({
  operationKey,
  hoursPerUnit,
  source: "APPROVED_PROPOSAL" as const,
}));

const readyHours = (
  serviceSlug: FixtureRouteLaborPackage["serviceSlug"],
  facts: Record<string, string | number | boolean | null | undefined>,
): number => {
  const projection = projectElectricalServiceLabor(serviceSlug, decisions, facts);
  if (projection.kind !== "READY_FOR_APPROVAL") {
    throw new Error(`${serviceSlug} cannot be assembled from the platform atomic labor baseline (${projection.kind})`);
  }
  return projection.suggestedHours;
};

/**
 * The three instant-price fixture services publish an accessible 25-foot base
 * and add a component only when the customer selects a fully finished route.
 * The component therefore owns exactly the difference between two evaluations
 * of the same canonical recipe—not an independently guessed surcharge.
 *
 * Finished fixed prices use the same conservative all-perpendicular 16-inch
 * framing envelope as the switch-leg packages. Patching and painting remain
 * excluded by the atomic operation definitions and customer disclaimer.
 */
export const FIXTURE_ROUTE_LABOR_PACKAGES: readonly FixtureRouteLaborPackage[] = COMPONENTS.map((entry) => {
  const accessibleHours = readyHours(entry.serviceSlug, {
    accessibleRoute: true,
    finishedRoute: false,
    accessibleRouteFeet: 25,
    nmCableSupportCount: 7,
    existingLightingSourceConfirmed: true,
  });
  const finishedHours = readyHours(entry.serviceSlug, {
    accessibleRoute: false,
    finishedRoute: true,
    concealedRouteFeet: 25,
    perpendicularFramingFeet: 25,
    framingSpacingInches: 16,
    existingLightingSourceConfirmed: true,
  });
  const premiumHours = finishedHours - accessibleHours;
  return {
    ...entry,
    accessibleHours,
    finishedHours,
    premiumHours,
    premiumScheduleMinutes: Math.ceil(premiumHours * 60 - 1e-6),
    evidence: "same atomic service recipe with platform planning factors; 25-foot upper-bound route; finished route uses all-perpendicular 16-inch framing envelope",
  };
});

export const fixtureRouteLaborPackageByComponent = new Map(
  FIXTURE_ROUTE_LABOR_PACKAGES.map((entry) => [entry.componentKey, entry]),
);
