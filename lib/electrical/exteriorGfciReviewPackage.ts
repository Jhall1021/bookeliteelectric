export function isReviewedAccessibleExteriorGfci(answers: Record<string, string | undefined>): boolean {
  const rawDistance = answers.ext_gfci_distance;
  const numericDistance = rawDistance === undefined ? Number.NaN : Number(rawDistance);
  const isSupportedDistance = rawDistance === "under_10"
    || rawDistance === "10_to_20"
    || (Number.isFinite(numericDistance) && numericDistance >= 1 && numericDistance <= 20);

  return answers.below_above_access === "has_access"
    && isSupportedDistance;
}
