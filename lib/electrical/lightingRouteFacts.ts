import type { LightingAccess } from "./lightingRouteAtomicLaborBridge";

export type LightingFactSource =
  | "CUSTOMER_TREE"
  | "ROUTE_ASSIST_CONFIRMED"
  | "CONTRACTOR_MEASUREMENT"
  | "CONTRACTOR_POLICY";

export type SourcedLightingFact<T> = {
  value: T | null;
  source: LightingFactSource;
};

export type RecessedLightingRouteFactInput = {
  access: SourcedLightingFact<LightingAccess>;
  lightCount: SourcedLightingFact<number>;
  installedCablePathFeet: SourcedLightingFact<number>;
  perpendicularCeilingFeet: SourcedLightingFact<number>;
  framingSpacingInches: SourcedLightingFact<number>;
  totalCableSlackFeet: SourcedLightingFact<number>;
};

export type RecessedLightingRouteFacts = {
  access: LightingAccess;
  lightCount: number;
  installedCablePathFeet: number;
  perpendicularCeilingFeet: number;
  framingSpacingInches: number;
  totalCableSlackFeet: number;
};

export type LightingRouteFactResolution =
  | { kind: "READY"; facts: RecessedLightingRouteFacts }
  | { kind: "INCOMPLETE"; missingFacts: string[]; invalidFacts: string[] };

const measuredSources = new Set<LightingFactSource>(["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"]);
const policySources = new Set<LightingFactSource>(["CONTRACTOR_POLICY", "CONTRACTOR_MEASUREMENT"]);

function positiveInteger(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

function nonnegativeFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

/**
 * Establish the physical facts shared by recessed-light labor and materials.
 *
 * The customer tree may state only the customer's selections (access and
 * count). It may not invent cable footage, joist orientation, framing spacing,
 * or slack. Geometry must be confirmed by Route Assist or measured by the
 * contractor; contractor policy owns the ordinary spacing/slack allowances.
 */
export function resolveRecessedLightingRouteFacts(
  input: RecessedLightingRouteFactInput
): LightingRouteFactResolution {
  const missingFacts: string[] = [];
  const invalidFacts: string[] = [];

  if (input.access.value === null) missingFacts.push("access");
  else if (input.access.source !== "CUSTOMER_TREE" && input.access.source !== "CONTRACTOR_MEASUREMENT") {
    invalidFacts.push("access must come from the customer tree or contractor measurement");
  }

  if (input.lightCount.value === null) missingFacts.push("lightCount");
  else if (!positiveInteger(input.lightCount.value)) invalidFacts.push("lightCount must be a positive integer");
  else if (input.lightCount.source !== "CUSTOMER_TREE" && input.lightCount.source !== "CONTRACTOR_MEASUREMENT") {
    invalidFacts.push("lightCount must come from the customer tree or contractor measurement");
  }

  if (input.installedCablePathFeet.value === null) missingFacts.push("installedCablePathFeet");
  else if (!nonnegativeFinite(input.installedCablePathFeet.value)) invalidFacts.push("installedCablePathFeet must be nonnegative");
  else if (!measuredSources.has(input.installedCablePathFeet.source)) invalidFacts.push("installedCablePathFeet must be measured");

  const finished = input.access.value === "FINISHED";
  if (finished && input.perpendicularCeilingFeet.value === null) missingFacts.push("perpendicularCeilingFeet");
  else if (input.perpendicularCeilingFeet.value !== null && !nonnegativeFinite(input.perpendicularCeilingFeet.value)) {
    invalidFacts.push("perpendicularCeilingFeet must be nonnegative");
  } else if (input.perpendicularCeilingFeet.value !== null && !measuredSources.has(input.perpendicularCeilingFeet.source)) {
    invalidFacts.push("perpendicularCeilingFeet must be measured");
  }

  if (finished && input.framingSpacingInches.value === null) missingFacts.push("framingSpacingInches");
  else if (input.framingSpacingInches.value !== null && !positiveInteger(input.framingSpacingInches.value)) {
    invalidFacts.push("framingSpacingInches must be a positive integer");
  } else if (input.framingSpacingInches.value !== null && !policySources.has(input.framingSpacingInches.source)) {
    invalidFacts.push("framingSpacingInches must be contractor-declared");
  }

  if (input.totalCableSlackFeet.value === null) missingFacts.push("totalCableSlackFeet");
  else if (!nonnegativeFinite(input.totalCableSlackFeet.value)) invalidFacts.push("totalCableSlackFeet must be nonnegative");
  else if (!policySources.has(input.totalCableSlackFeet.source)) invalidFacts.push("totalCableSlackFeet must be contractor-declared");

  if (missingFacts.length > 0 || invalidFacts.length > 0 || input.access.value === null || input.lightCount.value === null || input.installedCablePathFeet.value === null || input.totalCableSlackFeet.value === null) {
    return { kind: "INCOMPLETE", missingFacts, invalidFacts };
  }

  return {
    kind: "READY",
    facts: {
      access: input.access.value,
      lightCount: input.lightCount.value,
      installedCablePathFeet: input.installedCablePathFeet.value,
      perpendicularCeilingFeet: finished ? (input.perpendicularCeilingFeet.value as number) : 0,
      framingSpacingInches: finished ? (input.framingSpacingInches.value as number) : 1,
      totalCableSlackFeet: input.totalCableSlackFeet.value,
    },
  };
}
