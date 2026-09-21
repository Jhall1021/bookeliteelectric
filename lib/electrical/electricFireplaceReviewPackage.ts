const ACCESSIBLE_PATHS = new Set(["unfinished_basement", "drop_ceiling", "accessible_attic", "combination"]);
const DISTANCE_BANDS = new Set(["under_25", "25_to_50"]);

/** Customer answers only identify a candidate standard package. Equipment
 * rating, panel suitability and actual hidden route remain contractor facts. */
export function isReviewedStandardElectricFireplaceCircuit(answers: Record<string, string | undefined>): boolean {
  return answers.fireplace_connection === "standard_plug"
    && answers.fireplace_wall === "ordinary_drywall"
    && ACCESSIBLE_PATHS.has(answers.fireplace_route_access ?? "")
    && DISTANCE_BANDS.has(answers.fireplace_distance ?? "");
}
