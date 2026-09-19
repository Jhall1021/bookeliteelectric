import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { evaluateLaborRecipe, type LaborEvaluation } from "../laborOperations";

export type LightingAccess = "ACCESSIBLE" | "FINISHED";

const recipe = (key: string) => {
  const found = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`${key} is missing from the canonical labor library`);
  return found;
};

export function switchLegOperationKeys(access: LightingAccess): string[] {
  const selected = recipe(access === "ACCESSIBLE" ? "ELECTRICAL_ACCESSIBLE_SWITCH_LEG" : "ELECTRICAL_FINISHED_SWITCH_LEG");
  return [...new Set(selected.lines.map((line) => line.operationKey))];
}

export function evaluateSwitchLegAtomicLabor(args: {
  access: LightingAccess;
  routeFeet: number | null;
  perpendicularCeilingFeet: number | null;
  framingSpacingInches: number | null;
  contractorHours: Record<string, number | null | undefined>;
}): LaborEvaluation {
  const selected = recipe(args.access === "ACCESSIBLE" ? "ELECTRICAL_ACCESSIBLE_SWITCH_LEG" : "ELECTRICAL_FINISHED_SWITCH_LEG");
  return evaluateLaborRecipe(selected, {
    routeFeet: args.routeFeet,
    perpendicularCeilingFeet: args.access === "FINISHED" ? args.perpendicularCeilingFeet : 0,
    framingSpacingInches: args.access === "FINISHED" ? args.framingSpacingInches : 16,
  }, args.contractorHours);
}

export function recessedLightingOperationKeys(): string[] {
  return [...new Set(recipe("ELECTRICAL_RECESSED_LIGHT_GROUP").lines.map((line) => line.operationKey))];
}

export function evaluateRecessedLightingAtomicLabor(args: {
  access: LightingAccess;
  lightCount: number | null;
  interLightCableFeet: number | null;
  perpendicularCeilingFeet: number | null;
  framingSpacingInches: number | null;
  contractorHours: Record<string, number | null | undefined>;
}): LaborEvaluation {
  return evaluateLaborRecipe(recipe("ELECTRICAL_RECESSED_LIGHT_GROUP"), {
    accessibleRoute: args.access === "ACCESSIBLE",
    finishedRoute: args.access === "FINISHED",
    lightCount: args.lightCount,
    interLightCableFeet: args.interLightCableFeet,
    perpendicularCeilingFeet: args.perpendicularCeilingFeet,
    framingSpacingInches: args.framingSpacingInches,
  }, args.contractorHours);
}
