import assert from "node:assert/strict";
import { ELECTRICAL_PREPARED_POLICY_DEFAULTS } from "../lib/electrical/preparedPolicyDefaults";
import { ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS } from "../lib/electrical/catalogPolicyStandards";

const expected = {
  "concealed_branch.back_to_back_cable_allowance": { measurement: 3 },
  "concealed_branch.cable_role": { choice: "WIRE_12_2" },
  "concealed_branch.cable_slack_per_termination": { measurement: 3 },
  "concealed_branch.cable_support_spacing": { measurement: 4.5 },
  "concealed_branch.drywall_framing_spacing_inches": { measurement: 16 },
  "concealed_branch.support_at_each_termination": { choice: "NO" },
  "connected_device.commissioning": { choice: "INCLUDED" },
  "data_cable_run.breakpoints": { boundaries: [25, 50, 75] },
  "exterior_mount_height.breakpoints": { boundaries: [20] },
  "panel_circuit_run.breakpoints": { boundaries: [25, 50] },
  "surface_outlet.branch_conductor_spec": { choice: "12" },
  "surface_raceway.conductor_slack_per_termination": { measurement: 0.5 },
  "surface_raceway.offcut_reuse": { choice: "REUSE_ACROSS_LEGS" },
  "switch_leg_run.breakpoints": { boundaries: [10, 20] },
  "under_cabinet_run.breakpoints": { boundaries: [12] },
} as const;

for (const [key, value] of Object.entries(expected)) {
  assert.ok(ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS.has(key), `${key} must be hidden from contractor policy decisions`);
  assert.deepEqual(ELECTRICAL_PREPARED_POLICY_DEFAULTS[key], value, `${key} must keep the reviewed catalog value`);
}

assert.ok(ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS.has("bathroom_fan.supply_arrangement"));
assert.ok(ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS.has("fixture_work_height.breakpoints"));

console.log(`electrical catalog policy standards: ${Object.keys(expected).length + 2} reviewed rules locked`);
