import assert from "node:assert/strict";
import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { platformLaborHours } from "../lib/electrical/platformLaborBaseline";

const decisions = Object.entries(platformLaborHours()).map(([operationKey, hoursPerUnit]) => ({ operationKey, hoursPerUnit, source: "APPROVED_PROPOSAL" as const }));
const cases = [
  ["new-ethernet-line", { "new-ethernet-line_route_access": "finished", "new-ethernet-line_distance": "26_to_50" }],
  ["new-coax-line", { "new-coax-line_route_access": "finished", "new-coax-line_distance": "51_to_75" }],
  ["new-video-doorbell-wiring", { doorbell_existing: "none", doorbell_surface: "standard", doorbell_supply: "customer", doorbell_chime: "no_chime", doorbell_route_access: "finished", doorbell_route_feet: "25" }],
  ["new-ceiling-light", { extension_existing_location: "no", fixture_height: "under_10", extension_route_access: "finished", extension_existing_switch_feet: "20", extension_control: "existing_switch" }],
  ["new-wall-sconce", { extension_existing_location: "no", fixture_height: "under_10", extension_route_access: "accessible", extension_existing_fixture_feet: "20", extension_control: "existing_fixture" }],
  ["recessed-lighting", { fixture_height: "under_10", recessed_light_count: "4", extension_route_access: "finished", extension_existing_switch_feet: "30", extension_control: "existing_switch" }],
  ["new-exterior-lighting-locations", { extension_existing_location: "no", extension_fixture_supply: "customer", extension_wall_finish: "ordinary", fixture_height: "under_10", extension_route_access: "finished", extension_existing_fixture_feet: "20", extension_control: "existing_fixture" }],
] as const;

for (const [slug, answers] of cases) {
  const pkg = circuitPackageFor(slug, answers, [25, 50]);
  assert.ok(pkg, `${slug} customer path must produce a physical package`);
  const labor = projectElectricalServiceLabor(pkg.laborServiceSlug, decisions, { ...pkg.facts, nmCableSupportCount: 8 });
  assert.equal(labor.kind, "READY_FOR_APPROVAL", `${slug} physical package must resolve every atomic labor quantity`);
  assert.ok(pkg.materialRoles.length > 0, `${slug} physical package must declare priced material roles`);
}

for (const slug of ["new-ceiling-light", "new-wall-sconce", "recessed-lighting", "new-exterior-lighting-locations"]) {
  const base = slug === "recessed-lighting" ? { recessed_light_count: "4" } : {};
  const newSwitch = circuitPackageFor(slug, {
    ...base, extension_route_access: "finished", extension_control: "new_switch",
    extension_power_to_switch_feet: "12", extension_switch_to_fixture_feet: "18",
  }, [25, 50]);
  assert.ok(newSwitch, `${slug} must price two measured new-switch legs`);
  assert.equal(newSwitch.routeFeet, 30, `${slug} must add source-to-switch and switch-to-light footage`);
  assert.equal(newSwitch.materialQuantities?.WIRE_14_2, 36, `${slug} wire takeoff includes both route legs and slack`);
  assert.equal(newSwitch.materialQuantities?.BOX_OLD_WORK, slug === "new-wall-sconce" ? 2 : 1, `${slug} includes the required cut-in box material`);
  assert.equal(newSwitch.materialQuantities?.SWITCH_STANDARD, 1, `${slug} includes a new switch`);
  assert.equal(newSwitch.materialQuantities?.WALL_PLATE, 1, `${slug} includes a switch plate`);
  const labor = projectElectricalServiceLabor(newSwitch.laborServiceSlug, decisions, { ...newSwitch.facts, nmCableSupportCount: 8 });
  assert.equal(labor.kind, "READY_FOR_APPROVAL", `${slug} measured new-switch labor is fully modeled`);
  if (labor.kind !== "READY_FOR_APPROVAL") throw new Error(`expected ${slug} new-switch labor`);
  assert.equal(labor.projection.lines.find((line) => line.operationKey === "ELEC_INSTALL_OLD_WORK_BOX")?.quantity, slug === "new-wall-sconce" ? 2 : 1, `${slug} includes switch-box labor`);
  assert.equal(labor.projection.lines.find((line) => line.operationKey === "ELEC_TERMINATE_SWITCH")?.quantity, 1, `${slug} includes switch termination labor`);
  assert.equal(circuitPackageFor(slug, { ...base, extension_route_access: "finished", extension_control: "new_switch", extension_power_to_switch_feet: "12" }, [25, 50]), null, `${slug} stays unpriced until both new-switch legs are measured`);
}

const sharedFixture = circuitPackageFor("new-wall-sconce", {
  extension_route_access: "accessible", extension_control: "existing_fixture", extension_existing_fixture_feet: "14",
}, [25, 50]);
assert.ok(sharedFixture, "an existing fixture may feed a measured new wall-sconce route");
assert.equal(sharedFixture.routeFeet, 14, "existing-fixture route uses its own measured distance");

console.log(`route/recipe runtime contract: ${cases.length} predictable extension paths resolve complete labor and material packages`);
