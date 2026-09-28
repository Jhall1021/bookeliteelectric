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

for (const slug of ["new-ceiling-light", "new-wall-sconce", "recessed-lighting", "new-exterior-lighting-locations"]) {
  assert.equal(circuitPackageFor(slug, { extension_route_access: "finished", extension_route_feet: "20", extension_control: "new_switch" }, [25, 50]), null, `${slug} must not price an unmeasured new-switch leg`);
}

console.log(`route/recipe runtime contract: ${cases.length} predictable extension paths resolve complete labor and material packages`);
