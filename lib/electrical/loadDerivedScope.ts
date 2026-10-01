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
import { evaluateSurfaceRouteAtomicLabor, surfaceRouteEndpoint, surfaceRouteOperationKeys } from "./surfaceRouteAtomicLaborBridge";
import { ROUTING_V2_LABOR_AUTHORITY } from "./routingV2LaborAuthority";
import { CONCEALED_ROUTE_POLICY_KEYS } from "./concealedRouteMaterialConfiguration";
import { concealedEndpoint, loadConcealedRouteTakeoff } from "./loadConcealedRouteTakeoff";
import { backToBackOperationKeys, evaluateBackToBackAtomicLabor } from "./backToBackAtomicLaborBridge";
import { accessibleConcealedOperationKeys, evaluateAccessibleConcealedAtomicLabor } from "./accessibleConcealedAtomicLaborBridge";
import { baseboardConcealedOperationKeys, evaluateBaseboardConcealedAtomicLabor } from "./baseboardConcealedAtomicLaborBridge";
import { drywallConcealedOperationKeys, evaluateDrywallConcealedAtomicLabor } from "./drywallConcealedAtomicLaborBridge";
import type { MaterialTakeoff } from "./materialTakeoff";
import type { OutletEndpointMaterialRole } from "./outletLoad";
import { loadGarageEmtTakeoff } from "./loadGarageEmtTakeoff";
import { evaluateGarageEmtAtomicLabor, garageEmtOperationKeys } from "./garageEmtAtomicLaborBridge";
import {
  FAN_SWITCHED_RECEPTACLE_CONVERSION_COMPONENT_KEY,
  FAN_SWITCHED_RECEPTACLE_CONVERSION_OPERATION_KEYS,
  FAN_SWITCH_LEG_COMPONENT_KEYS,
  FAN_SWITCH_LEG_OPERATION_KEYS,
} from "./ceilingFanControl";

const usesAtomicSurfaceLabor = (componentKeys: string[]) => componentKeys.includes("ELEC_ROUTE_SURFACE_MOUNTED");
const usesGarageEmtLabor = (componentKeys: string[]) => componentKeys.includes("ELEC_ROUTE_GARAGE_EMT");
const usesBackToBackLabor = (componentKeys: string[]) => componentKeys.includes("ELEC_ROUTE_BACK_TO_BACK");
const usesAccessibleConcealedLabor = (componentKeys: string[]) => componentKeys.includes("ELEC_ROUTE_ACCESSIBLE_CONCEALED");
const usesBaseboardConcealedLabor = (componentKeys: string[]) => componentKeys.includes("ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS");
const usesDrywallConcealedLabor = (componentKeys: string[]) => componentKeys.includes("ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS");
const usesConcealedTakeoff = (componentKeys: string[]) => componentKeys.some((key) =>
  key === "ELEC_ROUTE_BACK_TO_BACK" || key === "ELEC_ROUTE_ACCESSIBLE_CONCEALED"
  || key === "ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS" || key === "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS");
const ROUTING_V2_COMPONENT_KEYS = new Set(ROUTING_V2_LABOR_AUTHORITY.map((entry) => entry.componentKey));
const UNCONNECTED_ROUTING_V2_COMPONENT_KEYS = new Set(
  ROUTING_V2_LABOR_AUTHORITY.filter((entry) => !entry.runtimeUsesAtomicDecision).map((entry) => entry.componentKey),
);
const usesRoutingV2Labor = (componentKeys: string[]) => componentKeys.some((key) => ROUTING_V2_COMPONENT_KEYS.has(key));

