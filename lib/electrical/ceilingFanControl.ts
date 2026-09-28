export const FAN_LIGHT_SPEED_CONTROL_COMPONENT_KEY = "FAN_LIGHT_SPEED_CONTROL_UPGRADE";
export const FAN_LIGHT_SPEED_CONTROL_MATERIAL_KEY = "FAN_LIGHT_SPEED_CONTROL";
export const FAN_REPLACING_EXISTING_LIGHT_SERVICE_KEY = "fan-replacing-light";
export const FAN_SWITCHED_RECEPTACLE_CONVERSION_COMPONENT_KEY = "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE";
export const FAN_SWITCHED_RECEPTACLE_CONVERSION_OPERATION_KEYS = ["ELEC_RECONFIGURE_SWITCHED_RECEPTACLE"] as const;
export const FAN_SWITCH_CONTROL_VALUES_WITH_RECEPTACLE_CONVERSION = ["switched_outlet"] as const;
export const FAN_SWITCH_CONTROL_VALUES_WITH_NEW_SWITCH_LEG = ["switched_outlet", "no_switch"] as const;

export function fanControlNeedsNewSwitchLeg(value: string | undefined): boolean {
  return FAN_SWITCH_CONTROL_VALUES_WITH_NEW_SWITCH_LEG.some((candidate) => candidate === value);
}

export const FAN_SWITCH_LEG_COMPONENTS = {
  under_10: {
    key: "CEILING_FAN_SWITCH_LEG_10_FT_CEILING",
    ceilingFeet: 10,
    wireFeet: 8.5,
  },
  "11_12": {
    key: "CEILING_FAN_SWITCH_LEG_12_FT_CEILING",
    ceilingFeet: 12,
    wireFeet: 10.5,
  },
  "13_14": {
    key: "CEILING_FAN_SWITCH_LEG_14_FT_CEILING",
    ceilingFeet: 14,
    wireFeet: 12.5,
  },
} as const;

export const FAN_SWITCH_LEG_COMPONENT_KEYS: string[] = Object.values(FAN_SWITCH_LEG_COMPONENTS).map((entry) => entry.key);

export function fanSwitchLegComponentKey(height: string | undefined): string | null {
  return height && height in FAN_SWITCH_LEG_COMPONENTS
    ? FAN_SWITCH_LEG_COMPONENTS[height as keyof typeof FAN_SWITCH_LEG_COMPONENTS].key
    : null;
}

export function fanSwitchLegWireFeet(componentKey: string): number | null {
  return Object.values(FAN_SWITCH_LEG_COMPONENTS).find((entry) => entry.key === componentKey)?.wireFeet ?? null;
}

export const FAN_SWITCH_LEG_OPERATION_KEYS = [
  "ELEC_INSTALL_OLD_WORK_BOX",
  "ELEC_DRILL_TOP_OR_BOTTOM_PLATE",
  "ELEC_FISH_WALL_TO_BOX",
  "ELEC_TERMINATE_SWITCH",
] as const;
