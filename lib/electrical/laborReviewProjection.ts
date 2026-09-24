import type { LaborOperation, LaborRecipe, QuantityFacts } from "../laborOperations";
import { evaluateLaborRecipe } from "../laborOperations";

export type LaborDecisionSource = "PLATFORM_BASELINE" | "DIRECT" | "APPROVED_PROPOSAL" | "UNAPPROVED_PROPOSAL";
export type LaborDecision = {
  operationKey: string;
  hoursPerUnit: number;
  source: LaborDecisionSource;
};

export type LaborProjection =
  | {
      kind: "READY_FOR_SERVICE_REVIEW";
      recipeKey: string;
      suggestedHours: number;
      lines: { operationKey: string; quantity: number; hoursPerUnit: number; hours: number; source: Exclude<LaborDecisionSource, "UNAPPROVED_PROPOSAL"> }[];
      requiresServiceApproval: true;
      canPublish: false;
    }
  | {
      kind: "BLOCKED";
      recipeKey: string;
      missingOperations: string[];
      pendingProposalOperations: string[];
      missingQuantities: string[];
      invalidConditions: string[];
      canPublish: false;
    };

/**
 * Projects approved atomic labor through one physical recipe. It never writes,
 * publishes, or treats a derived service duration as contractor-approved.
 */
export function projectLaborRecipe(
  recipe: LaborRecipe,
  facts: QuantityFacts,
  decisions: LaborDecision[],
): LaborProjection {
  const seen = new Set<string>();
  for (const decision of decisions) {
    if (seen.has(decision.operationKey)) throw new Error(`duplicate labor decision for ${decision.operationKey}`);
    if (!Number.isFinite(decision.hoursPerUnit) || decision.hoursPerUnit < 0) throw new Error(`invalid labor hours for ${decision.operationKey}`);
    seen.add(decision.operationKey);
  }
  const byOperation = new Map(decisions.map((decision) => [decision.operationKey, decision]));
  const approvedHours = Object.fromEntries(
    decisions
      .filter((decision) => decision.source !== "UNAPPROVED_PROPOSAL")
      .map((decision) => [decision.operationKey, decision.hoursPerUnit]),
  );
  const evaluation = evaluateLaborRecipe(recipe, facts, approvedHours);
  if (evaluation.kind === "INCOMPLETE") {
    const pendingProposalOperations = evaluation.missingOperations
      .filter((key) => byOperation.get(key)?.source === "UNAPPROVED_PROPOSAL");
    return {
      kind: "BLOCKED",
      recipeKey: recipe.key,
      missingOperations: evaluation.missingOperations.filter((key) => !pendingProposalOperations.includes(key)),
      pendingProposalOperations,
      missingQuantities: evaluation.missingQuantities,
      invalidConditions: evaluation.invalidConditions,
      canPublish: false,
    };
  }

  const lines = Object.entries(evaluation.quantities).map(([operationKey, quantity]) => {
    const decision = byOperation.get(operationKey)!;
    if (!decision || decision.source === "UNAPPROVED_PROPOSAL") throw new Error(`ready evaluation lacks approved labor for ${operationKey}`);
    return { operationKey, quantity, hoursPerUnit: decision.hoursPerUnit, hours: quantity * decision.hoursPerUnit, source: decision.source };
  });
  return {
    kind: "READY_FOR_SERVICE_REVIEW",
    recipeKey: recipe.key,
    suggestedHours: evaluation.hours,
    lines,
    requiresServiceApproval: true,
    canPublish: false,
  };
}

export type ServiceLaborReviewItem = {
  serviceSlug: string;
  recipeKey: string;
  projection: LaborProjection;
};

export function buildServiceLaborReviewQueue(
  recipes: LaborRecipe[],
  serviceSlugs: Set<string>,
  standardFactsByRecipe: Record<string, QuantityFacts | undefined>,
  decisions: LaborDecision[],
): ServiceLaborReviewItem[] {
  return recipes.flatMap((recipe) => {
    const targets = recipe.appliesTo.filter((target) => serviceSlugs.has(target));
    if (!targets.length) return [];
    const facts = standardFactsByRecipe[recipe.key] ?? {};
    const projection = projectLaborRecipe(recipe, facts, decisions);
    return targets.map((serviceSlug) => ({ serviceSlug, recipeKey: recipe.key, projection }));
  }).sort((a, b) => a.serviceSlug.localeCompare(b.serviceSlug));
}
