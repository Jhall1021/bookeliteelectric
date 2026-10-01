import type { PrismaClient } from "@prisma/client";
import { framingCrossingCount } from "../laborOperations";
import { suggestConfigurationPrice, type JobConfiguration } from "../pricing";
import { resolvePricingSettings } from "../pricingSettingsState";
import { CONCEALED_BRANCH_CABLE_CHOICES, CONCEALED_ROUTE_POLICY_KEYS } from "./concealedRouteMaterialConfiguration";

export const EXTERIOR_WALL_INCREMENT_FEET = 3;
export const EXTERIOR_WALL_INCREMENT_OPERATION_KEYS = [
  "ELEC_FISH_CABLE_CONCEALED",
  "ELEC_DRILL_FRAMING_CROSSING",
  "ELEC_CUT_DRYWALL_ACCESS_OPENING",
] as const;

type HoursByOperation = Partial<Record<(typeof EXTERIOR_WALL_INCREMENT_OPERATION_KEYS)[number], number>>;

export function exteriorWallIncrementLabor(args: {
  hoursByOperation: HoursByOperation;
  framingSpacingInches: number;
}) {
  const fish = args.hoursByOperation.ELEC_FISH_CABLE_CONCEALED;
  const drill = args.hoursByOperation.ELEC_DRILL_FRAMING_CROSSING;
  const opening = args.hoursByOperation.ELEC_CUT_DRYWALL_ACCESS_OPENING;
  if (fish === undefined || drill === undefined || opening === undefined) return null;
  const crossingCount = framingCrossingCount(EXTERIOR_WALL_INCREMENT_FEET, args.framingSpacingInches);
  return {
    crossingCount,
    laborHours:
      (EXTERIOR_WALL_INCREMENT_FEET * fish) +
      (crossingCount * drill) +
      (crossingCount * opening),
  };
}

export async function priceExteriorWallFinishedIncrement(
  db: PrismaClient,
  contractorId: string,
  service: {
    materialMultiplier: number | null;
    laborCrewType: string | null;
  },
) {
  const [operations, policies, settings] = await Promise.all([
    db.contractorLaborOperationDecision.findMany({
      where: { contractorId, trade: "electrical", operationKey: { in: [...EXTERIOR_WALL_INCREMENT_OPERATION_KEYS] } },
      select: { operationKey: true, hoursPerUnit: true },
    }),
    db.contractorPolicyValue.findMany({
      where: {
        contractorId,
        key: { in: [CONCEALED_ROUTE_POLICY_KEYS.cableRole, CONCEALED_ROUTE_POLICY_KEYS.drywallFramingSpacing] },
        resolvedAt: { not: null },
      },
      select: { key: true, choice: true, measurement: true },
    }),
    db.pricingSettings.findUnique({
      where: { contractorId },
      select: {
        crewHourRateCents: true,
        electricianHourRateCents: true,
        primaryMinimumCents: true,
        roundingIncrementCents: true,
        defaultPermitAdminCents: true,
      },
    }),
  ]);
  const byPolicy = new Map(policies.map((policy) => [policy.key, policy]));
  const cableRole = byPolicy.get(CONCEALED_ROUTE_POLICY_KEYS.cableRole)?.choice;
  const spacing = byPolicy.get(CONCEALED_ROUTE_POLICY_KEYS.drywallFramingSpacing)?.measurement;
  if (!CONCEALED_BRANCH_CABLE_CHOICES.includes(cableRole as typeof CONCEALED_BRANCH_CABLE_CHOICES[number])) return null;
  if (spacing === null || spacing === undefined || spacing <= 0) return null;
  const selectedCableRole = cableRole as typeof CONCEALED_BRANCH_CABLE_CHOICES[number];

  const labor = exteriorWallIncrementLabor({
    hoursByOperation: Object.fromEntries(operations.map((operation) => [operation.operationKey, operation.hoursPerUnit])),
    framingSpacingInches: spacing,
  });
  if (!labor) return null;

  const material = await db.contractorMaterial.findFirst({
    where: { contractorId, canonicalMaterial: { key: selectedCableRole } },
    select: { unitCostCents: true },
  });
  if (!material) return null;

  const pricing = resolvePricingSettings(settings, {
    isPrimary: false,
    isPrimaryEligible: false,
    // This is a marginal routing increment, not a second permitted service.
    servicePermitAdminEstablished: true,
  });
  if (pricing.kind !== "COMPLETE") return null;

  const breakdown = suggestConfigurationPrice(
    {
      accessClass: null,
      accessBySlot: {},
      fieldLaborHours: labor.laborHours,
      materialCostCents: Math.round(material.unitCostCents * EXTERIOR_WALL_INCREMENT_FEET),
      estimatedMinutes: null,
      techCount: 1,
      components: [],
      awaitingComponentApproval: false,
      awaitingComponentMaterialCost: false,
      awaitingComponentLabor: false,
      addedCrewHours: 0,
      approvedIncrementCents: 0,
      legacyModifierCents: 0,
    } satisfies JobConfiguration,
    {
      materialMultiplier: service.materialMultiplier,
      permitAdminCents: 0,
      otherDirectCostCents: 0,
      isPrimaryEligible: false,
      laborCrewType: service.laborCrewType,
    },
    pricing.settings,
    false,
  );
  if (breakdown.totalCents === null) return null;
  return {
    cents: breakdown.totalCents,
    laborHours: labor.laborHours,
    crossingCount: labor.crossingCount,
    cableRole: selectedCableRole,
    cableFeet: EXTERIOR_WALL_INCREMENT_FEET,
  };
}
