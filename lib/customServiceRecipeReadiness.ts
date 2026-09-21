export type CustomServiceRecipeInput = {
  fieldLaborHours: number | null;
  estimatedMinutes: number | null;
  estimatedMinutesReviewed: boolean;
  materialRoleCount: number;
  materialCostCents: number | null;
  materialCostResolved: boolean;
  publishedPriceApprovedAt: Date | string | null;
};

export type RecipeStageStatus = "COMPLETE" | "NEEDS_INPUT" | "BLOCKED";

export type CustomServiceRecipeReadiness = {
  labor: RecipeStageStatus;
  duration: RecipeStageStatus;
  materials: RecipeStageStatus;
  price: RecipeStageStatus;
  readyToPublish: boolean;
};

/**
 * Read model for the custom-service recipe guide.
 *
 * This deliberately does not calculate or write anything. It summarizes the
 * existing authorities: approved contractor labor, reviewed dispatch time,
 * resolved material inputs and explicit price approval. A missing ingredient
 * remains missing rather than being treated as zero.
 */
export function customServiceRecipeReadiness(
  input: CustomServiceRecipeInput,
): CustomServiceRecipeReadiness {
  const labor = input.fieldLaborHours === null ? "NEEDS_INPUT" : "COMPLETE";
  const duration = input.estimatedMinutes === null
    ? "NEEDS_INPUT"
    : input.estimatedMinutesReviewed
      ? "COMPLETE"
      : "BLOCKED";

  // An itemized recipe is only complete when every role and quantity resolves.
  // A labor-only service may deliberately record a zero material allowance;
  // null, however, is still an unanswered decision.
  const materials = input.materialRoleCount > 0
    ? input.materialCostResolved && input.materialCostCents !== null
      ? "COMPLETE"
      : "BLOCKED"
    : input.materialCostCents !== null
      ? "COMPLETE"
      : "NEEDS_INPUT";

  const inputsComplete = labor === "COMPLETE" && duration === "COMPLETE" && materials === "COMPLETE";
  const price = !inputsComplete
    ? "BLOCKED"
    : input.publishedPriceApprovedAt === null
      ? "NEEDS_INPUT"
      : "COMPLETE";

  return {
    labor,
    duration,
    materials,
    price,
    readyToPublish: inputsComplete && price === "COMPLETE",
  };
}