function withFanSupplementalLabor(result: any, componentKeys: string[], basis: DerivedPricingBasis) {
  if (result.kind !== "READY") return result;
  const required = [
    ...(componentKeys.some((key) => FAN_SWITCH_LEG_COMPONENT_KEYS.includes(key)) ? FAN_SWITCH_LEG_OPERATION_KEYS : []),
    ...(componentKeys.includes(FAN_SWITCHED_RECEPTACLE_CONVERSION_COMPONENT_KEY)
      ? FAN_SWITCHED_RECEPTACLE_CONVERSION_OPERATION_KEYS
      : []),
  ];
  if (required.length === 0) return result;
  const hours = new Map((basis.operationLabor ?? []).map((operation) => [operation.operationKey, operation.hoursPerUnit]));
  const missingOperations = required.filter((key) => hours.get(key) === null || hours.get(key) === undefined);
  if (missingOperations.length) {
    return {
      kind: "LABOR_INCOMPLETE" as const,
      evaluation: { kind: "INCOMPLETE" as const, missingOperations, missingQuantities: [], invalidConditions: [] },
      facts: {},
    };
  }
  return {
    ...result,
    hours: result.hours + required.reduce((sum, key) => sum + (hours.get(key) as number), 0),
    quantities: { ...result.quantities, ...Object.fromEntries(required.map((key) => [key, 1])) },
  };
}

