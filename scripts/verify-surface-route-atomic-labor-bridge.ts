import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { evaluateSurfaceRouteAtomicLabor } from "../lib/electrical/surfaceRouteAtomicLaborBridge";
import type { MaterialTakeoff } from "../lib/electrical/materialTakeoff";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  checks += 1;
  console.log(`  ✓ ${message}`);
};

const components = [
  { key: "ELEC_ROUTE_SURFACE_MOUNTED", quantity: 1 },
  { key: "SURFACE_ROUTE_FT", quantity: 31 },
  { key: "SURFACE_ROUTE_INSIDE_CORNER", quantity: 2 },
  { key: "OUTLET_EXTENSION_CORE", quantity: 1 },
  { key: "SURFACE_DEVICE_BOX_OUTLET", quantity: 1 },
];
const takeoff: MaterialTakeoff = {
  physicalRequirements: [
    { role: "SURFACE_RACEWAY_CHANNEL", quantity: 31, unit: "ft", fromComponent: "SURFACE_ROUTE_FT" },
    { role: "SURFACE_RACEWAY_JOINT", quantity: 3, unit: "each", fromComponent: "piece geometry" },
    { role: "SURFACE_RACEWAY_SUPPORT_CLIP", quantity: 9, unit: "each", fromComponent: "declared system" },
    { role: "SURFACE_RACEWAY_ELBOW_INSIDE", quantity: 2, unit: "each", fromComponent: "SURFACE_ROUTE_INSIDE_CORNER" },
    { role: "SURFACE_RACEWAY_TRANSITION", quantity: 1, unit: "each", fromComponent: "declared system" },
    { role: "SURFACE_DEVICE_BOX_1G", quantity: 1, unit: "each", fromComponent: "SURFACE_DEVICE_BOX_OUTLET" },
    { role: "CONDUCTOR_HOT", quantity: 31, unit: "ft", fromComponent: "declared system" },
    { role: "CONDUCTOR_NEUTRAL", quantity: 31, unit: "ft", fromComponent: "declared system" },
    { role: "CONDUCTOR_GROUND", quantity: 31, unit: "ft", fromComponent: "declared system" },
  ],
  purchaseRequirements: [], unresolvedRequirements: [], purchaseComplete: true,
  classStatuses: [{ classKey: "CONDUCTOR", status: "RESOLVED", roles: ["CONDUCTOR_HOT", "CONDUCTOR_NEUTRAL", "CONDUCTOR_GROUND"], unresolvedCodes: [] }],
};
const calibrated = Object.fromEntries(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, 0.1]));

const ready = evaluateSurfaceRouteAtomicLabor({ components, takeoff, contractorHours: calibrated });
ok(ready.kind === "READY", "a complete takeoff plus calibrated atomic units evaluates without ContractorComponent labor");
ok(ready.kind === "READY" && ready.quantities.ELEC_SURFACE_RACEWAY === 31, "component footage becomes raceway labor footage exactly");
ok(ready.kind === "READY" && ready.quantities.ELEC_PULL_SURFACE_RACEWAY_CONDUCTOR === 93, "three declared conductors produce 93 conductor-feet rather than 31 route-feet");
ok(ready.kind === "READY" && ready.quantities.ELEC_SURFACE_RACEWAY_SUPPORT === 9 && ready.quantities.ELEC_SURFACE_RACEWAY_JOINT === 3, "declared system and piece geometry supply support and joint labor counts");
ok(ready.kind === "READY" && ready.quantities.ELEC_SURFACE_RACEWAY_INSIDE_CORNER === 2, "observable corner quantity remains exact");
ok(ready.kind === "READY" && !Object.hasOwn(ready.quantities, "ELEC_SURFACE_RACEWAY_WIRE_CLIP"), "a product-specific wire clip is not universally invented");
ok(ready.kind === "READY" && ready.quantities.ELEC_CONNECT_EXISTING_BRANCH_SOURCE === 1 && ready.quantities.ELEC_TEST_BRANCH_EXTENSION === 1 && ready.quantities.ELEC_BRANCH_WORK_CLEANUP === 1, "endpoint source, testing and cleanup survive the bridge");

const switchReady = evaluateSurfaceRouteAtomicLabor({
  components: components.map((component) => component.key === "OUTLET_EXTENSION_CORE"
    ? { key: "SWITCH_ENDPOINT_CORE", quantity: component.quantity }
    : component.key === "SURFACE_DEVICE_BOX_OUTLET"
      ? { key: "SURFACE_DEVICE_BOX_SWITCH", quantity: component.quantity }
      : component),
  takeoff,
  contractorHours: calibrated,
});
ok(switchReady.kind === "READY" && switchReady.quantities.ELEC_TERMINATE_SWITCH === 1, "surface switch selects its own endpoint recipe");
ok(switchReady.kind === "READY" && switchReady.quantities.ELEC_CONNECT_EXISTING_BRANCH_SOURCE === 1 && switchReady.quantities.ELEC_TEST_BRANCH_EXTENSION === 1 && switchReady.quantities.ELEC_BRANCH_WORK_CLEANUP === 1, "surface switch includes source connection, testing, and cleanup");
ok(switchReady.kind === "READY" && switchReady.quantities.ELEC_SURFACE_DEVICE_BOX === 1, "surface switch box quantity reaches the shared physical box operation");

const missingLabor = evaluateSurfaceRouteAtomicLabor({ components, takeoff, contractorHours: { ...calibrated, ELEC_SURFACE_RACEWAY_SUPPORT: null } });
ok(missingLabor.kind === "LABOR_INCOMPLETE" && missingLabor.evaluation.missingOperations.includes("ELEC_SURFACE_RACEWAY_SUPPORT"), "one missing contractor unit refuses with its exact operation key");

const incompleteTakeoff = evaluateSurfaceRouteAtomicLabor({
  components,
  takeoff: { ...takeoff, purchaseComplete: false, unresolvedRequirements: [{ code: "SUPPORT_SPACING_NOT_ESTABLISHED", role: "SURFACE_RACEWAY_SUPPORT_CLIP", reason: "test" }] },
  contractorHours: calibrated,
});
ok(incompleteTakeoff.kind === "TAKEOFF_INCOMPLETE" && incompleteTakeoff.detail.includes("SUPPORT_SPACING_NOT_ESTABLISHED:SURFACE_RACEWAY_SUPPORT_CLIP"), "material/system gaps refuse before labor arithmetic");

console.log(`\nSURFACE ROUTE ATOMIC LABOR BRIDGE — ${checks}/${checks} checks passed`);
