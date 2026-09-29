import assert from "node:assert/strict";
import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { platformLaborHours } from "../lib/electrical/platformLaborBaseline";

const decisions = Object.entries(platformLaborHours()).map(([operationKey, hoursPerUnit]) => ({ operationKey, hoursPerUnit, source: "APPROVED_PROPOSAL" as const }));
const cases = [
  ["new-ethernet-line", { "new-ethernet-line_route_access": "finished", "new-ethernet-line_distance": "26_to_50" }],
  ["new-coax-line", { "new-coax-line_route_access": "finished", "new-coax-line_distance": "51_to_75" }],
  ["new-video-doorbell-wiring", { doorbell_existing: "none", doorbell_surface: "standard", doorbell_supply: "customer", doorbell_chime: "no_chime", doorbell_route_access: "finished", doorbell_route_feet: "25" }],
  ["new-ceiling-light", { extension_existing_location: "no", fixture_height: "under_10", extension_route_access: "finished", extension_route_feet: "20", extension_control: "existing_switch" }],
  ["new-wall-sconce", { extension_existing_location: "no", fixture_height: "under_10", extension_route_access: "accessible", extension_route_feet: "20", extension_control: "existing_switch" }],
  ["recessed-lighting", { fixture_height: "under_10", recessed_light_count: "4", extension_route_access: "finished", extension_route_feet: "30", extension_control: "existing_switch" }],
  ["new-exterior-lighting-locations", { extension_existing_location: "no", extension_fixture_supply: "customer", extension_wall_finish: "ordinary", fixture_height: "under_10", extension_route_access: "finished", extension_route_feet: "20", extension_control: "existing_switch" }],
] as const;

for (const [slug, answers] of cases) {
  const pkg = circuitPackageFor(slug, answers, [25, 50]);
  assert.ok(pkg, `${slug} customer path must produce a physical package`);
  const labor = projectElectricalServiceLabor(pkg.laborServiceSlug, decisions, { ...pkg.facts, nmCableSupportCount: 8 });
  assert.equal(labor.kind, "READY_FOR_APPROVAL", `${slug} physical package must resolve every atomic labor quantity`);
  assert.ok(pkg.materialRoles.length > 0, `${slug} physical package must declare priced material roles`);
}

for (const slug of ["new-ceiling-light", "recessed-lighting", "new-exterior-lighting-locations"]) {
  assert.equal(circuitPackageFor(slug, { extension_route_access: "finished", extension_route_feet: "20", extension_control: "new_switch" }, [25, 50]), null, `${slug} must not price an unmeasured new-switch leg`);
}

const alongRouteSwitch = circuitPackageFor("new-wall-sconce", {
  extension_route_access: "finished", extension_route_feet: "20", extension_control: "new_switch", extension_switch_location: "along_route",
}, [25, 50]);
assert.ok(alongRouteSwitch, "wall-sconce switch on the direct route must price without review");
assert.equal(alongRouteSwitch.routeFeet, 25, "the along-route switch adds the contractor's five-foot cable allowance");
assert.equal(alongRouteSwitch.materialQuantities?.WIRE_14_2, 31, "wire takeoff includes route, switch allowance and slack");
assert.equal(alongRouteSwitch.materialQuantities?.BOX_OLD_WORK, 2, "the sconce box and switch cut-in box are both included");
assert.equal(alongRouteSwitch.materialQuantities?.SWITCH_STANDARD, 1, "the new switch is included");
assert.equal(alongRouteSwitch.materialQuantities?.WALL_PLATE, 1, "the switch plate is included");
const alongRouteLabor = projectElectricalServiceLabor(alongRouteSwitch.laborServiceSlug, decisions, { ...alongRouteSwitch.facts, nmCableSupportCount: 8 });
assert.equal(alongRouteLabor.kind, "READY_FOR_APPROVAL", "along-route switch labor is fully modeled");
if (alongRouteLabor.kind !== "READY_FOR_APPROVAL") throw new Error("expected along-route switch labor");
assert.equal(alongRouteLabor.projection.lines.find((line) => line.operationKey === "ELEC_INSTALL_OLD_WORK_BOX")?.quantity, 2, "switch and sconce each receive a cut-in box labor unit");
assert.equal(alongRouteLabor.projection.lines.find((line) => line.operationKey === "ELEC_TERMINATE_SWITCH")?.quantity, 1, "new switch termination labor is included");

const differentSwitchLocation = circuitPackageFor("new-wall-sconce", {
  extension_route_access: "finished", extension_route_feet: "20", extension_control: "new_switch", extension_switch_location: "different_location", extension_switch_extra_feet: "14",
}, [25, 50]);
assert.ok(differentSwitchLocation, "an off-route switch with measured extra footage must price");
assert.equal(differentSwitchLocation.routeFeet, 34, "off-route switch footage is added to the direct sconce route");
assert.equal(circuitPackageFor("new-wall-sconce", { extension_route_access: "finished", extension_route_feet: "20", extension_control: "new_switch", extension_switch_location: "different_location" }, [25, 50]), null, "off-route switch stays unpriced until its extra footage is measured");

console.log(`route/recipe runtime contract: ${cases.length} predictable extension paths resolve complete labor and material packages`);
