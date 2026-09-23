import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import {
  ELECTRICAL_PLATFORM_LABOR_BASELINES,
  electricalPlatformLaborBaselineByOperation,
} from "../lib/electrical/platformLaborBaseline";

let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const knownOperations = new Set(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => operation.key));

check(new Set(ELECTRICAL_PLATFORM_LABOR_BASELINES.map((baseline) => baseline.operationKey)).size === ELECTRICAL_PLATFORM_LABOR_BASELINES.length, "platform labor baseline keys are unique");
check(ELECTRICAL_PLATFORM_LABOR_BASELINES.every((baseline) => knownOperations.has(baseline.operationKey)), "every platform labor baseline names a known atomic operation");
check(ELECTRICAL_PLATFORM_LABOR_BASELINES.every((baseline) => Number.isFinite(baseline.hoursPerUnit) && baseline.hoursPerUnit >= 0), "every platform labor baseline has nonnegative finite hours");
check(ELECTRICAL_PLATFORM_LABOR_BASELINES.every((baseline) => baseline.sourceKeys.length > 0 && baseline.note.length > 0), "every platform labor baseline carries visible source and allocation notes");

const branchCircuitServices = new Set([
  "new-120v-outlet",
  "dedicated-120v-circuit-outlet",
  "freezer-fridge-dedicated-circuit",
  "electric-fireplace-circuit",
  "sump-pump-dedicated-circuit",
  "new-240v-appliance-circuit",
  "level-2-ev-charger",
]);
const branchCircuitOperationKeys = new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES
  .filter((recipe) => recipe.appliesTo.some((slug) => branchCircuitServices.has(slug)))
  .flatMap((recipe) => recipe.lines.map((line) => line.operationKey)));
const missingBranchCircuitBaselines = [...branchCircuitOperationKeys]
  .filter((key) => !electricalPlatformLaborBaselineByOperation.has(key));

check(branchCircuitOperationKeys.size === 23, "active and dedicated branch-circuit recipes expose the expected 23 atomic operations");
check(missingBranchCircuitBaselines.length === 0, `active and dedicated branch-circuit operations all have platform baselines: ${missingBranchCircuitBaselines.join(", ")}`);

const endpointKeys = ["ELEC_INSTALL_NEW_RECEPTACLE", "ELEC_INSTALL_NEW_GFCI_RECEPTACLE"];
check(endpointKeys.every((key) => electricalPlatformLaborBaselineByOperation.get(key)?.note.includes("separate branch test")), "receptacle endpoint baselines explicitly avoid double-counting the branch test");
check(electricalPlatformLaborBaselineByOperation.get("ELEC_NM_CABLE_ACCESSIBLE")?.note.includes("supports, framing drills, source makeup and testing remain separate"), "accessible cable baseline explicitly removes separately modeled work");

const deviceServiceSlugs = new Set([
  "replace-standard-outlet", "replace-standard-switch", "replace-gfci-outlet", "replace-3-way-switch",
  "replace-led-dimmer", "usb-outlet-upgrade", "dryer-receptacle-replacement", "range-receptacle-replacement",
  "hardwired-smoke-detector", "smoke-co-detector", "customer-supplied-smart-switch", "smart-outlet-upgrade",
  "occupancy-motion-switch", "timer-switch-install", "smart-thermostat-install",
]);
const deviceOperationKeys = new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES
  .filter((recipe) => recipe.appliesTo.some((slug) => deviceServiceSlugs.has(slug)))
  .flatMap((recipe) => recipe.lines.map((line) => line.operationKey)));
check(deviceOperationKeys.size === 14, "device and control recipes expose the expected 14 atomic operations");
check([...deviceOperationKeys].every((key) => electricalPlatformLaborBaselineByOperation.has(key)), "every device and control operation has a platform baseline");

console.log(`ELECTRICAL PLATFORM LABOR BASELINE — ${checks}/${checks} checks passed`);
