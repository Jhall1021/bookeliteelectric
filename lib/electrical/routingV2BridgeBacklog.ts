/**
 * Remaining Routing V2 authority work after the surface-outlet bridge.
 *
 * A route becomes priceable only when BOTH its material takeoff and atomic
 * labor quantities can be derived from established facts. This list prevents
 * completion of one half from being reported as completion of the route.
 */
export type RoutingV2BridgeBacklogItem = {
  componentKey: string;
  materialAuthority: "MISSING_ROUTE_TAKEOFF" | "ROUTE_TAKEOFF_AVAILABLE";
  laborAuthority: "MISSING_FACT_ADAPTER" | "CONNECTED";
  missingFacts: readonly string[];
  nextWork: string;
};

export const ROUTING_V2_BRIDGE_BACKLOG: readonly RoutingV2BridgeBacklogItem[] = [
  {
    componentKey: "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS",
    materialAuthority: "MISSING_ROUTE_TAKEOFF",
    laborAuthority: "MISSING_FACT_ADAPTER",
    missingFacts: ["concealed cable assembly", "framing direction", "framing spacing", "access-opening count"],
    nextWork: "Collect observable route geometry or contractor defaults before deriving crossings and openings.",
  },
  {
    componentKey: "RESTORE_DRYWALL_ACCESS",
    materialAuthority: "MISSING_ROUTE_TAKEOFF",
    laborAuthority: "MISSING_FACT_ADAPTER",
    missingFacts: ["patch count", "patch material recipe"],
    nextWork: "Bind geometry-derived openings to patch labor and an explicit patch-material takeoff.",
  },
] as const;

export function summarizeRoutingV2BridgeBacklog() {
  return {
    remainingComponentCount: ROUTING_V2_BRIDGE_BACKLOG.length,
    missingMaterialTakeoffCount: ROUTING_V2_BRIDGE_BACKLOG.filter((item) => item.materialAuthority === "MISSING_ROUTE_TAKEOFF").length,
    missingLaborAdapterCount: ROUTING_V2_BRIDGE_BACKLOG.filter((item) => item.laborAuthority === "MISSING_FACT_ADAPTER").length,
  };
}