function atomicLaborEvaluation(
  componentKeys: string[],
  components: { key: string; quantity: number }[],
  takeoff: MaterialTakeoff,
  basis: DerivedPricingBasis,
) {
  if (usesAtomicSurfaceLabor(componentKeys)) {
    const endpoint = surfaceRouteEndpoint(components);
    return withFanSupplementalLabor(evaluateSurfaceRouteAtomicLabor({
      components,
      takeoff,
      ...(endpoint ? { endpoint } : {}),
      contractorHours: Object.fromEntries((basis.operationLabor ?? []).map((operation) => [operation.operationKey, operation.hoursPerUnit])),
    }), componentKeys, basis);
  }
  if (usesGarageEmtLabor(componentKeys)) {
    return evaluateGarageEmtAtomicLabor({
      components,
      takeoff,
      contractorHours: Object.fromEntries((basis.operationLabor ?? []).map((operation) => [operation.operationKey, operation.hoursPerUnit])),
    });
  }
  if (usesBackToBackLabor(componentKeys)) {
    const endpoint = concealedEndpoint(components);
    if (!endpoint) {
      return {
        kind: "LABOR_INCOMPLETE" as const,
        evaluation: { kind: "INCOMPLETE" as const, missingOperations: [], missingQuantities: ["back-to-back-endpoint"], invalidConditions: [] },
        facts: {},
      };
    }
    const evaluation = evaluateBackToBackAtomicLabor({
      endpoint,
      contractorHours: Object.fromEntries((basis.operationLabor ?? []).map((operation) => [operation.operationKey, operation.hoursPerUnit])),
    });
    return evaluation.kind === "READY"
      ? withFanSupplementalLabor({ kind: "READY" as const, hours: evaluation.hours, quantities: evaluation.quantities, facts: {} }, componentKeys, basis)
      : { kind: "LABOR_INCOMPLETE" as const, evaluation, facts: {} };
  }
  if (usesAccessibleConcealedLabor(componentKeys)) {
    const endpoint = concealedEndpoint(components);
    if (!endpoint) {
      return {
        kind: "LABOR_INCOMPLETE" as const,
        evaluation: { kind: "INCOMPLETE" as const, missingOperations: [], missingQuantities: ["accessible-concealed-endpoint"], invalidConditions: [] },
        facts: {},
      };
    }
    const evaluation = evaluateAccessibleConcealedAtomicLabor({
      endpoint,
      components,
      takeoff,
      contractorHours: Object.fromEntries((basis.operationLabor ?? []).map((operation) => [operation.operationKey, operation.hoursPerUnit])),
    });
    return evaluation.kind === "READY"
      ? withFanSupplementalLabor({ kind: "READY" as const, hours: evaluation.hours, quantities: evaluation.quantities, facts: {} }, componentKeys, basis)
      : { kind: "LABOR_INCOMPLETE" as const, evaluation, facts: {} };
  }
  if (usesBaseboardConcealedLabor(componentKeys)) {
    const endpoint = concealedEndpoint(components);
    if (!endpoint) {
      return {
        kind: "LABOR_INCOMPLETE" as const,
        evaluation: { kind: "INCOMPLETE" as const, missingOperations: [], missingQuantities: ["baseboard-concealed-endpoint"], invalidConditions: [] },
        facts: {},
      };
    }
    const evaluation = evaluateBaseboardConcealedAtomicLabor({
      endpoint,
      components,
      contractorHours: Object.fromEntries((basis.operationLabor ?? []).map((operation) => [operation.operationKey, operation.hoursPerUnit])),
    });
    return evaluation.kind === "READY"
      ? withFanSupplementalLabor({ kind: "READY" as const, hours: evaluation.hours, quantities: evaluation.quantities, facts: {} }, componentKeys, basis)
      : { kind: "LABOR_INCOMPLETE" as const, evaluation, facts: {} };
  }
  if (usesDrywallConcealedLabor(componentKeys)) {
    const endpoint = concealedEndpoint(components);
    if (!endpoint) return { kind: "LABOR_INCOMPLETE" as const, evaluation: { kind: "INCOMPLETE" as const, missingOperations: [], missingQuantities: ["drywall-concealed-endpoint"], invalidConditions: [] }, facts: {} };
    // Ceiling-fan finished routes explicitly use a conservative 16-inch
    // framing count in the customer flow. Other endpoints remain governed by
    // the contractor's declared concealed-route policy.
    const spacing = endpoint === "CEILING_FAN" || componentKeys.includes("GARAGE_FINISHED_CEILING_ROUTE")
      ? 16
      : basis.policies.find((policy) => policy.key === CONCEALED_ROUTE_POLICY_KEYS.drywallFramingSpacing && policy.resolved)?.measurement ?? null;
    const evaluation = evaluateDrywallConcealedAtomicLabor({
      endpoint, components, framingSpacingInches: spacing,
      contractorHours: Object.fromEntries((basis.operationLabor ?? []).map((operation) => [operation.operationKey, operation.hoursPerUnit])),
    });
    return evaluation.kind === "READY"
      ? withFanSupplementalLabor({ kind: "READY" as const, hours: evaluation.hours, quantities: evaluation.quantities, facts: { drywallFramingSpacingInches: spacing } }, componentKeys, basis)
      : { kind: "LABOR_INCOMPLETE" as const, evaluation, facts: { drywallFramingSpacingInches: spacing } };
  }
  const unconnected = componentKeys.filter((key) => UNCONNECTED_ROUTING_V2_COMPONENT_KEYS.has(key));
  if (unconnected.length > 0) {
    return {
      kind: "LABOR_INCOMPLETE" as const,
      evaluation: {
        kind: "INCOMPLETE" as const,
        missingOperations: [],
        missingQuantities: unconnected.map((key) => `route-adapter:${key}`).sort(),
        invalidConditions: [],
      },
      facts: {},
    };
  }
  return null;
}

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
  const routingV2Labor = usesRoutingV2Labor(componentKeys);
  const atomicSurfaceLabor = usesAtomicSurfaceLabor(componentKeys);
  const atomicGarageEmtLabor = usesGarageEmtLabor(componentKeys);
  const atomicBackToBackLabor = usesBackToBackLabor(componentKeys);
  const atomicAccessibleLabor = usesAccessibleConcealedLabor(componentKeys);
  const atomicBaseboardLabor = usesBaseboardConcealedLabor(componentKeys);
  const atomicDrywallLabor = usesDrywallConcealedLabor(componentKeys);
  const componentStubs = componentKeys.map((key) => ({ key, quantity: 1 }));
  const surfaceEndpoint = atomicSurfaceLabor ? surfaceRouteEndpoint(componentStubs) : null;
  const backToBackEndpoint = atomicBackToBackLabor ? concealedEndpoint(componentStubs) : null;
  const accessibleEndpoint = atomicAccessibleLabor ? concealedEndpoint(componentStubs) : null;
  const baseboardEndpoint = atomicBaseboardLabor ? concealedEndpoint(componentStubs) : null;
  const drywallEndpoint = atomicDrywallLabor ? concealedEndpoint(componentStubs) : null;
  // A runtime price normally supplies one route, but the service approval
  // fingerprint deliberately supplies every route the service can offer.
  // Collect the union so one service approval covers all of its configured
  // recipes and changing any route's labor makes that approval stale.
  const operationKeys = [...new Set([
    ...(surfaceEndpoint ? surfaceRouteOperationKeys(surfaceEndpoint) : []),
    ...(atomicGarageEmtLabor ? garageEmtOperationKeys() : []),
    ...(backToBackEndpoint ? backToBackOperationKeys(backToBackEndpoint) : []),
    ...(accessibleEndpoint ? accessibleConcealedOperationKeys(accessibleEndpoint) : []),
    ...(baseboardEndpoint ? baseboardConcealedOperationKeys(baseboardEndpoint) : []),
    ...(drywallEndpoint ? drywallConcealedOperationKeys(drywallEndpoint) : []),
    ...(componentKeys.some((key) => FAN_SWITCH_LEG_COMPONENT_KEYS.includes(key)) ? FAN_SWITCH_LEG_OPERATION_KEYS : []),
    ...(componentKeys.includes(FAN_SWITCHED_RECEPTACLE_CONVERSION_COMPONENT_KEY)
      ? FAN_SWITCHED_RECEPTACLE_CONVERSION_OPERATION_KEYS
      : []),
  ])].sort();
  const componentLabor = routingV2Labor ? [] : components.map((c) => ({
    componentKey: c.key,
    addFieldLaborHours: laborById.has(c.id) ? (laborById.get(c.id) as number | null) : null,
  }));
  const usesAtomicOperationLabor = atomicSurfaceLabor || atomicGarageEmtLabor || atomicBackToBackLabor || atomicAccessibleLabor || atomicBaseboardLabor || atomicDrywallLabor;
  const ownOperationLabor = usesAtomicOperationLabor ? await db.contractorLaborOperationDecision.findMany({
    where: { contractorId, trade: "electrical", operationKey: { in: operationKeys } },
    select: { operationKey: true, hoursPerUnit: true },
  }) : [];
  const operationHours = new Map(ownOperationLabor.map((decision) => [decision.operationKey, decision.hoursPerUnit]));
  const operationLabor = usesAtomicOperationLabor ? operationKeys.map((operationKey) => ({
    operationKey,
    hoursPerUnit: operationHours.get(operationKey) ?? null,
  })) : [];

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

  const systemRows = atomicSurfaceLabor ? await db.contractorMaterialSystem.findMany({
    where: { contractorId, systemKey: SURFACE_RACEWAY_SYSTEM_KEY },
    select: {
      systemKey: true, groundingStrategy: true, supportSpacingFt: true,
      supportAtEachTerminus: true, sourceTermination: true, destinationTermination: true,
      sourceTerminationMaterial: { select: { key: true } },
      destinationTerminationMaterial: { select: { key: true } },
    },
  }) : [];
  const systems = systemRows.map((s) => ({
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
  const relevantPolicyKeys = [...new Set([
    ...(atomicSurfaceLabor ? Object.values(POLICY_KEYS) : []),
    ...(usesConcealedTakeoff(componentKeys) ? Object.values(CONCEALED_ROUTE_POLICY_KEYS) : []),
  ])].sort();
  const policies = (await db.contractorPolicyValue.findMany({
    where: { contractorId, key: { in: relevantPolicyKeys } },
    select: { key: true, choice: true, measurement: true, resolvedAt: true } })).map((p) => ({
      key: p.key, choice: p.choice, measurement: p.measurement, resolved: p.resolvedAt !== null,
    }));

  const st = await db.pricingSettings.findUnique({
    where: { contractorId },
    select: { crewHourRateCents: true, electricianHourRateCents: true,
              fixtureHeight12Percent: true, fixtureHeight14Percent: true, primaryMinimumCents: true,
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
    componentLabor, operationLabor, materials, systems, policies, recipe,
    settings: st ?? {
      crewHourRateCents: null, primaryMinimumCents: null,
      electricianHourRateCents: null, fixtureHeight12Percent: null, fixtureHeight14Percent: null,
      roundingIncrementCents: null, defaultPermitAdminCents: null,
    },
  };
}

/**
 * The economic basis covered by one service-level approval.
 *
 * ContractorDerivedPricingApproval is unique per contractor + service, not per
 * route. Its fingerprint therefore has to cover every canonical component the
 * service can emit. A route-specific fingerprint approved from the review
 * scenario made every other valid route look stale at storefront runtime.
 */
export async function loadDerivedApprovalBasis(
  db: PrismaClient,
  contractorId: string,
  serviceId: string,
  selectedComponentKeys: string[] = [],
): Promise<DerivedPricingBasis> {
  const service = await db.service.findFirst({
    where: { id: serviceId, contractorId },
    select: {
      laborCrewType: true,
      slug: true,
      questions: {
        select: {
          options: {
            select: {
              components: {
                select: { canonicalComponent: { select: { key: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!service) throw new Error("Derived-pricing service not found for contractor");

  const serviceComponentKeys = service.questions.flatMap((question) =>
    question.options.flatMap((option) =>
      option.components.flatMap((component) =>
        component.canonicalComponent ? [component.canonicalComponent.key] : []),
    ),
  );
  const componentKeys = [...new Set([
    ...serviceComponentKeys,
    ...selectedComponentKeys,
    ...(service.slug === "new-ceiling-fan" ? FAN_SWITCH_LEG_COMPONENT_KEYS : []),
  ])].sort();
  return {
    ...(await loadDerivedPricingBasis(db, contractorId, componentKeys)),
    serviceLaborCrewType: service.laborCrewType,
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
    laborMultiplier?: number;
    outletMaterialRole?: OutletEndpointMaterialRole;
    context: PricingContext;
    service: {
      slug?: string;
      materialMultiplier: number | null;
      permitAdminCents: number | null;
      otherDirectCostCents: number | null;
      isPrimaryEligible: boolean;
      laborCrewType?: "ELECTRICIAN" | "ELECTRICIAN_AND_HELPER" | string | null;
    };
  },
): Promise<DerivedScopeResult & { basisFingerprint?: string }> {
  const { contractorId, serviceId } = args;
  const componentKeys = args.components.map((c) => c.key);

  const takeoff = usesGarageEmtLabor(componentKeys)
    ? await loadGarageEmtTakeoff(db, contractorId, args.components)
    : usesConcealedTakeoff(componentKeys)
    ? await loadConcealedRouteTakeoff(db, contractorId, args.components, {
        outletMaterialRole: args.outletMaterialRole
          ?? (args.service.slug === "bidet-smart-toilet-outlet" ? "GFCI_INTERIOR" : undefined),
      })
    : await loadSurfaceTakeoff(db, contractorId, {
        components: args.components,
        routeFeet: args.routeFeet,
        turnCount: args.turnCount,
        outletMaterialRole: args.outletMaterialRole
          ?? (args.service.slug === "bidet-smart-toilet-outlet" ? "GFCI_INTERIOR" : undefined),
      });

  const basis = await loadDerivedPricingBasis(db, contractorId, componentKeys);
  const approvalBasis = await loadDerivedApprovalBasis(db, contractorId, serviceId, componentKeys);
  const currentBasisFingerprint = fingerprintBasis(approvalBasis);

  const laborByKey = new Map(basis.componentLabor.map((c) => [c.componentKey, c.addFieldLaborHours]));
  const scopeComponents: ScopeComponent[] = args.components.map((c) => ({
    key: c.key,
    quantity: c.quantity,
    addFieldLaborHours: laborByKey.has(c.key) ? (laborByKey.get(c.key) as number | null) : null,
  }));
  const atomicLabor = atomicLaborEvaluation(componentKeys, args.components, takeoff, basis);

  const approval = await db.contractorDerivedPricingApproval.findUnique({
    where: { contractorId_serviceId: { contractorId, serviceId } },
    select: { approvedBasisFingerprint: true } });

  const result = priceDerivedScope({
    components: scopeComponents,
    atomicLabor: atomicLabor?.kind === "READY"
      ? { kind: "READY", hours: atomicLabor.hours }
      : atomicLabor?.kind === "LABOR_INCOMPLETE"
        ? {
            kind: "INCOMPLETE",
            missingOperations: atomicLabor.evaluation.missingOperations,
            missingQuantities: atomicLabor.evaluation.missingQuantities,
            invalidConditions: atomicLabor.evaluation.invalidConditions,
          }
        : undefined,
    takeoff,
    settingsRow: basis.settings,
    context: args.context,
    service: args.service,
    approval,
    currentBasisFingerprint,
    laborMultiplier: args.laborMultiplier,
  });

  // The fingerprint travels with a refusal too: an admin screen offering
  // "approve these economics" needs to know WHICH economics it is offering.
  return { ...result, basisFingerprint: currentBasisFingerprint };
}

/**
 * The price THESE economics would produce if the contractor approved them now.
 *
 * Two callers need this and neither can use the real verdict, which refuses
 * with DERIVED_PRICING_NOT_APPROVED before computing anything:
 *
 *   - the review step, which must SHOW the price being approved. Showing
 *     nothing until after approval asks a contractor to approve a blank.
 *   - the approval endpoint, which must refuse to approve an incomplete basis.
 *     The first authenticated HTTP pass approved one — takeoff incomplete,
 *     approval stored, service activated, every route in review.
 *
 * It evaluates the real calculation with an approval that matches the current
 * basis, so every OTHER readiness refusal still stands. It writes nothing and
 * authorises nothing; the customer path never calls it.
 */
export async function proposeDerivedScope(
  db: PrismaClient,
  args: Parameters<typeof loadAndPriceDerivedScope>[1],
): Promise<{ proposal: DerivedScopeResult; basisFingerprint: string }> {
  const componentKeys = args.components.map((c) => c.key);
  const takeoff = usesGarageEmtLabor(componentKeys)
    ? await loadGarageEmtTakeoff(db, args.contractorId, args.components)
    : usesConcealedTakeoff(componentKeys)
    ? await loadConcealedRouteTakeoff(db, args.contractorId, args.components, {
        outletMaterialRole: args.outletMaterialRole
          ?? (args.service.slug === "bidet-smart-toilet-outlet" ? "GFCI_INTERIOR" : undefined),
      })
    : await loadSurfaceTakeoff(db, args.contractorId, {
        components: args.components,
        routeFeet: args.routeFeet,
        turnCount: args.turnCount,
        outletMaterialRole: args.outletMaterialRole
          ?? (args.service.slug === "bidet-smart-toilet-outlet" ? "GFCI_INTERIOR" : undefined),
      });
  const basis = await loadDerivedPricingBasis(db, args.contractorId, componentKeys);
  const approvalBasis = await loadDerivedApprovalBasis(db, args.contractorId, args.serviceId, componentKeys);
  const basisFingerprint = fingerprintBasis(approvalBasis);
  const laborByKey = new Map(basis.componentLabor.map((c) => [c.componentKey, c.addFieldLaborHours]));
  const atomicLabor = atomicLaborEvaluation(args.components.map((component) => component.key), args.components, takeoff, basis);
  const proposal = priceDerivedScope({
    components: args.components.map((c) => ({
      key: c.key, quantity: c.quantity,
      addFieldLaborHours: laborByKey.has(c.key) ? (laborByKey.get(c.key) as number | null) : null,
    })),
    atomicLabor: atomicLabor?.kind === "READY"
      ? { kind: "READY", hours: atomicLabor.hours }
      : atomicLabor?.kind === "LABOR_INCOMPLETE"
        ? {
            kind: "INCOMPLETE",
            missingOperations: atomicLabor.evaluation.missingOperations,
            missingQuantities: atomicLabor.evaluation.missingQuantities,
            invalidConditions: atomicLabor.evaluation.invalidConditions,
          }
        : undefined,
    takeoff,
    settingsRow: basis.settings,
    context: args.context,
    service: args.service,
    approval: { approvedBasisFingerprint: basisFingerprint },
    currentBasisFingerprint: basisFingerprint,
  });
  return { proposal, basisFingerprint };
}
