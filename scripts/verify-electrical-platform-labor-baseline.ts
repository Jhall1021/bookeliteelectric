import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import {
  ELECTRICAL_PLATFORM_LABOR_BASELINES,
  ELECTRICAL_OWNER_APPROVED_STARTING_MINUTES_2026_09_25,
  ELECTRICAL_PREPARED_SURFACE_RACEWAY_LABOR_KEYS,
  electricalPlatformLaborBaselineByOperation,
} from "../lib/electrical/platformLaborBaseline";

let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const knownOperations = new Set(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => operation.key));

check(new Set(ELECTRICAL_PLATFORM_LABOR_BASELINES.map((baseline) => baseline.operationKey)).size === ELECTRICAL_PLATFORM_LABOR_BASELINES.length, "platform labor baseline keys are unique");
check(ELECTRICAL_PLATFORM_LABOR_BASELINES.every((baseline) => knownOperations.has(baseline.operationKey)), "every platform labor baseline names a known atomic operation");
check(ELECTRICAL_PLATFORM_LABOR_BASELINES.every((baseline) => Number.isFinite(baseline.hoursPerUnit) && baseline.hoursPerUnit >= 0), "every platform labor baseline has nonnegative finite hours");
check(ELECTRICAL_PLATFORM_LABOR_BASELINES.every((baseline) => baseline.sourceKeys.length > 0 && baseline.note.length > 0), "every platform labor baseline carries visible source and allocation notes");
check(Object.keys(ELECTRICAL_OWNER_APPROVED_STARTING_MINUTES_2026_09_25).length === 47, "the owner-reviewed starting-value set contains the 47 changed labor units");
check(Object.entries(ELECTRICAL_OWNER_APPROVED_STARTING_MINUTES_2026_09_25).every(([key, minutes]) =>
  knownOperations.has(key)
  && electricalPlatformLaborBaselineByOperation.get(key)?.status === "OWNER_APPROVED_STARTING_VALUE"
  && Math.abs((electricalPlatformLaborBaselineByOperation.get(key)?.hoursPerUnit ?? NaN) * 60 - minutes) < 1e-9),
"every owner-reviewed minute value is the active future-install baseline for a known atomic operation");
check(ELECTRICAL_PREPARED_SURFACE_RACEWAY_LABOR_KEYS.length === 13, "the complete surface-raceway labor family is explicitly prepared");
check(ELECTRICAL_PREPARED_SURFACE_RACEWAY_LABOR_KEYS.every((key) => electricalPlatformLaborBaselineByOperation.has(key)), "every prepared surface-raceway operation has an estimator baseline");

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

check(branchCircuitOperationKeys.size === 20, "active and dedicated branch-circuit recipes expose the expected 20 shared atomic operations");
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

const lightingFanSlugs = new Set([
  "bathroom-fan-light-combo", "fan-replacing-light", "new-ceiling-fan", "new-ceiling-light", "new-wall-sconce",
  "recessed-lighting", "replace-bathroom-exhaust-fan", "replace-bathroom-exhaust-fan-with-light",
  "replace-ceiling-fan", "replace-exterior-light-fixture", "replace-interior-light-fixture",
  "replace-motion-flood-light", "replace-wall-sconce", "under-cabinet-led-lighting",
]);
const lightingFanOperationKeys = new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES
  .filter((recipe) => recipe.appliesTo.some((slug) => lightingFanSlugs.has(slug)))
  .flatMap((recipe) => recipe.lines.map((line) => line.operationKey)));
check(lightingFanOperationKeys.size === 34, "lighting and fan recipes expose the expected 34 atomic operations");
check([...lightingFanOperationKeys].every((key) => electricalPlatformLaborBaselineByOperation.has(key)), "every lighting and fan operation has a platform baseline");
const hours = (key: string) => electricalPlatformLaborBaselineByOperation.get(key)?.hoursPerUnit ?? NaN;
const undercabinetTwelveFootHours = hours("ELEC_UNDERCABINET_LAYOUT")
  + 12 * hours("ELEC_UNDERCABINET_CHANNEL_AND_TAPE")
  + hours("ELEC_UNDERCABINET_RUN_TERMINATION")
  + hours("ELEC_INSTALL_LED_DRIVER")
  + hours("ELEC_INSTALL_LED_DIMMER");
check(Math.abs(undercabinetTwelveFootHours - 2.64) < 1e-9, "12-foot under-cabinet standard reflects the owner-reviewed 2.64-hour starting total");
const lightToFanHours = hours("ELEC_REMOVE_LIGHT_FIXTURE") + hours("ELEC_INSTALL_FAN_RATED_BOX") + hours("ELEC_INSTALL_NEW_CEILING_FAN");
check(Math.abs(lightToFanHours - 1.55) < 1e-9, "light-to-fan conversion reflects the owner-reviewed 1.55-hour starting total with removal and support visible");

