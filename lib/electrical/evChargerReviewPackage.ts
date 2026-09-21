export type ReviewedEvChargerConfiguration = {
  outputAmps: 40;
  circuitAmps: 50;
  breakerRole: "BREAKER_DOUBLE_POLE_50A";
  wireRole: "WIRE_6_2";
};

export const REVIEWED_EV_CHARGER_CONFIGURATION: ReviewedEvChargerConfiguration = {
  outputAmps: 40,
  circuitAmps: 50,
  breakerRole: "BREAKER_DOUBLE_POLE_50A",
  wireRole: "WIRE_6_2",
};

const ACCESSIBLE_PATHS = new Set(["unfinished_basement", "drop_ceiling", "accessible_attic", "combination"]);
const DISTANCE_BANDS = new Set(["under_25", "25_to_50"]);

/** Homeowner answers establish only a candidate package. The contractor must
 * confirm the charger's instructions, circuit rating, panel and actual route. */
export function reviewedEvChargerConfiguration(
  serviceSlug: string,
  answers: Record<string, string | undefined>,
): ReviewedEvChargerConfiguration | null {
  if (serviceSlug !== "level-2-ev-charger") return null;
  if (answers.ev_charger_equipment !== "customer_supplied_hardwired") return null;
  if (answers.ev_charger_location !== "attached_garage_interior") return null;
  if (!ACCESSIBLE_PATHS.has(answers.ev_charger_route_access ?? "")) return null;
  if (!DISTANCE_BANDS.has(answers.ev_charger_distance ?? "")) return null;
  return REVIEWED_EV_CHARGER_CONFIGURATION;
}
