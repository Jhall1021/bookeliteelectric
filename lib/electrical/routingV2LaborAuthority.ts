/**
 * Authority boundary between the atomic labor ledger and Routing V2 pricing.
 *
 * Routing V2 currently prices labor from ContractorComponent rows. The labor
 * wizard writes ContractorLaborOperationDecision rows. Those vocabularies are
 * intentionally not treated as interchangeable: most route components bundle
 * several atomic operations, quantities, or conditions. This registry makes
 * that boundary executable so a completed labor wizard cannot be mistaken for
 * a completed route-pricing configuration.
 */
export type RoutingV2LaborAuthority = {
  componentKey: string;
  kind: "EXACT_ATOMIC_OPERATION" | "COMPOSITE_RECIPE_REQUIRED";
  atomicOperationKeys: readonly string[];
  runtimeUsesAtomicDecision: boolean;
  reason: string;
};

const exact = (componentKey: string, operationKey: string, runtimeUsesAtomicDecision = false): RoutingV2LaborAuthority => ({
  componentKey,
  kind: "EXACT_ATOMIC_OPERATION",
  atomicOperationKeys: [operationKey],
  runtimeUsesAtomicDecision,
  reason: runtimeUsesAtomicDecision
    ? "The physical labor scope matches one atomic operation and the implemented route adapter consumes it."
    : "The physical labor scope matches one atomic operation, but the runtime adapter has not been authored.",
});

const composite = (
  componentKey: string,
  atomicOperationKeys: readonly string[],
  reason: string,
  runtimeUsesAtomicDecision = false,
): RoutingV2LaborAuthority => ({
  componentKey,
  kind: "COMPOSITE_RECIPE_REQUIRED",
  atomicOperationKeys,
  runtimeUsesAtomicDecision,
  reason,
});