for (const [familyName, slugs, expectedOperations] of [
  ["appliance", ["dishwasher-electrical", "garbage-disposal-install", "install-new-microwave", "otr-microwave-install", "replace-range-hood"], 7],
  ["media and low-voltage", ["doorbell-transformer-replacement", "articulating-tv-mount", "tilt-tv-mount", "floodlight-camera-existing", "new-coax-line", "new-ethernet-line", "new-exterior-flood-camera", "new-video-doorbell-wiring", "soundbar-installation", "tv-install-existing-location", "tv-installation", "video-doorbell-existing-wiring"], 26],
] as const) {
  const slugSet = new Set<string>(slugs);
  const operationKeys = new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES
    .filter((recipe) => recipe.appliesTo.some((slug) => slugSet.has(slug)))
    .flatMap((recipe) => recipe.lines.map((line) => line.operationKey)));
  check(operationKeys.size === expectedOperations, `${familyName} recipes expose the expected ${expectedOperations} atomic operations`);
  check([...operationKeys].every((key) => electricalPlatformLaborBaselineByOperation.has(key)), `every ${familyName} operation has a platform baseline`);
}

const newFloodCameraBackToBackHours = hours("ELEC_ROUTE_LAYOUT_SETUP") + hours("ELEC_BACK_TO_BACK_WALL_PASS")
  + hours("ELEC_CONNECT_EXISTING_BRANCH_SOURCE") + hours("ELEC_INSTALL_EXTERIOR_FIXTURE_BOX")
  + hours("ELEC_TEST_BRANCH_EXTENSION") + hours("ELEC_MOUNT_AIM_EXTERIOR_CAMERA")
  + hours("ELEC_COMMISSION_CONNECTED_DEVICE") + hours("ELEC_BRANCH_WORK_CLEANUP");
check(Math.abs(newFloodCameraBackToBackHours - 2.5333333333333337) < 1e-9, "back-to-back floodlight-camera standard reflects the owner-reviewed atomic starting values");

const reachableOperationKeys = new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES.flatMap((recipe) => recipe.lines.map((line) => line.operationKey)));
check(reachableOperationKeys.size === 140, "service and selectable-component recipes expose the expected 140 reachable atomic operations");
check([...reachableOperationKeys].every((key) => electricalPlatformLaborBaselineByOperation.has(key)), "every reachable electrical atomic operation has a platform labor baseline");

const diagnosticHours = hours("ELEC_DIAGNOSTIC_SCOPE_CONFIRMATION") + hours("ELEC_INITIAL_DIAGNOSTIC_BLOCK")
  + hours("ELEC_DOCUMENT_DIAGNOSTIC_FINDINGS") + hours("ELEC_DIAGNOSTIC_CLOSEOUT");
check(Math.abs(diagnosticHours - 1.35) < 1e-9, "initial troubleshooting visit reconciles to the workbook's 1.35-hour atomic recipe");
const inspectionHours = hours("ELEC_DIAGNOSTIC_SCOPE_CONFIRMATION") + hours("ELEC_HOME_SAFETY_INSPECTION")
  + hours("ELEC_DOCUMENT_SAFETY_INSPECTION");
check(Math.abs(inspectionHours - 2.60) < 1e-9, "home electrical safety inspection reconciles to the workbook's 2.60-hour atomic recipe");

const panelHours = hours("ELEC_PANEL_REPLACEMENT_SETUP") + hours("ELEC_REMOVE_EXISTING_PANEL")
  + hours("ELEC_MOUNT_LOADCENTER") + 17 * hours("ELEC_RECONNECT_SINGLE_POLE_BRANCH")
  + 3 * hours("ELEC_RECONNECT_DOUBLE_POLE_BRANCH") + hours("ELEC_TERMINATE_MAIN_FEEDER")
  + hours("ELEC_PANEL_GROUND_AND_BOND") + hours("ELEC_PANEL_LABEL_AND_TEST");
check(Math.abs(panelHours - 11.70) < 1e-9, "bounded panel replacement reconciles to the workbook's 11.70-hour service total");
const serviceUpgradeHours = panelHours + hours("ELEC_REPLACE_METER_SOCKET")
  + 20 * hours("ELEC_SERVICE_ENTRANCE_CONDUCTOR") + hours("ELEC_INSTALL_OVERHEAD_SERVICE_MAST")
  + hours("ELEC_INSTALL_SERVICE_WEATHERHEAD") + hours("ELEC_INSTALL_METER_HUB")
  + hours("ELEC_INSTALL_SERVICE_MAST_SUPPORT_SET") + 30 * hours("ELEC_PULL_OVERHEAD_SERVICE_CONDUCTOR")
  + 2 * hours("ELEC_DRIVE_GROUNDING_ELECTRODE")
  + 3 * hours("ELEC_TERMINATE_GROUNDING_ELECTRODE_CLAMP")
  + 25 * hours("ELEC_ROUTE_GROUNDING_ELECTRODE_CONDUCTOR");
check(Math.abs(serviceUpgradeHours - 18.50) < 1e-9, "bounded 200A overhead service reconciles to the workbook's 18.50-hour service total");

console.log(`ELECTRICAL PLATFORM LABOR BASELINE — ${checks}/${checks} checks passed`);
