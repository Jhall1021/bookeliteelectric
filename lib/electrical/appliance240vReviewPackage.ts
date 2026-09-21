export type Appliance240vConfiguration = {
  appliance: "dryer" | "range";
  amperage: 30 | 50;
  receptacleRole: "RECEPTACLE_14_30" | "RECEPTACLE_14_50";
  breakerRole: "BREAKER_DOUBLE_POLE_30A" | "BREAKER_DOUBLE_POLE_50A";
  wireRole: "WIRE_10_3" | "WIRE_6_3";
};

export const APPLIANCE_240V_CONFIG_BY_APPLIANCE: Readonly<Record<"dryer" | "range", Appliance240vConfiguration>> = {
  dryer: {
    appliance: "dryer", amperage: 30,
    receptacleRole: "RECEPTACLE_14_30", breakerRole: "BREAKER_DOUBLE_POLE_30A", wireRole: "WIRE_10_3",
  },
  range: {
    appliance: "range", amperage: 50,
    receptacleRole: "RECEPTACLE_14_50", breakerRole: "BREAKER_DOUBLE_POLE_50A", wireRole: "WIRE_6_3",
  },
};

const ACCESSIBLE_PATHS = new Set(["unfinished_basement", "drop_ceiling", "accessible_attic", "combination"]);
const DISTANCE_BANDS = new Set(["under_25", "25_to_50"]);

/** Homeowner answers identify only a candidate four-wire plug-in package.
 * Equipment instructions, panel suitability and actual route remain contractor facts. */
export function reviewedAppliance240vConfiguration(
  serviceSlug: string,
  answers: Record<string, string | undefined>,
): Appliance240vConfiguration | null {
  if (serviceSlug !== "new-240v-appliance-circuit") return null;
  const appliance = answers.appliance_240v_type;
  if (appliance !== "dryer" && appliance !== "range") return null;
  const config = APPLIANCE_240V_CONFIG_BY_APPLIANCE[appliance];
  if (answers.appliance_240v_connection !== "four_prong_plug") return null;
  if (answers.appliance_240v_endpoint !== "surface_box") return null;
  if (!ACCESSIBLE_PATHS.has(answers.appliance_240v_route_access ?? "")) return null;
  if (!DISTANCE_BANDS.has(answers.appliance_240v_distance ?? "")) return null;
  return config;
}
