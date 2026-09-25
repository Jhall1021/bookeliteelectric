/**
 * Prepared electrical catalog defaults.
 *
 * These are platform catalog standards, not values copied from a contractor.
 * Guided Setup does not ask a contractor to rebuild routing bands, code
 * requirements, or standard takeoff assumptions from scratch.
 */

export type PreparedPolicyAnswer =
  | { boundaries: number[] }
  | { choice: string }
  | { measurement: number };

export const ELECTRICAL_PREPARED_POLICY_DEFAULTS: Record<string, PreparedPolicyAnswer> = {
  "bathroom_fan.supply_arrangement": { choice: "Contractor supplies the fan" },
  "concealed_branch.back_to_back_cable_allowance": { measurement: 3 },
  "concealed_branch.cable_role": { choice: "WIRE_12_2" },
  "concealed_branch.cable_slack_per_termination": { measurement: 3 },
  "concealed_branch.cable_support_spacing": { measurement: 4.5 },
  "concealed_branch.drywall_framing_spacing_inches": { measurement: 16 },
  "concealed_branch.support_at_each_termination": { choice: "NO" },
  "connected_device.commissioning": { choice: "INCLUDED" },
  "data_cable_run.breakpoints": { boundaries: [25, 50, 75] },
  "exterior_mount_height.breakpoints": { boundaries: [20] },
  "exterior_outlet_run.breakpoints": { boundaries: [10, 20] },
  // Compatibility for contractors installed before the shared ceiling-height
  // module replaced this three-band template policy. The values mirror the
  // current <=10 / 12 / 14-foot labor calibration and >14-foot review route.
  "fixture_work_height.breakpoints": { boundaries: [10, 12, 14] },
  "outlet_run.breakpoints": { boundaries: [10, 20] },
  "panel_circuit_run.breakpoints": { boundaries: [25, 50] },
  "sconce_run.breakpoints": { boundaries: [20] },
  "surface_outlet.branch_conductor_spec": { choice: "12" },
  "surface_raceway.conductor_slack_per_termination": { measurement: 0.5 },
  "surface_raceway.offcut_reuse": { choice: "REUSE_ACROSS_LEGS" },
  "switch_leg_run.breakpoints": { boundaries: [10, 20] },
  "under_cabinet_run.breakpoints": { boundaries: [12] },
};

export function preparedPolicyAnswer(
  trade: string,
  key: string,
): PreparedPolicyAnswer | null {
  if (trade !== "electrical") return null;
  return ELECTRICAL_PREPARED_POLICY_DEFAULTS[key] ?? null;
}
