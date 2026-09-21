export type Garage240vConfiguration = {
  amperage: "30" | "50";
  prongs: "3" | "4";
  receptacleRole: "RECEPTACLE_6_30" | "RECEPTACLE_14_30" | "RECEPTACLE_6_50" | "RECEPTACLE_14_50";
  breakerRole: "BREAKER_DOUBLE_POLE_30A" | "BREAKER_DOUBLE_POLE_50A";
  wireRole: "WIRE_10_2" | "WIRE_10_3" | "WIRE_6_2" | "WIRE_6_3";
};

export const GARAGE_240V_CONFIG_BY_SLUG: Readonly<Record<string, Garage240vConfiguration>> = {
  "240v-garage-outlet": { amperage: "30", prongs: "3", receptacleRole: "RECEPTACLE_6_30", breakerRole: "BREAKER_DOUBLE_POLE_30A", wireRole: "WIRE_10_2" },
  "240v-garage-outlet-14-30": { amperage: "30", prongs: "4", receptacleRole: "RECEPTACLE_14_30", breakerRole: "BREAKER_DOUBLE_POLE_30A", wireRole: "WIRE_10_3" },
  "240v-garage-outlet-6-50": { amperage: "50", prongs: "3", receptacleRole: "RECEPTACLE_6_50", breakerRole: "BREAKER_DOUBLE_POLE_50A", wireRole: "WIRE_6_2" },
  "240v-garage-outlet-14-50": { amperage: "50", prongs: "4", receptacleRole: "RECEPTACLE_14_50", breakerRole: "BREAKER_DOUBLE_POLE_50A", wireRole: "WIRE_6_3" },
};

export function reviewedGarage240vConfiguration(serviceSlug: string, answers: Record<string, string>): Garage240vConfiguration | null {
  const config = GARAGE_240V_CONFIG_BY_SLUG[serviceSlug];
  if (!config || answers.garage_panel !== "in_garage" || answers.garage_wall !== "open" || answers.garage_spaces !== "two_free") return null;
  if (answers.garage_amperage !== `a${config.amperage}`) return null;
  if (answers[`garage_prongs_${config.amperage}`] !== `p${config.prongs}`) return null;
  return config;
}
