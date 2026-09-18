/**
 * Assembling a takeoff from what one contractor has actually declared.
 *
 * The only file in this chain that touches the database. Everything it loads
 * is tenant-scoped by an explicit contractorId — there is no findFirst on a
 * slug here, because an unscoped lookup returning another contractor's
 * configuration is the exact defect this workstream already shipped once.
 *
 * It loads, it does not decide. Every gap it finds comes back named.
 */
import type { PrismaClient } from "@prisma/client";
import {
  computeMaterialTakeoff, type MaterialTakeoff, type ProductSelection,
  type RecipeLine, type SelectedComponent,
} from "./materialTakeoff";
import {
  SURFACE_ROLES, SURFACE_ROLE_DIVISIBILITY, surfaceRacewayRequiredClasses,
} from "./surfaceRacewayTakeoff";
import {
  deriveFromSystem, SURFACE_RACEWAY_SYSTEM_KEY,
  type DeclaredPolicy, type DeclaredSystem,
} from "./surfaceSystemConfiguration";

export async function loadSurfaceTakeoff(
  db: PrismaClient,
  contractorId: string,
  args: { components: SelectedComponent[]; routeFeet: number; turnCount: number },
): Promise<MaterialTakeoff> {
  const recipeRows = await db.canonicalComponentMaterial.findMany({
    select: { quantity: true, canonicalComponent: { select: { key: true } },
              canonicalMaterial: { select: { key: true, unit: true } } } });
  const recipes: RecipeLine[] = recipeRows.map((r) => ({
    componentKey: r.canonicalComponent.key, role: r.canonicalMaterial.key,
    perUnit: r.quantity, unit: r.canonicalMaterial.unit }));

  const systemRow = await db.contractorMaterialSystem.findUnique({
    where: { contractorId_systemKey: { contractorId, systemKey: SURFACE_RACEWAY_SYSTEM_KEY } },
    select: {
      systemKey: true, declaredSystemLabel: true, groundingStrategy: true,
      supportSpacingFt: true, supportAtEachTerminus: true,
      sourceTermination: true, destinationTermination: true, declaredAt: true,
      sourceTerminationMaterial: { select: { key: true } },
      destinationTerminationMaterial: { select: { key: true } },
    } });

  const system: DeclaredSystem | null = systemRow ? {
    systemKey: systemRow.systemKey,
    declaredSystemLabel: systemRow.declaredSystemLabel,
    groundingStrategy: systemRow.groundingStrategy,
    supportSpacingFt: systemRow.supportSpacingFt,
    supportAtEachTerminus: systemRow.supportAtEachTerminus,
    sourceTermination: systemRow.sourceTermination,
    sourceTerminationRole: systemRow.sourceTerminationMaterial?.key ?? null,
    destinationTermination: systemRow.destinationTermination,
    destinationTerminationRole: systemRow.destinationTerminationMaterial?.key ?? null,
    declaredAt: systemRow.declaredAt,
  } : null;

  const policyRows = await db.contractorPolicyValue.findMany({
    where: { contractorId },
    select: { key: true, choice: true, measurement: true, resolvedAt: true } });
  const policies: DeclaredPolicy[] = policyRows;

  const derived = deriveFromSystem({ routeFeet: args.routeFeet, system, policies });

  // Product selections, scoped to this contractor. A row with no package
  // geometry is NOT a selection — it is the empty slot provisioning created,
  // and treating it as one would price a product nobody chose.
  const materialRows = await db.contractorMaterial.findMany({
    where: { contractorId, packageQuantity: { not: null }, packagePriceCents: { not: null } },
    select: { packageQuantity: true, packageUnit: true, packagePriceCents: true,
              nameOverride: true, canonicalMaterial: { select: { key: true } } } });
  const selections: ProductSelection[] = materialRows.map((m) => ({
    role: m.canonicalMaterial.key,
    packageQuantity: m.packageQuantity as number,
    packageUnit: m.packageUnit ?? "each",
    packagePriceCents: m.packagePriceCents as number,
    productLabel: m.nameOverride,
  }));

  const takeoff = computeMaterialTakeoff({
    components: args.components,
    recipes,
    selections,
    shape: { turnCount: args.turnCount },
    divisibility: [...SURFACE_ROLE_DIVISIBILITY, ...derived.extraDivisibility],
    requiredClasses: surfaceRacewayRequiredClasses({
      components: args.components,
      conductors: derived.conductors,
      resolvedClasses: derived.resolvedClasses,
    }),
    segmentation: { linearRole: SURFACE_ROLES.channel, jointRole: SURFACE_ROLES.joint },
    conductors: derived.conductors,
    derivedRequirements: derived.derivedRequirements,
  });

  // The derivation's own gaps are part of this takeoff's unresolved set, and
  // they must suppress completeness exactly like any other. Recomputing the
  // flag rather than trusting the one computed before these were merged.
  const unresolvedRequirements = [...takeoff.unresolvedRequirements, ...derived.gaps];
  return {
    ...takeoff,
    unresolvedRequirements,
    purchaseComplete: takeoff.purchaseComplete && derived.gaps.length === 0,
  };
}
