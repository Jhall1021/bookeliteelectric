import type { Service } from "@prisma/client";

import {
  applyBranch,
  startConfiguration,
  suggestConfigurationPrice,
  type PricingSettings,
} from "@/lib/pricing";

export const MICROWAVE_HOOD_OPERATION_KEYS = [
  "ELEC_REMOVE_EXISTING_RANGE_HOOD",
  "ELEC_ADD_RECEPTACLE_FROM_HOOD_FEED",
] as const;

export const MICROWAVE_HOOD_MATERIAL_KEYS = [
  "BOX_OLD_WORK",
  "RECEPTACLE_STANDARD",
  "WALL_PLATE",
] as const;

type MicrowaveServicePricing = Pick<
  Service,
  | "fieldLaborHours"
  | "materialCostCents"
  | "estimatedMinutes"
  | "requiresTechCount"
  | "materialMultiplier"
  | "permitAdminCents"
  | "otherDirectCostCents"
  | "isPrimaryEligible"
  | "laborCrewType"
>;

export function calculateMicrowaveHoodConversionPricing({
  service,
  settings,
  laborHoursByOperation,
  materialCostByKey,
}: {
  service: MicrowaveServicePricing;
  settings: PricingSettings;
  laborHoursByOperation: ReadonlyMap<string, number>;
  materialCostByKey: ReadonlyMap<string, number>;
}) {
  const missingLabor = MICROWAVE_HOOD_OPERATION_KEYS.filter(
    (key) => laborHoursByOperation.get(key) == null,
  );
  const missingMaterials = MICROWAVE_HOOD_MATERIAL_KEYS.filter(
    (key) => materialCostByKey.get(key) == null,
  );
  if (missingLabor.length || missingMaterials.length) {
    throw new Error(
      `Microwave hood conversion inputs are incomplete: ${[
        ...missingLabor.map((key) => `labor:${key}`),
        ...missingMaterials.map((key) => `material:${key}`),
      ].join(", ")}`,
    );
  }

  const addFieldLaborHours = MICROWAVE_HOOD_OPERATION_KEYS.reduce(
    (sum, key) => sum + laborHoursByOperation.get(key)!,
    0,
  );
  const addMaterialCostCents = MICROWAVE_HOOD_MATERIAL_KEYS.reduce(
    (sum, key) => sum + materialCostByKey.get(key)!,
    0,
  );
  const addScheduleMinutes = Math.ceil(addFieldLaborHours * 60);

  const base = startConfiguration(service);
  const configured = applyBranch(base, {
    addFieldLaborHours,
    addMaterialCostCents,
    addScheduleMinutes,
  });
  const baseSuggestion = suggestConfigurationPrice(base, service, settings, true);
  const configuredSuggestion = suggestConfigurationPrice(configured, service, settings, true);
  if (baseSuggestion.totalCents == null || configuredSuggestion.totalCents == null) {
    throw new Error("Microwave hood conversion cannot be priced from the established service inputs");
  }

  return {
    addFieldLaborHours,
    addMaterialCostCents,
    addScheduleMinutes,
    priceModifierCents: configuredSuggestion.totalCents - baseSuggestion.totalCents,
  };
}
