import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { evaluateLaborRecipe, framingCrossingCount, type LaborEvaluation } from "../laborOperations";
import type { ConcealedEndpoint } from "./concealedRouteMaterialConfiguration";

const RECIPE_BY_ENDPOINT = {
  OUTLET: "ELECTRICAL_DRYWALL_CONCEALED_OUTLET",
  SWITCH: "ELECTRICAL_DRYWALL_CONCEALED_SWITCH",
  CEILING_FAN: "ELECTRICAL_DRYWALL_CONCEALED_CEILING_FAN",
} as const;

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
  // The ceiling-fan homeowner flow deliberately promises a conservative
  // 16-inch framing assumption. Keep that customer-visible rule independent
  // of a contractor policy value that may be wider (for example 24 inches),
  // because using the wider value here would undercount both joist drilling
  // and access openings after the customer has accepted the worst-case price.
  const spacingInches = args.endpoint === "CEILING_FAN" ? 16 : args.framingSpacingInches;
  const openingCount = routeFeet > 0 && spacingInches !== null && spacingInches > 0
    ? framingCrossingCount(routeFeet, spacingInches)
    : null;
  return evaluateLaborRecipe(recipe, { concealedRouteFeet: routeFeet > 0 ? routeFeet : null, drywallOpeningCount: openingCount }, args.contractorHours);
}
