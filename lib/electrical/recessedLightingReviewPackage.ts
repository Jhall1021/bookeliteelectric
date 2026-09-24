export type RecessedLightingAnswers = Record<string, string | undefined>;

export type ReviewedAccessibleRecessedLightingPackage = {
  lightCount: number;
  access: "ACCESSIBLE";
};

/**
 * The customer may establish count and ordinary access, but not hidden route
 * geometry. The dashboard and write endpoint share this exact envelope so the
 * displayed calculator can never promise more than the server will price.
 */
export function resolveReviewedAccessibleRecessedLightingPackage(
  answers: RecessedLightingAnswers,
): ReviewedAccessibleRecessedLightingPackage | null {
  const lightCount = Number(answers.recessed_light_count);
  if (!Number.isInteger(lightCount) || lightCount < 1 || lightCount > 8) return null;
  if (!["under_10", "under_8", "9_10", "11_12", "13_14"].includes(answers.fixture_height ?? "")) return null;
  if (!["level_floor", "open_room_level"].includes(answers.work_area_below ?? "")) return null;
  if (answers.ceiling_access !== "accessible") return null;
  if (answers.lighting_control !== "existing_switched_light") return null;
  if (answers.lighting_dimmer_upgrade !== "standard") return null;
  return { lightCount, access: "ACCESSIBLE" };
}
