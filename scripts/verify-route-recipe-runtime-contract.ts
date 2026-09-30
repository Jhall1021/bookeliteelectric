import assert from "node:assert/strict";
import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { platformLaborHours } from "../lib/electrical/platformLaborBaseline";
import { DOORWAY_DETOUR_FEET } from "../lib/electrical/doorwayRouting";
import { normalizeSelectedComponents } from "../lib/electrical/resolveWithDerivedPricing";

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

const fourRecessed = circuitPackageFor("recessed-lighting", {
  recessed_light_count: "4", extension_route_access: "accessible",
  extension_control: "existing_switch", extension_existing_switch_feet: "30",
}, [25, 50]);
assert.ok(fourRecessed, "four recessed lights produce a measured package");
assert.equal(fourRecessed.routeFeet, 60, "four recessed lights add three ten-foot inter-light allowances to the measured first-light route");
assert.equal(fourRecessed.materialQuantities?.WIRE_14_2, 66, "recessed-light wire includes the measured first-light route, per-light allowances and six-foot job slack");
assert.equal(fourRecessed.facts.interLightCableFeet, 60, "recessed labor prices the same complete cable path as materials");

const oneRecessed = circuitPackageFor("recessed-lighting", {
  recessed_light_count: "1", extension_route_access: "accessible",
  extension_control: "existing_switch", extension_existing_switch_feet: "30",
}, [25, 50]);
assert.ok(oneRecessed, "one recessed light produces a measured package");
assert.equal(oneRecessed.routeFeet, 30, "one recessed light adds no inter-light allowance");
assert.equal(oneRecessed.materialQuantities?.WIRE_14_2, 36, "one recessed light keeps only the six-foot job slack");

for (const slug of ["new-ceiling-light", "new-wall-sconce", "recessed-lighting", "new-exterior-lighting-locations"]) {
  const base = slug === "recessed-lighting" ? { recessed_light_count: "4" } : {};
  const newSwitch = circuitPackageFor(slug, {
    ...base, extension_route_access: "finished", extension_control: "new_switch",
    extension_power_to_switch_feet: "12", extension_switch_to_fixture_feet: "18",
  }, [25, 50]);
  assert.ok(newSwitch, `${slug} must price two measured new-switch legs`);
  const expectedRouteFeet = slug === "recessed-lighting" ? 60 : 30;
  assert.equal(newSwitch.routeFeet, expectedRouteFeet, `${slug} must include both measured switch legs and any additional-light allowance`);
  assert.equal(newSwitch.materialQuantities?.WIRE_14_2, expectedRouteFeet + 6, `${slug} wire takeoff includes the complete route and slack`);
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

const sconceWithDoorway = circuitPackageFor("new-wall-sconce", {
  extension_route_access: "finished", extension_control: "existing_switch",
  extension_existing_switch_feet: "20", extension_existing_switch_feet_doorway: "yes",
}, [25, 50]);
assert.ok(sconceWithDoorway, "a finished wall-sconce route with a doorway stays instant-priceable");
assert.equal(sconceWithDoorway.routeFeet, 20 + DOORWAY_DETOUR_FEET, "a wall-sconce doorway adds the standard fourteen-foot detour");
assert.equal(sconceWithDoorway.materialQuantities?.WIRE_14_2, 20 + DOORWAY_DETOUR_FEET + 6, "doorway footage reaches the wire takeoff plus ordinary slack");
assert.equal(sconceWithDoorway.facts.perpendicularFramingFeet, 20 + DOORWAY_DETOUR_FEET, "doorway footage reaches finished-wall opening labor");

const accessibleSconceWithDoorway = circuitPackageFor("new-wall-sconce", {
  extension_route_access: "accessible", extension_control: "existing_switch",
  extension_existing_switch_feet: "20", extension_existing_switch_feet_doorway: "yes",
}, [25, 50]);
assert.equal(accessibleSconceWithDoorway?.routeFeet, 20, "an accessible route does not charge for a doorway the open path bypasses");

const twoDoorwaySwitchRoute = circuitPackageFor("new-ceiling-light", {
  extension_route_access: "finished", extension_control: "new_switch",
  extension_power_to_switch_feet: "12", extension_power_to_switch_feet_doorway: "yes",
  extension_switch_to_fixture_feet: "18", extension_switch_to_fixture_feet_doorway: "yes",
}, [25, 50]);
assert.equal(twoDoorwaySwitchRoute?.routeFeet, 30 + (2 * DOORWAY_DETOUR_FEET), "each measured new-switch leg can add its own doorway detour");

const doorbellWithDoorway = circuitPackageFor("new-video-doorbell-wiring", {
  doorbell_existing: "none", doorbell_surface: "standard", doorbell_supply: "customer", doorbell_chime: "no_chime",
  doorbell_route_access: "finished", doorbell_route_feet: "25", doorbell_route_feet_doorway: "yes",
}, [25, 50]);
assert.equal(doorbellWithDoorway?.routeFeet, 25 + DOORWAY_DETOUR_FEET, "finished doorbell wiring includes the doorway detour in cable and labor");

const concealedOutletComponents = normalizeSelectedComponents(
  [{ key: "CONCEALED_ROUTE_FT", quantity: 8 }, { key: "OUTLET_EXTENSION_CORE", quantity: 1 }],
  { concealed_route_feet: "8", concealed_route_feet_doorway: "yes" },
);
assert.equal(
  concealedOutletComponents.find((component) => component.key === "CONCEALED_ROUTE_FT")?.quantity,
  8 + DOORWAY_DETOUR_FEET,
  "a finished-wall outlet doorway adds cable and access-opening labor through the shared concealed-route quantity",
);

console.log(`route/recipe runtime contract: ${cases.length} predictable extension paths resolve complete labor and material packages`);
