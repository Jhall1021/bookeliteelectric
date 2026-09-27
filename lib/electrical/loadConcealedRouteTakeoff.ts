import type { PrismaClient } from "@prisma/client";
import {
  computeConcealedRouteMaterialTakeoff,
  CONCEALED_BRANCH_CABLE_CHOICES,
  CONCEALED_ROUTE_POLICY_KEYS,
  type ConcealedBranchCableRole,
  type ConcealedEndpoint,
} from "./concealedRouteMaterialConfiguration";
import type { SelectedComponent } from "./materialTakeoff";

export function concealedEndpoint(components: SelectedComponent[]): ConcealedEndpoint | null {
  const keys = new Set(components.map((component) => component.key));
  if (keys.has("FIXTURE_BOX_ENDPOINT") && keys.has("CEILING_FAN_INSTALL_CORE")) return "CEILING_FAN";
  if (keys.has("OUTLET_EXTENSION_CORE")) return "OUTLET";
  if (keys.has("SWITCH_ENDPOINT_CORE")) return "SWITCH";
  return null;
}

export async function loadConcealedRouteTakeoff(
  db: PrismaClient,
  contractorId: string,
  components: SelectedComponent[],
) {
  const endpoint = concealedEndpoint(components);
  if (!endpoint) throw new Error("Concealed route material takeoff requires an outlet or switch endpoint");

  const [policyRows, materialRows] = await Promise.all([
    db.contractorPolicyValue.findMany({
      where: { contractorId, key: { in: Object.values(CONCEALED_ROUTE_POLICY_KEYS) } },
      select: { key: true, choice: true, measurement: true, resolvedAt: true },
    }),
    db.contractorMaterial.findMany({
      where: { contractorId },
      select: {
        unitCostCents: true, packageQuantity: true, packageUnit: true, packagePriceCents: true, nameOverride: true,
        canonicalMaterial: { select: { key: true, unit: true } },
      },
    }),
  ]);
  const resolved = new Map(policyRows.filter((row) => row.resolvedAt !== null).map((row) => [row.key, row]));
  const cableChoice = resolved.get(CONCEALED_ROUTE_POLICY_KEYS.cableRole)?.choice ?? null;
  const cableRole = CONCEALED_BRANCH_CABLE_CHOICES.includes(cableChoice as ConcealedBranchCableRole)
    ? cableChoice as ConcealedBranchCableRole
    : null;

  return computeConcealedRouteMaterialTakeoff({
    components,
    endpoint,
    configuration: {
      cableRole,
      slackPerTerminationFt: resolved.get(CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination)?.measurement ?? null,
      backToBackCableAllowanceFt: resolved.get(CONCEALED_ROUTE_POLICY_KEYS.backToBackCableAllowance)?.measurement ?? null,
      supportSpacingFt: resolved.get(CONCEALED_ROUTE_POLICY_KEYS.supportSpacing)?.measurement ?? null,
      supportAtEachTermination: resolved.get(CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination)?.choice === "YES"
        ? true
        : resolved.get(CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination)?.choice === "NO"
          ? false
          : null,
      drywallFramingSpacingInches: resolved.get(CONCEALED_ROUTE_POLICY_KEYS.drywallFramingSpacing)?.measurement ?? null,
    },
    selections: materialRows.map((material) => ({
      role: material.canonicalMaterial.key,
      // Older contractors store the normalized per-use cost without the
      // original package geometry. That is still a complete selection: one
      // normalized unit at unitCostCents. Wire's normalized unit is a foot;
      // boxes and fittings are discrete each. Package geometry wins when it
      // exists, preserving the original purchase basis.
      packageQuantity: material.packageQuantity ?? 1,
      packageUnit: material.packageUnit ?? material.canonicalMaterial.unit,
      packagePriceCents: material.packagePriceCents ?? material.unitCostCents,
      productLabel: material.nameOverride,
    })),
  });
}
