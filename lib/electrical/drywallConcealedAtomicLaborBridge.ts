import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { evaluateLaborRecipe, framingCrossingCount, type LaborEvaluation } from "../laborOperations";
import type { ConcealedEndpoint } from "./concealedRouteMaterialConfiguration";

const RECIPE_BY_ENDPOINT = { OUTLET: "ELECTRICAL_DRYWALL_CONCEALED_OUTLET", SWITCH: "ELECTRICAL_DRYWALL_CONCEALED_SWITCH" } as const;

export function drywallConcealedOperationKeys(endpoint: ConcealedEndpoint): string[] {
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === RECIPE_BY_ENDPOINT[endpoint]);
  if (!recipe) throw new Error(`${RECIPE_BY_ENDPOINT[endpoint]} is missing from the canonical labor library`);
  return [...new Set(recipe.lines.map((line) => line.operationKey))];
}

export function evaluateDrywallConcealedAtomicLabor(args: {
  endpoint: ConcealedEndpoint;
  components: { key: string; quantity: number }[];
  framingSpacingInches: number | null;
  contractorHours: Record<string, number | null | undefined>;
}): LaborEvaluation {
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === RECIPE_BY_ENDPOINT[args.endpoint]);
  if (!recipe) throw new Error(`${RECIPE_BY_ENDPOINT[args.endpoint]} is missing from the canonical labor library`);
  const routeFeet = args.components.filter((component) => component.key === "CONCEALED_ROUTE_FT").reduce((sum, component) => sum + component.quantity, 0);
  const openingCount = routeFeet > 0 && args.framingSpacingInches !== null && args.framingSpacingInches > 0
    ? framingCrossingCount(routeFeet, args.framingSpacingInches)
    : null;
  return evaluateLaborRecipe(recipe, { concealedRouteFeet: routeFeet > 0 ? routeFeet : null, drywallOpeningCount: openingCount }, args.contractorHours);
}
