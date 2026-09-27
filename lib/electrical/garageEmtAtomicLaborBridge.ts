import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { evaluateLaborRecipe, type LaborEvaluation, type QuantityFacts } from "../laborOperations";
import type { MaterialTakeoff } from "./materialTakeoff";
import { GARAGE_EMT_ROLES } from "./loadGarageEmtTakeoff";

const RECIPE_KEY = "ELECTRICAL_GARAGE_EMT_OUTLET_SERVICE";

export function garageEmtOperationKeys(): string[] {
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === RECIPE_KEY);
  if (!recipe) throw new Error(`${RECIPE_KEY} is missing from the canonical labor library`);
  return [...new Set(recipe.lines.map((line) => line.operationKey))];
}

const materialQuantity = (takeoff: MaterialTakeoff, role: string) =>
  takeoff.physicalRequirements.filter((item) => item.role === role).reduce((sum, item) => sum + item.quantity, 0);

export function evaluateGarageEmtAtomicLabor(args: {
  components: { key: string; quantity: number }[];
  takeoff: MaterialTakeoff;
  contractorHours: Record<string, number | null | undefined>;
}) {
  const facts: QuantityFacts = {
    emtRouteFeet: materialQuantity(args.takeoff, GARAGE_EMT_ROLES.conduit),
    emtCouplingCount: materialQuantity(args.takeoff, GARAGE_EMT_ROLES.coupling),
    emtConnectorCount: materialQuantity(args.takeoff, GARAGE_EMT_ROLES.connector),
    emtStrapCount: materialQuantity(args.takeoff, GARAGE_EMT_ROLES.strap),
    emtBendCount: args.components.filter((component) => component.key === "GARAGE_EMT_BEND").reduce((sum, component) => sum + component.quantity, 0),
    conductorFeet: materialQuantity(args.takeoff, GARAGE_EMT_ROLES.line)
      + materialQuantity(args.takeoff, GARAGE_EMT_ROLES.neutral)
      + materialQuantity(args.takeoff, GARAGE_EMT_ROLES.ground),
  };
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === RECIPE_KEY);
  if (!recipe) throw new Error(`${RECIPE_KEY} is missing from the canonical labor library`);
  const evaluation: LaborEvaluation = evaluateLaborRecipe(recipe, facts, args.contractorHours);
  return evaluation.kind === "READY"
    ? { kind: "READY" as const, hours: evaluation.hours, quantities: evaluation.quantities, facts }
    : { kind: "LABOR_INCOMPLETE" as const, evaluation, facts };
}
