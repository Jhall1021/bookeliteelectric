/**
 * Assembling a derived scope price from one contractor's real state.
 *
 * The only file in the derived chain that touches the database. Every read is
 * scoped by an explicit contractorId — the unscoped-lookup defect this
 * workstream already shipped once is not repeated here.
 */
import type { PrismaClient } from "@prisma/client";
import { loadSurfaceTakeoff } from "./loadSurfaceTakeoff";
import { SURFACE_RACEWAY_SYSTEM_KEY, POLICY_KEYS } from "./surfaceSystemConfiguration";
import {
  fingerprintBasis, type DerivedPricingBasis,
} from "./derivedPricingBasis";
import {
  priceDerivedScope, type DerivedScopeResult, type ScopeComponent,
} from "./derivedScopePricing";
import type { PricingContext } from "../pricingSettingsState";

/**
 * Collect exactly the inputs that can move this contractor's derived price.
 *
 * Everything here is price-relevant. Nothing here is a name, a label, a note
 * or a timestamp — see derivedPricingBasis for why that exclusion is as
 * important as the inclusion.
 */
export async function loadDerivedPricingBasis(
  db: PrismaClient,
  contractorId: string,
  componentKeys: string[],
): Promise<DerivedPricingBasis> {
  const components = await db.canonicalComponent.findMany({
    where: { key: { in: componentKeys } }, select: { id: true, key: true } });

  const own = await db.contractorComponent.findMany({
    where: { contractorId, canonicalComponentId: { in: components.map((c) => c.id) } },
    select: { canonicalComponentId: true, addFieldLaborHours: true } });
  const laborById = new Map(own.map((o) => [o.canonicalComponentId, o.addFieldLaborHours]));

  // A component with NO contractor row is unestablished labor, not absent from
  // the basis: approving a scope has to cover the fact that it was unset.
  const componentLabor = components.map((c) => ({
    componentKey: c.key,
    addFieldLaborHours: laborById.has(c.id) ? (laborById.get(c.id) as number | null) : null,
  }));

  const materials = (await db.contractorMaterial.findMany({
    where: { contractorId },
    select: {
      unitCostCents: true, packageQuantity: true, packageUnit: true,
      packagePriceCents: true, activeSupplierLinkId: true,
      canonicalMaterial: { select: { key: true } },
    } })).map((m) => ({
      role: m.canonicalMaterial.key,
      unitCostCents: m.unitCostCents,
      packageQuantity: m.packageQuantity,
      packageUnit: m.packageUnit,
      packagePriceCents: m.packagePriceCents,
      activeSupplierLinkId: m.activeSupplierLinkId,
    }));

  const systems = (await db.contractorMaterialSystem.findMany({
    where: { contractorId },
    select: {
      systemKey: true, groundingStrategy: true, supportSpacingFt: true,
      supportAtEachTerminus: true, sourceTermination: true, destinationTermination: true,
      sourceTerminationMaterial: { select: { key: true } },
      destinationTerminationMaterial: { select: { key: true } },
    } })).map((s) => ({
      systemKey: s.systemKey,
      groundingStrategy: s.groundingStrategy,
      supportSpacingFt: s.supportSpacingFt,
      supportAtEachTerminus: s.supportAtEachTerminus,
      sourceTermination: s.sourceTermination,
      sourceTerminationRole: s.sourceTerminationMaterial?.key ?? null,
      destinationTermination: s.destinationTermination,
      destinationTerminationRole: s.destinationTerminationMaterial?.key ?? null,
    }));

  // Only the policies this pricing path reads. A contractor's height
  // breakpoints for a different service cannot move this price and must not
  // invalidate this approval.
  const policies = (await db.contractorPolicyValue.findMany({
    where: { contractorId, key: { in: Object.values(POLICY_KEYS) } },
    select: { key: true, choice: true, measurement: true, resolvedAt: true } })).map((p) => ({
      key: p.key, choice: p.choice, measurement: p.measurement, resolved: p.resolvedAt !== null,
    }));

  const st = await db.pricingSettings.findUnique({
    where: { contractorId },
    select: { crewHourRateCents: true, primaryMinimumCents: true,
              roundingIncrementCents: true, defaultPermitAdminCents: true } });

  const recipe = (await db.canonicalComponentMaterial.findMany({
    where: { canonicalComponent: { key: { in: componentKeys } } },
    select: { quantity: true, canonicalComponent: { select: { key: true } },
              canonicalMaterial: { select: { key: true } } } })).map((r) => ({
      componentKey: r.canonicalComponent.key,
      role: r.canonicalMaterial.key,
      perUnit: r.quantity,
    }));

  return {
    componentLabor, materials, systems, policies, recipe,
    settings: st ?? {
      crewHourRateCents: null, primaryMinimumCents: null,
      roundingIncrementCents: null, defaultPermitAdminCents: null,
    },
  };
}

export async function loadAndPriceDerivedScope(
  db: PrismaClient,
  args: {
    contractorId: string;
    serviceId: string;
    components: { key: string; quantity: number }[];
    routeFeet: number;
    turnCount: number;
    context: PricingContext;
    service: {
      materialMultiplier: number | null;
      permitAdminCents: number | null;
      otherDirectCostCents: number | null;
      isPrimaryEligible: boolean;
    };
  },
): Promise<DerivedScopeResult & { basisFingerprint?: string }> {
  const { contractorId, serviceId } = args;
  const componentKeys = args.components.map((c) => c.key);

  const takeoff = await loadSurfaceTakeoff(db, contractorId, {
    components: args.components, routeFeet: args.routeFeet, turnCount: args.turnCount });

  const basis = await loadDerivedPricingBasis(db, contractorId, componentKeys);
  const currentBasisFingerprint = fingerprintBasis(basis);

  const laborByKey = new Map(basis.componentLabor.map((c) => [c.componentKey, c.addFieldLaborHours]));
  const scopeComponents: ScopeComponent[] = args.components.map((c) => ({
    key: c.key,
    quantity: c.quantity,
    addFieldLaborHours: laborByKey.has(c.key) ? (laborByKey.get(c.key) as number | null) : null,
  }));

  const approval = await db.contractorDerivedPricingApproval.findUnique({
    where: { contractorId_serviceId: { contractorId, serviceId } },
    select: { approvedBasisFingerprint: true } });

  const result = priceDerivedScope({
    components: scopeComponents,
    takeoff,
    settingsRow: basis.settings,
    context: args.context,
    service: args.service,
    approval,
    currentBasisFingerprint,
  });

  // The fingerprint travels with a refusal too: an admin screen offering
  // "approve these economics" needs to know WHICH economics it is offering.
  return { ...result, basisFingerprint: currentBasisFingerprint };
}
