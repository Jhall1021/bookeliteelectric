export type DedicatedCircuitAnswers = Record<string, string | undefined>;

export type ReviewedDedicatedCircuitPackage = {
  circuitAmps: 15;
  cableRole: "WIRE_14_2";
};

const ACCESSIBLE_PATHS = new Set(["unfinished_basement", "drop_ceiling", "accessible_attic", "combination"]);
const DISTANCE_BANDS = new Set(["under_25", "25_to_50"]);
const FIFTEEN_AMP_EQUIPMENT = new Set(["fridge_freezer", "bidet"]);

/**
 * Identifies the one dedicated-circuit envelope whose labor and materials are
 * currently complete enough for contractor-reviewed calculation. This is
 * intentionally shared by the dashboard and write endpoint so displaying the
 * calculator can never make a broader promise than the server will honor.
 *
 * Twenty-amp paths stay closed: choosing 12/2 cable is not enough to establish
 * the required receptacle/protection package for every listed appliance.
 */
export function resolveReviewedDedicatedCircuitPackage(
  answers: DedicatedCircuitAnswers,
): ReviewedDedicatedCircuitPackage | null {
  const isFifteenAmp = FIFTEEN_AMP_EQUIPMENT.has(answers.dedicated_equipment ?? "")
    || (answers.dedicated_equipment === "knows_size" && answers.dedicated_amperage === "15a_120v");
  if (!isFifteenAmp
    || !ACCESSIBLE_PATHS.has(answers.dedicated_route_access ?? "")
    || !DISTANCE_BANDS.has(answers.dedicated_distance ?? "")
    || !["accepted", "review_first"].includes(answers.dedicated_finish_ack ?? "")) {
    return null;
  }
  return { circuitAmps: 15, cableRole: "WIRE_14_2" };
}