export const ROUTING_V2_LABOR_AUTHORITY: readonly RoutingV2LaborAuthority[] = [
  composite("ELEC_ROUTE_SURFACE_MOUNTED", ["ELEC_SURFACE_RACEWAY_SETUP"], "The surface-route runtime consumes the authored whole-route atomic recipe rather than copying this component to one operation.", true),
  composite("ELEC_ROUTE_BACK_TO_BACK", ["ELEC_ROUTE_LAYOUT_SETUP", "ELEC_DRILL_FRAMING_CROSSING", "ELEC_FISH_CABLE_CONCEALED"], "Its short concealed connection is a conditional recipe, not one atomic unit."),
  composite("ELEC_ROUTE_ACCESSIBLE_CONCEALED", ["ELEC_ROUTE_LAYOUT_SETUP", "ELEC_NM_CABLE_ACCESSIBLE", "ELEC_DRILL_TOP_OR_BOTTOM_PLATE", "ELEC_FISH_WALL_TO_BOX"], "Its labor depends on measured footage and actual penetrations/fishes."),
  composite("ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS", ["ELEC_ROUTE_LAYOUT_SETUP", "ELEC_FISH_CABLE_CONCEALED"], "Route setup and measured concealed cable remain separate from baseboard restoration."),
  composite("ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS", ["ELEC_ROUTE_LAYOUT_SETUP", "ELEC_CUT_DRYWALL_ACCESS_OPENING"], "Opening count is geometry-driven and cannot be folded into one setup value."),
  composite("SURFACE_ROUTE_FT", ["ELEC_SURFACE_RACEWAY", "ELEC_SURFACE_RACEWAY_SUPPORT", "ELEC_PULL_SURFACE_RACEWAY_CONDUCTOR"], "One route foot does not imply one support or one conductor-foot; the connected surface-route adapter obtains those quantities from contractor system facts.", true),
  composite("CONCEALED_ROUTE_FT", ["ELEC_NM_CABLE_ACCESSIBLE", "ELEC_FISH_CABLE_CONCEALED"], "The applicable per-foot operation depends on the selected route strategy."),
  exact("SURFACE_ROUTE_INSIDE_CORNER", "ELEC_SURFACE_RACEWAY_INSIDE_CORNER", true),
  exact("SURFACE_ROUTE_OUTSIDE_CORNER", "ELEC_SURFACE_RACEWAY_OUTSIDE_CORNER", true),
  exact("SURFACE_ROUTE_FLAT_CORNER", "ELEC_SURFACE_RACEWAY_FLAT_CORNER", true),
  composite("OUTLET_EXTENSION_CORE", ["ELEC_INSTALL_OLD_WORK_BOX", "ELEC_CONNECT_EXISTING_BRANCH_SOURCE", "ELEC_INSTALL_NEW_RECEPTACLE", "ELEC_TEST_BRANCH_EXTENSION", "ELEC_BRANCH_WORK_CLEANUP"], "The connected surface-outlet recipe sums these five operations; other endpoint/route combinations remain separately governed.", true),
  composite("SWITCH_ENDPOINT_CORE", ["ELEC_CONNECT_EXISTING_BRANCH_SOURCE", "ELEC_TERMINATE_SWITCH", "ELEC_TEST_BRANCH_EXTENSION", "ELEC_BRANCH_WORK_CLEANUP"], "The connected surface-switch recipe sums the endpoint operations; concealed box work remains separately governed.", true),
  composite("FIXTURE_BOX_ENDPOINT", ["ELEC_CONNECT_EXISTING_BRANCH_SOURCE", "ELEC_TERMINATE_POWERED_FIXTURE_BOX", "ELEC_TEST_BRANCH_EXTENSION", "ELEC_BRANCH_WORK_CLEANUP"], "The connected surface-fixture-box recipe sums the endpoint operations; concealed box support remains separately governed.", true),
  composite("SURFACE_DEVICE_BOX_OUTLET", ["ELEC_SURFACE_DEVICE_BOX"], "The surface-outlet recipe consumes the shared physical box-mounting operation.", true),
  composite("SURFACE_DEVICE_BOX_SWITCH", ["ELEC_SURFACE_DEVICE_BOX"], "The surface-switch recipe consumes the shared physical box-mounting operation.", true),
  composite("SURFACE_FIXTURE_BOX", ["ELEC_SURFACE_FIXTURE_BOX"], "The surface-fixture-box recipe uses its distinct fixture-rated mounting operation.", true),
  composite("RESTORE_BASEBOARD_ACCESS", ["ELEC_REMOVE_REINSTALL_BASEBOARD"], "The atomic unit is per foot, while the current component quantity is one per route; measured restoration length must be supplied."),
  composite("RESTORE_DRYWALL_ACCESS", ["ELEC_PATCH_DRYWALL_ACCESS_OPENING"], "The atomic unit is per opening, while the current component quantity is one per route; the geometry-derived opening count must be supplied."),
] as const;

export function routingV2LaborAuthority(componentKey: string): RoutingV2LaborAuthority | null {
  return ROUTING_V2_LABOR_AUTHORITY.find((entry) => entry.componentKey === componentKey) ?? null;
}

export function summarizeRoutingV2LaborBridge() {
  return {
    componentCount: ROUTING_V2_LABOR_AUTHORITY.length,
    exactButUnwiredCount: ROUTING_V2_LABOR_AUTHORITY.filter((entry) => entry.kind === "EXACT_ATOMIC_OPERATION" && !entry.runtimeUsesAtomicDecision).length,
    compositeUnwiredCount: ROUTING_V2_LABOR_AUTHORITY.filter((entry) => entry.kind === "COMPOSITE_RECIPE_REQUIRED" && !entry.runtimeUsesAtomicDecision).length,
    runtimeConnectedCount: ROUTING_V2_LABOR_AUTHORITY.filter((entry) => entry.runtimeUsesAtomicDecision).length,
  };
}
