import { strict as assert } from "node:assert";
import fs from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { evaluateBaseboardConcealedAtomicLabor } from "../lib/electrical/baseboardConcealedAtomicLaborBridge";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
  console.log(`  ✓ ${message}`);
};
const components = [
  { key: "ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS", quantity: 1 },
  { key: "CONCEALED_ROUTE_FT", quantity: 18 },
  { key: "RESTORE_BASEBOARD_ACCESS", quantity: 18 },
  { key: "OUTLET_EXTENSION_CORE", quantity: 1 },
];
const calibrated = Object.fromEntries(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, 0.1]));
const ready = evaluateBaseboardConcealedAtomicLabor({ endpoint: "OUTLET", components, contractorHours: calibrated });
ok(ready.kind === "READY", "baseboard concealed outlet evaluates from atomic operations");
ok(ready.kind === "READY" && ready.quantities.ELEC_FISH_CABLE_CONCEALED === 18, "concealed cable placement uses measured route feet");
ok(ready.kind === "READY" && ready.quantities.ELEC_REMOVE_REINSTALL_BASEBOARD === 18, "baseboard restoration uses measured trim feet rather than one route unit");
ok(ready.kind === "READY" && ready.quantities.ELEC_INSTALL_OLD_WORK_BOX === 1 && ready.quantities.ELEC_INSTALL_NEW_RECEPTACLE === 1, "endpoint box and receptacle remain separate operations");

const mismatch = evaluateBaseboardConcealedAtomicLabor({
  endpoint: "OUTLET",
  components: components.map((component) => component.key === "RESTORE_BASEBOARD_ACCESS" ? { ...component, quantity: 1 } : component),
  contractorHours: calibrated,
});
ok(mismatch.kind === "READY" && mismatch.quantities.ELEC_REMOVE_REINSTALL_BASEBOARD === 1, "bridge never silently substitutes route footage for a malformed restoration quantity");

const finishedModule = fs.readFileSync("prisma/_finishedWallModule.ts", "utf8");
ok(finishedModule.includes('comp("RESTORE_BASEBOARD_ACCESS"), quantity: 1, quantityAnswerKey: FINISHED_KEYS.feet'), "decision tree binds restoration quantity to the measured route answer");
const loader = fs.readFileSync("lib/electrical/loadDerivedScope.ts", "utf8");
ok(loader.includes("evaluateBaseboardConcealedAtomicLabor"), "derived pricing dispatches baseboard routes to their atomic bridge");

console.log(`\nBASEBOARD CONCEALED ATOMIC LABOR BRIDGE — ${checks}/${checks} checks passed`);
