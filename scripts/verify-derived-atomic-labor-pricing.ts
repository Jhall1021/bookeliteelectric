import { fingerprintBasis, serializeBasis, type DerivedPricingBasis } from "../lib/electrical/derivedPricingBasis";
import { priceDerivedScope } from "../lib/electrical/derivedScopePricing";
import type { MaterialTakeoff } from "../lib/electrical/materialTakeoff";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  checks += 1;
  console.log(`  ✓ ${message}`);
};

const takeoff: MaterialTakeoff = {
  physicalRequirements: [{ role: "TEST", quantity: 1, unit: "each", fromComponent: "TEST" }],
  purchaseRequirements: [{ role: "TEST", packages: 1, packageQuantity: 1, packageUnit: "each", costCents: 1000, productLabel: null, physicalQuantity: 1, costBasis: "CONSUMED_QUANTITY" }],
  unresolvedRequirements: [],
  classStatuses: [{ classKey: "TEST", status: "RESOLVED", roles: ["TEST"], unresolvedCodes: [] }],
  purchaseComplete: true,
};
const basis: DerivedPricingBasis = {
  componentLabor: [],
  operationLabor: [
    { operationKey: "ELEC_SURFACE_RACEWAY", hoursPerUnit: 0.05 },
    { operationKey: "ELEC_INSTALL_NEW_RECEPTACLE", hoursPerUnit: 0.2 },
  ],
  materials: [], systems: [], policies: [], recipe: [],
  settings: { crewHourRateCents: 20000, primaryMinimumCents: 0, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
};
const fingerprint = fingerprintBasis(basis);
const common = {
  components: [{ key: "SURFACE_ROUTE_FT", quantity: 31, addFieldLaborHours: null }],
  takeoff,
  settingsRow: basis.settings,
  context: { isPrimary: true, isPrimaryEligible: true, servicePermitAdminEstablished: false },
  service: { materialMultiplier: null, permitAdminCents: null, otherDirectCostCents: null, isPrimaryEligible: true },
  approval: { approvedBasisFingerprint: fingerprint },
  currentBasisFingerprint: fingerprint,
};

const priced = priceDerivedScope({ ...common, atomicLabor: { kind: "READY", hours: 2.5 } });
ok(priced.kind === "PRICED" && priced.laborHours === 2.5, "atomic labor prices a derived scope without ContractorComponent hours");

const missing = priceDerivedScope({
  ...common,
  atomicLabor: { kind: "INCOMPLETE", missingOperations: ["ELEC_SURFACE_RACEWAY_SUPPORT"], missingQuantities: [], invalidConditions: [] },
});
ok(missing.kind === "REVIEW" && missing.code === "ATOMIC_LABOR_NOT_ESTABLISHED", "missing atomic labor fails closed under its own refusal code");
ok(missing.kind === "REVIEW" && missing.detail?.includes("operation:ELEC_SURFACE_RACEWAY_SUPPORT"), "atomic refusal names the exact missing operation");

const changed: DerivedPricingBasis = {
  ...basis,
  operationLabor: basis.operationLabor?.map((operation) => operation.operationKey === "ELEC_SURFACE_RACEWAY"
    ? { ...operation, hoursPerUnit: 0.06 }
    : operation),
};
ok(fingerprintBasis(changed) !== fingerprint, "changing one atomic unit invalidates the derived-price approval fingerprint");
ok(serializeBasis(basis).includes("operation-labor|ELEC_SURFACE_RACEWAY|0.05"), "canonical basis serialization records approved operation labor explicitly");

const legacy = priceDerivedScope({
  ...common,
  components: [{ key: "LEGACY_COMPONENT", quantity: 2, addFieldLaborHours: 0.5 }],
});
ok(legacy.kind === "PRICED" && legacy.laborHours === 1, "component-labor pricing remains unchanged when no atomic authority is supplied");

console.log(`\nDERIVED ATOMIC LABOR PRICING — ${checks}/${checks} checks passed`);
