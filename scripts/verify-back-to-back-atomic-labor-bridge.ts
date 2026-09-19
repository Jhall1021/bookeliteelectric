import { strict as assert } from "node:assert";
import fs from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { backToBackOperationKeys, evaluateBackToBackAtomicLabor } from "../lib/electrical/backToBackAtomicLaborBridge";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
  console.log(`  ✓ ${message}`);
};
const calibrated = Object.fromEntries(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, 0.1]));

const outlet = evaluateBackToBackAtomicLabor({ endpoint: "OUTLET", contractorHours: calibrated });
ok(outlet.kind === "READY", "calibrated back-to-back outlet evaluates from atomic operations");
ok(outlet.kind === "READY" && outlet.quantities.ELEC_BACK_TO_BACK_WALL_PASS === 1, "one confirmed route produces one wall-pass operation");
ok(outlet.kind === "READY" && outlet.quantities.ELEC_INSTALL_OLD_WORK_BOX === 1 && outlet.quantities.ELEC_INSTALL_NEW_RECEPTACLE === 1, "concealed outlet keeps box and device work explicit");
ok(outlet.kind === "READY" && outlet.quantities.ELEC_CONNECT_EXISTING_BRANCH_SOURCE === 1 && outlet.quantities.ELEC_TEST_BRANCH_EXTENSION === 1 && outlet.quantities.ELEC_BRANCH_WORK_CLEANUP === 1, "source, testing and cleanup remain visible");

const switchResult = evaluateBackToBackAtomicLabor({ endpoint: "SWITCH", contractorHours: calibrated });
ok(switchResult.kind === "READY" && switchResult.quantities.ELEC_TERMINATE_SWITCH === 1 && !Object.hasOwn(switchResult.quantities, "ELEC_INSTALL_NEW_RECEPTACLE"), "switch endpoint uses switch termination rather than receptacle labor");
ok(backToBackOperationKeys("OUTLET").includes("ELEC_BACK_TO_BACK_WALL_PASS") && backToBackOperationKeys("SWITCH").includes("ELEC_BACK_TO_BACK_WALL_PASS"), "both endpoint recipes share the same physical wall-pass unit");

const missing = evaluateBackToBackAtomicLabor({ endpoint: "OUTLET", contractorHours: { ...calibrated, ELEC_BACK_TO_BACK_WALL_PASS: null } });
ok(missing.kind === "INCOMPLETE" && missing.missingOperations.includes("ELEC_BACK_TO_BACK_WALL_PASS"), "missing wall-pass calibration refuses with the exact operation key");

const loader = fs.readFileSync("lib/electrical/loadDerivedScope.ts", "utf8");
ok(loader.includes("loadConcealedRouteTakeoff(db, contractorId, args.components)"), "derived pricing dispatches concealed routes to the concealed material authority");
ok(loader.includes("evaluateBackToBackAtomicLabor"), "derived pricing dispatches confirmed back-to-back work to its atomic recipe");
ok(loader.includes("UNCONNECTED_ROUTING_V2_COMPONENT_KEYS"), "remaining route refusals no longer mislabel already-connected endpoint components");

console.log(`\nBACK-TO-BACK ATOMIC LABOR BRIDGE — ${checks}/${checks} checks passed`);
