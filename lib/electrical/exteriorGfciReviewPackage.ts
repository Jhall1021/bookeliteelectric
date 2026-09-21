export function isReviewedAccessibleExteriorGfci(answers: Record<string, string | undefined>): boolean {
  return answers.below_above_access === "has_access"
    && (answers.ext_gfci_distance === "under_10" || answers.ext_gfci_distance === "10_to_20");
}
