import { strict as assert } from "node:assert";
import fs from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { evaluateAccessibleConcealedAtomicLabor } from "../lib/electrical/accessibleConcealedAtomicLaborBridge";
import { computeConcealedRouteMaterialTakeoff } from "../lib/electrical/concealedRouteMaterialConfiguration";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
  console.log(`  ✓ ${message}`);
};
const components = [
  { key: "ELEC_ROUTE_ACCESSIBLE_CONCEALED", quantity: 1 },
  { key: "CONCEALED_ROUTE_FT", quantity: 31 },
  { key: "OUTLET_EXTENSION_CORE", quantity: 1 },
];
const takeoff = computeConcealedRouteMaterialTakeoff({
  components,
  endpoint: "OUTLET",
  configuration: {
    cableRole: "WIRE_12_2", slackPerTerminationFt: 2, backToBackCableAllowanceFt: 6,
    supportSpacingFt: 4.5, supportAtEachTermination: true,
  },
  selections: [
    { role: "WIRE_12_2", packageQuantity: 250, packageUnit: "ft", packagePriceCents: 18000 },
    { role: "NM_CABLE_SUPPORT", packageQuantity: 100, packageUnit: "each", packagePriceCents: 800 },
    ...["BOX_OLD_WORK", "RECEPTACLE_STANDARD", "WALL_PLATE", "CONSUMABLES_SMALL"].map((role) => ({ role, packageQuantity: 1, packageUnit: "each", packagePriceCents: 100 })),
  ],
});
const calibrated = Object.fromEntries(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, 0.1]));
const ready = evaluateAccessibleConcealedAtomicLabor({ endpoint: "OUTLET", components, takeoff, contractorHours: calibrated });
ok(ready.kind === "READY", "accessible concealed outlet evaluates from established route, support, and labor facts");
ok(ready.kind === "READY" && ready.quantities.ELEC_NM_CABLE_ACCESSIBLE === 31, "labor uses measured route footage rather than cable purchase allowance");
ok(ready.kind === "READY" && ready.quantities.ELEC_SUPPORT_NM_CABLE === 8, "labor support count comes from the contractor-declared material support rule");
ok(ready.kind === "READY" && ready.quantities.ELEC_DRILL_TOP_OR_BOTTOM_PLATE === 2 && ready.quantities.ELEC_FISH_WALL_TO_BOX === 2, "wall-device topology produces one plate penetration and fish at each endpoint");
ok(ready.kind === "READY" && ready.quantities.ELEC_INSTALL_OLD_WORK_BOX === 1 && ready.quantities.ELEC_INSTALL_NEW_RECEPTACLE === 1, "outlet endpoint remains decomposed into box and device work");

const switchReady = evaluateAccessibleConcealedAtomicLabor({
  endpoint: "SWITCH",
  components: components.map((component) => component.key === "OUTLET_EXTENSION_CORE" ? { key: "SWITCH_ENDPOINT_CORE", quantity: 1 } : component),
  takeoff,
  contractorHours: calibrated,
});
ok(switchReady.kind === "READY" && switchReady.quantities.ELEC_TERMINATE_SWITCH === 1 && !Object.hasOwn(switchReady.quantities, "ELEC_INSTALL_NEW_RECEPTACLE"), "accessible switch uses its own endpoint operation");

const missing = evaluateAccessibleConcealedAtomicLabor({ endpoint: "OUTLET", components, takeoff, contractorHours: { ...calibrated, ELEC_SUPPORT_NM_CABLE: null } });
ok(missing.kind === "INCOMPLETE" && missing.missingOperations.includes("ELEC_SUPPORT_NM_CABLE"), "missing support calibration refuses with the exact atomic operation");

const loader = fs.readFileSync("lib/electrical/loadDerivedScope.ts", "utf8");
ok(loader.includes("evaluateAccessibleConcealedAtomicLabor"), "derived pricing dispatches accessible concealed work to its atomic bridge");

console.log(`\nACCESSIBLE CONCEALED ATOMIC LABOR BRIDGE — ${checks}/${checks} checks passed`);
