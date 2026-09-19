import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { evaluateLaborRecipe, type LaborEvaluation } from "../laborOperations";
import type { ConcealedEndpoint } from "./concealedRouteMaterialConfiguration";

const RECIPE_BY_ENDPOINT = {
  OUTLET: "ELECTRICAL_BASEBOARD_CONCEALED_OUTLET",
  SWITCH: "ELECTRICAL_BASEBOARD_CONCEALED_SWITCH",
} as const;

export function baseboardConcealedOperationKeys(endpoint: ConcealedEndpoint): string[] {
  const key = RECIPE_BY_ENDPOINT[endpoint];
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === key);
  if (!recipe) throw new Error(`${key} is missing from the canonical labor library`);
  return [...new Set(recipe.lines.map((line) => line.operationKey))];
}

export function evaluateBaseboardConcealedAtomicLabor(args: {
  endpoint: ConcealedEndpoint;
  components: { key: string; quantity: number }[];
  contractorHours: Record<string, number | null | undefined>;
}): LaborEvaluation {
  const key = RECIPE_BY_ENDPOINT[args.endpoint];
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === key);
  if (!recipe) throw new Error(`${key} is missing from the canonical labor library`);
  const quantity = (componentKey: string) => args.components.filter((component) => component.key === componentKey)
    .reduce((sum, component) => sum + component.quantity, 0);
  return evaluateLaborRecipe(recipe, {
    concealedRouteFeet: quantity("CONCEALED_ROUTE_FT"),
    baseboardAccessFeet: quantity("RESTORE_BASEBOARD_ACCESS"),
  }, args.contractorHours);
}
