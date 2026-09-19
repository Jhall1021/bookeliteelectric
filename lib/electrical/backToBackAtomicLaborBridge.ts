import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { evaluateLaborRecipe, type LaborEvaluation } from "../laborOperations";
import type { ConcealedEndpoint } from "./concealedRouteMaterialConfiguration";

const RECIPE_BY_ENDPOINT = {
  OUTLET: "ELECTRICAL_BACK_TO_BACK_OUTLET",
  SWITCH: "ELECTRICAL_BACK_TO_BACK_SWITCH",
} as const;

export function backToBackOperationKeys(endpoint: ConcealedEndpoint): string[] {
  const key = RECIPE_BY_ENDPOINT[endpoint];
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === key);
  if (!recipe) throw new Error(`${key} is missing from the canonical labor library`);
  return [...new Set(recipe.lines.map((line) => line.operationKey))];
}

export function evaluateBackToBackAtomicLabor(args: {
  endpoint: ConcealedEndpoint;
  contractorHours: Record<string, number | null | undefined>;
}): LaborEvaluation {
  const key = RECIPE_BY_ENDPOINT[args.endpoint];
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === key);
  if (!recipe) throw new Error(`${key} is missing from the canonical labor library`);
  return evaluateLaborRecipe(recipe, {}, args.contractorHours);
}
