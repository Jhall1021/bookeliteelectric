import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { evaluateLaborRecipe, type LaborEvaluation } from "../laborOperations";
import type { ConcealedEndpoint } from "./concealedRouteMaterialConfiguration";
import type { MaterialTakeoff } from "./materialTakeoff";

const RECIPE_BY_ENDPOINT = {
  OUTLET: "ELECTRICAL_ACCESSIBLE_CONCEALED_OUTLET",
  SWITCH: "ELECTRICAL_ACCESSIBLE_CONCEALED_SWITCH",
} as const;

export function accessibleConcealedOperationKeys(endpoint: ConcealedEndpoint): string[] {
  const key = RECIPE_BY_ENDPOINT[endpoint];
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === key);
  if (!recipe) throw new Error(`${key} is missing from the canonical labor library`);
  return [...new Set(recipe.lines.map((line) => line.operationKey))];
}

export function evaluateAccessibleConcealedAtomicLabor(args: {
  endpoint: ConcealedEndpoint;
  components: { key: string; quantity: number }[];
  takeoff: MaterialTakeoff;
  contractorHours: Record<string, number | null | undefined>;
}): LaborEvaluation {
  const key = RECIPE_BY_ENDPOINT[args.endpoint];
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === key);
  if (!recipe) throw new Error(`${key} is missing from the canonical labor library`);
  const routeFeet = args.components.filter((component) => component.key === "CONCEALED_ROUTE_FT")
    .reduce((sum, component) => sum + component.quantity, 0);
  const supportCount = args.takeoff.physicalRequirements.filter((requirement) => requirement.role === "NM_CABLE_SUPPORT")
    .reduce((sum, requirement) => sum + requirement.quantity, 0);
  return evaluateLaborRecipe(recipe, { accessibleRouteFeet: routeFeet, supportCount }, args.contractorHours);
}
