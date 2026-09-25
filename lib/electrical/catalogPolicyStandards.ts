/**
 * Electrical catalog standards that are owned by Price2Book, not by an
 * individual contractor.
 *
 * The rows remain in ContractorPolicyValue for compatibility with installed
 * templates and label rendering, but they are prepared inputs rather than
 * onboarding decisions. Keeping the list here gives the policy UI and write
 * API one authority for what a contractor may edit.
 */
export const ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS = new Set([
  "bathroom_fan.supply_arrangement",
  "concealed_branch.back_to_back_cable_allowance",
  "concealed_branch.cable_role",
  "concealed_branch.cable_slack_per_termination",
  "concealed_branch.cable_support_spacing",
  "concealed_branch.drywall_framing_spacing_inches",
  "concealed_branch.support_at_each_termination",
  "connected_device.commissioning",
  "data_cable_run.breakpoints",
  "exterior_mount_height.breakpoints",
  "exterior_outlet_run.breakpoints",
  "fixture_work_height.breakpoints",
  "outlet_run.breakpoints",
  "panel_circuit_run.breakpoints",
  "sconce_run.breakpoints",
  "surface_outlet.branch_conductor_spec",
  "surface_raceway.conductor_slack_per_termination",
  "surface_raceway.offcut_reuse",
  "switch_leg_run.breakpoints",
  "under_cabinet_run.breakpoints",
]);

export function isElectricalCatalogStandardPolicy(key: string): boolean {
  return ELECTRICAL_CATALOG_STANDARD_POLICY_KEYS.has(key);
}
