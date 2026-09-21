const INCLUDED_HEIGHTS = new Set(["under_8", "9_12"]);
const INCLUDED_DISTANCE_BANDS = new Set(["under_25", "25_50"]);

/**
 * Customer answers identify the bounded package; they never establish hidden
 * accessible-route footage. The electrician still confirms source suitability,
 * wall conditions and the complete installed cable path during review.
 */
export function isReviewedAccessibleNewExteriorLight(answers: Record<string, string | undefined>): boolean {
  return answers.exterior_light_existing === "new_location"
    && answers.exterior_light_fixture_supply === "customer_supplied"
    && INCLUDED_HEIGHTS.has(answers.exterior_light_height ?? "")
    && answers.exterior_light_wall === "ordinary_siding"
    && answers.exterior_light_access === "accessible"
    && INCLUDED_DISTANCE_BANDS.has(answers.exterior_light_distance ?? "")
    && answers.exterior_light_control === "existing_switched_source";
}
