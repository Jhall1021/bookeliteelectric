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
  runtimeUsesAtomicDecision: false;
  reason: string;
};

const exact = (componentKey: string, operationKey: string): RoutingV2LaborAuthority => ({
  componentKey,
  kind: "EXACT_ATOMIC_OPERATION",
  atomicOperationKeys: [operationKey],
  runtimeUsesAtomicDecision: false,
  reason: "The physical labor scope matches one atomic operation, but the runtime adapter has not been authored.",
});

const composite = (
  componentKey: string,
  atomicOperationKeys: readonly string[],
  reason: string,
): RoutingV2LaborAuthority => ({
  componentKey,
  kind: "COMPOSITE_RECIPE_REQUIRED",
  atomicOperationKeys,
  runtimeUsesAtomicDecision: false,
  reason,
});

export const ROUTING_V2_LABOR_AUTHORITY: readonly RoutingV2LaborAuthority[] = [
  composite("ELEC_ROUTE_SURFACE_MOUNTED", ["ELEC_SURFACE_RACEWAY_SETUP"], "The canonical component also includes mounting and two terminations; setup alone is not its labor."),
  composite("ELEC_ROUTE_BACK_TO_BACK", ["ELEC_ROUTE_LAYOUT_SETUP", "ELEC_DRILL_FRAMING_CROSSING", "ELEC_FISH_CABLE_CONCEALED"], "Its short concealed connection is a conditional recipe, not one atomic unit."),
  composite("ELEC_ROUTE_ACCESSIBLE_CONCEALED", ["ELEC_ROUTE_LAYOUT_SETUP", "ELEC_NM_CABLE_ACCESSIBLE", "ELEC_DRILL_TOP_OR_BOTTOM_PLATE", "ELEC_FISH_WALL_TO_BOX"], "Its labor depends on measured footage and actual penetrations/fishes."),
  composite("ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS", ["ELEC_ROUTE_LAYOUT_SETUP", "ELEC_FISH_CABLE_CONCEALED"], "Route setup and measured concealed cable remain separate from baseboard restoration."),
  composite("ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS", ["ELEC_ROUTE_LAYOUT_SETUP", "ELEC_CUT_DRYWALL_ACCESS_OPENING"], "Opening count is geometry-driven and cannot be folded into one setup value."),
  composite("SURFACE_ROUTE_FT", ["ELEC_SURFACE_RACEWAY", "ELEC_SURFACE_RACEWAY_SUPPORT", "ELEC_PULL_SURFACE_RACEWAY_CONDUCTOR"], "One route foot does not imply one support or one conductor-foot; contractor system facts supply those quantities."),
  composite("CONCEALED_ROUTE_FT", ["ELEC_NM_CABLE_ACCESSIBLE", "ELEC_FISH_CABLE_CONCEALED"], "The applicable per-foot operation depends on the selected route strategy."),
  exact("SURFACE_ROUTE_INSIDE_CORNER", "ELEC_SURFACE_RACEWAY_INSIDE_CORNER"),
  exact("SURFACE_ROUTE_OUTSIDE_CORNER", "ELEC_SURFACE_RACEWAY_OUTSIDE_CORNER"),
  exact("SURFACE_ROUTE_FLAT_CORNER", "ELEC_SURFACE_RACEWAY_FLAT_CORNER"),
  composite("OUTLET_EXTENSION_CORE", ["ELEC_INSTALL_OLD_WORK_BOX", "ELEC_INSTALL_NEW_RECEPTACLE"], "The component also includes source connection, testing and cleanup; the two listed operations are incomplete."),
  composite("SWITCH_ENDPOINT_CORE", ["ELEC_INSTALL_OLD_WORK_BOX", "ELEC_TERMINATE_SWITCH"], "The component also includes source connection, testing and cleanup."),
  composite("FIXTURE_BOX_ENDPOINT", ["ELEC_INSTALL_OLD_WORK_BOX"], "The component also includes source connection, wiring termination and testing."),
  composite("SURFACE_DEVICE_BOX_OUTLET", ["ELEC_SURFACE_DEVICE_BOX"], "The shared device-box operation has not been proven identical to this outlet-specific canonical scope."),
  composite("SURFACE_DEVICE_BOX_SWITCH", ["ELEC_SURFACE_DEVICE_BOX"], "The shared device-box operation has not been proven identical to this switch-specific canonical scope."),
  composite("SURFACE_FIXTURE_BOX", ["ELEC_SURFACE_DEVICE_BOX"], "Fixture support is materially different from an ordinary surface device box."),
  composite("RESTORE_BASEBOARD_ACCESS", [], "No approved atomic baseboard removal/reinstallation operation exists yet."),
  composite("RESTORE_DRYWALL_ACCESS", [], "Drywall patching is excluded from the electrical opening operation and has no approved atomic restoration operation."),
] as const;

export function routingV2LaborAuthority(componentKey: string): RoutingV2LaborAuthority | null {
  return ROUTING_V2_LABOR_AUTHORITY.find((entry) => entry.componentKey === componentKey) ?? null;
}

export function summarizeRoutingV2LaborBridge() {
  return {
    componentCount: ROUTING_V2_LABOR_AUTHORITY.length,
    exactButUnwiredCount: ROUTING_V2_LABOR_AUTHORITY.filter((entry) => entry.kind === "EXACT_ATOMIC_OPERATION").length,
    compositeCount: ROUTING_V2_LABOR_AUTHORITY.filter((entry) => entry.kind === "COMPOSITE_RECIPE_REQUIRED").length,
    runtimeConnectedCount: ROUTING_V2_LABOR_AUTHORITY.filter((entry) => entry.runtimeUsesAtomicDecision).length,
  };
}
