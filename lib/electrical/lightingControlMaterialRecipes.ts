export type LightingControlMaterialLine = {
  role: string;
  quantity: number;
};

export type LightingControlMaterialRecipe = {
  componentKey: string;
  evidence: string;
  lines: readonly LightingControlMaterialLine[];
};

const STANDARD_SWITCH_PACKAGE = [
  { role: "BOX_OLD_WORK", quantity: 1 },
  { role: "SWITCH_STANDARD", quantity: 1 },
  { role: "WALL_PLATE", quantity: 1 },
] as const;

/**
 * Physical material consumed by the bounded new-switch branches in the shared
 * lighting-control module. Wire is always expressed in feet. A band uses its
 * upper bound so the published package cannot understate material. Accessible
 * cable supports follow the rehearsal's reviewed 4.5-foot spacing plus both
 * terminations: 10 ft -> 4, 20 ft -> 6, and 25 ft -> 7.
 *
 * CONSUMABLES_SMALL is intentionally absent: every service hosting this module
 * already carries one base consumables allowance, so adding it here would
 * charge the same job-level package twice.
 */
export const LIGHTING_CONTROL_MATERIAL_RECIPES: readonly LightingControlMaterialRecipe[] = [
  {
    componentKey: "SWITCHLEG_ACCESSIBLE_UNDER_10",
    evidence: "standard new single-pole switch; route band priced at its 10-foot upper bound; accessible supports included",
    lines: [
      { role: "WIRE_14_2", quantity: 10 },
      { role: "NM_CABLE_SUPPORT", quantity: 4 },
      ...STANDARD_SWITCH_PACKAGE,
    ],
  },
  {
    componentKey: "SWITCHLEG_ACCESSIBLE_10_20",
    evidence: "standard new single-pole switch; route band priced at its 20-foot upper bound; accessible supports included",
    lines: [
      { role: "WIRE_14_2", quantity: 20 },
      { role: "NM_CABLE_SUPPORT", quantity: 6 },
      ...STANDARD_SWITCH_PACKAGE,
    ],
  },
  {
    componentKey: "SWITCHLEG_FINISHED_UNDER_10",
    evidence: "same standard switch package and 10-foot wire allowance; finished-wall premium is labor, not extra physical parts",
    lines: [
      { role: "WIRE_14_2", quantity: 10 },
      ...STANDARD_SWITCH_PACKAGE,
    ],
  },
  {
    componentKey: "SWITCHLEG_FINISHED_10_20",
    evidence: "same standard switch package and 20-foot wire allowance; finished-wall premium is labor, not extra physical parts",
    lines: [
      { role: "WIRE_14_2", quantity: 20 },
      ...STANDARD_SWITCH_PACKAGE,
    ],
  },
  {
    componentKey: "SWITCH_POWER_RUN_ACCESSIBLE",
    evidence: "workbook standard accessible route is 25 feet; a new standard single-pole switch and accessible supports are required",
    lines: [
      { role: "WIRE_14_2", quantity: 25 },
      { role: "NM_CABLE_SUPPORT", quantity: 7 },
      ...STANDARD_SWITCH_PACKAGE,
    ],
  },
  {
    componentKey: "SWITCH_POWER_RUN_FINISHED",
    evidence: "workbook standard route is 25 feet; same new switch package, with finished-wall cost carried by labor rather than invented parts",
    lines: [
      { role: "WIRE_14_2", quantity: 25 },
      ...STANDARD_SWITCH_PACKAGE,
    ],
  },
] as const;
