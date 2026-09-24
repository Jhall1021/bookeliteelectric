import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { platformLaborHours } from "./platformLaborBaseline";
import { evaluateLaborRecipe } from "../laborOperations";

const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find(
  (candidate) => candidate.key === "ELECTRICAL_SWITCHED_RECEPTACLE_LIGHTING_CONVERSION",
);
if (!recipe) throw new Error("switched-receptacle lighting conversion recipe is missing");

const evaluation = evaluateLaborRecipe(recipe, {}, platformLaborHours());
if (evaluation.kind !== "READY") throw new Error("switched-receptacle lighting conversion baseline is incomplete");

/**
 * Access-independent incremental labor. The host light/fan/recessed recipe
 * already owns the cable route and its accessible/finished construction work.
 */
export const LIGHTING_CONTROL_CONVERSION_LABOR_PACKAGE = {
  componentKeys: [
    "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE",
    "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED",
  ] as const,
  laborHours: evaluation.hours,
  scheduleMinutes: Math.ceil(evaluation.hours * 60 - 1e-6),
  quantities: evaluation.quantities,
  evidence: "atomic switched-receptacle conversion; host service separately owns cable-route access labor",
};
