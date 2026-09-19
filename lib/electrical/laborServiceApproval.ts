import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { projectLaborRecipe, type LaborDecision, type LaborProjection } from "./laborReviewProjection";
import { buildElectricalStandardScenarios } from "./standardLaborScenarios";

export type ElectricalServiceLaborApproval =
  | { kind: "READY_FOR_APPROVAL"; serviceSlug: string; recipeKey: string; suggestedHours: number; projection: Extract<LaborProjection, { kind: "READY_FOR_SERVICE_REVIEW" }>; canPublish: false }
  | { kind: "BLOCKED"; serviceSlug: string; recipeKey: string; projection: Extract<LaborProjection, { kind: "BLOCKED" }>; canPublish: false }
  | { kind: "NO_STANDARD_SCOPE"; serviceSlug: string; recipeKey: string; reason: string; missingFacts: string[]; canPublish: false }
  | { kind: "NOT_MODELED"; serviceSlug: string; canPublish: false };

/** Recomputes one suggestion from current approved atomic labor. No writes. */
export function projectElectricalServiceLabor(serviceSlug: string, decisions: LaborDecision[]): ElectricalServiceLaborApproval {
  const scenario = buildElectricalStandardScenarios().find((candidate) => candidate.serviceSlug === serviceSlug);
  if (!scenario) return { kind: "NOT_MODELED", serviceSlug, canPublish: false };
  if (scenario.kind === "NO_STANDARD") return {
    kind: "NO_STANDARD_SCOPE", serviceSlug, recipeKey: scenario.recipeKey,
    reason: scenario.reason, missingFacts: scenario.missingFacts, canPublish: false,
  };
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === scenario.recipeKey);
  if (!recipe) throw new Error(`Missing labor recipe ${scenario.recipeKey}`);
  const projection = projectLaborRecipe(recipe, scenario.facts, decisions);
  if (projection.kind === "BLOCKED") return { kind: "BLOCKED", serviceSlug, recipeKey: scenario.recipeKey, projection, canPublish: false };
  return { kind: "READY_FOR_APPROVAL", serviceSlug, recipeKey: scenario.recipeKey, suggestedHours: projection.suggestedHours, projection, canPublish: false };
}

