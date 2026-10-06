import { isDedicatedCircuitAccessibleRoute, isDedicatedCircuitFinishedRoute } from "./dedicatedCircuitAccess";

export type DedicatedCircuitAnswers = Record<string, string | undefined>;

export type ReviewedDedicatedCircuitPackage = {
  circuitAmps: 15 | 20;
  cableRole: "WIRE_14_2" | "WIRE_12_2";
  breakerRole: "BREAKER_SINGLE_POLE_15A" | "BREAKER_SINGLE_POLE_20A";
  receptacleRole: "RECEPTACLE_STANDARD" | "GFCI_INTERIOR_20A";
  requiresSumpPumpProtectionConfirmation: boolean;
};

const DISTANCE_BANDS = new Set(["under_25", "25_to_50"]);
const FIFTEEN_AMP_EQUIPMENT = new Set(["fridge_freezer", "bidet"]);

function hasSupportedDistance(value: string | undefined): boolean {
  if (DISTANCE_BANDS.has(value ?? "")) return true;
  const feet = Number(value);
  return Number.isFinite(feet) && feet >= 1 && feet <= 50;
}

/**
 * Identifies the one dedicated-circuit envelope whose labor and materials are
 * currently complete enough for contractor-reviewed calculation. This is
 * intentionally shared by the dashboard and write endpoint so displaying the
 * calculator can never make a broader promise than the server will honor.
 *
 * The sump-pump path is the only 20A package currently complete: it has its
 * own exact breaker, cable, GFCI endpoint and contractor-only protection fact.
 * Other 20A appliances remain closed because their endpoint requirements vary.
 */
export function resolveReviewedDedicatedCircuitPackage(
  answers: DedicatedCircuitAnswers,
): ReviewedDedicatedCircuitPackage | null {
  const equipment = answers.dedicated_equipment ?? "";
  const isFifteenAmp = FIFTEEN_AMP_EQUIPMENT.has(equipment)
    || (answers.dedicated_equipment === "knows_size" && answers.dedicated_amperage === "15a_120v");
  const isSumpPump = equipment === "sump_pump";
  if ((!isFifteenAmp && !isSumpPump)
    || (!isDedicatedCircuitAccessibleRoute(answers.dedicated_route_access)
      && !isDedicatedCircuitFinishedRoute(answers.dedicated_route_access))
    || !hasSupportedDistance(answers.dedicated_distance)
    || !["accepted", "review_first"].includes(answers.dedicated_finish_ack ?? "")) {
    return null;
  }
  return isSumpPump
    ? { circuitAmps: 20, cableRole: "WIRE_12_2", breakerRole: "BREAKER_SINGLE_POLE_20A", receptacleRole: "GFCI_INTERIOR_20A", requiresSumpPumpProtectionConfirmation: true }
    : { circuitAmps: 15, cableRole: "WIRE_14_2", breakerRole: "BREAKER_SINGLE_POLE_15A", receptacleRole: "RECEPTACLE_STANDARD", requiresSumpPumpProtectionConfirmation: false };
}
