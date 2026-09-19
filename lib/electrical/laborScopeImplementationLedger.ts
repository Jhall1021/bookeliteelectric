import { buildElectricalLaborScopeCollectionPlan, type LaborScopeCollectionTask } from "./laborScopeCollectionPlan";
import { buildElectricalServiceLaborReadiness } from "./serviceLaborReadiness";

export type ScopeCollectionImplementationState =
  | "DESIGNED_ONLY"
  | "CAPTURE_IMPLEMENTED_UNBOUND"
  | "ENGINE_READY_UNCONNECTED"
  | "PARTIAL_RUNTIME_CONNECTION"
  | "SOURCE_AUTHORITY_MISMATCH";

type GroupImplementation = {
  state: ScopeCollectionImplementationState;
  evidencePaths: string[];
  note: string;
};

const designedOnly: GroupImplementation = {
  state: "DESIGNED_ONLY",
  evidencePaths: [],
  note: "Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.",
};

/** Conservative, reviewed evidence only. Absence means designed—not implemented. */
export const ELECTRICAL_SCOPE_GROUP_IMPLEMENTATION: Record<string, GroupImplementation> = {
  ROUTE_ACCESS: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["prisma/seed-new-outlet-v2.ts", "lib/electrical/loadDerivedScope.ts"],
    note: "Routing V2 connects this decision for new-120v-outlet only; the other affected services remain unconnected.",
  },
  ACCESSIBLE_ROUTE_MEASUREMENT: {
    state: "SOURCE_AUTHORITY_MISMATCH",
    evidencePaths: ["prisma/_concealedRouteModules.ts", "lib/visual-assist/route-assist/guidedFlowInvocation.ts"],
    note: "The current tree asks the homeowner for hidden accessible-path footage. Route Assist correctly refuses to populate it because Route Assist is reserved for inaccessible finished-space or surface routes; contractor-measurement authority is not yet enforced end to end.",
  },
  FINISHED_ROUTE_MEASUREMENT: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["lib/visual-assist/route-assist/guidedFlowInvocation.ts", "prisma/_finishedWallModule.ts", "lib/electrical/loadDerivedScope.ts"],
    note: "Confirmed concealed footage can reach Routing V2 for new-120v-outlet; perpendicular framing footage and the other affected services are not connected.",
  },
  FRAMING_POLICY: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["lib/electrical/loadDerivedScope.ts", "lib/electrical/concealedRouteMaterialConfiguration.ts"],
    note: "The drywall route consumes a contractor policy for the connected new-outlet flow; broader recipe binding remains incomplete.",
  },
  LIGHTING_LAYOUT_MEASUREMENT: {
    state: "CAPTURE_IMPLEMENTED_UNBOUND",
    evidencePaths: ["lib/electrical/lightingRouteAssistFacts.ts", "lib/electrical/lightingRouteFacts.ts"],
    note: "Validated cable-path projection exists, but it deliberately cannot infer joist direction and is not connected to customer pricing runtime.",
  },
  SURFACE_RACEWAY_GEOMETRY: {
    state: "CAPTURE_IMPLEMENTED_UNBOUND",
    evidencePaths: ["lib/electrical/routeAssistRoutingV2Facts.ts"],
    note: "Validated geometry projection exists with automaticBindingAuthorized=false; the three surface-mounted service recipes are not runtime connected.",
  },
  RACEWAY_CONDUCTOR_TAKEOFF: {
    state: "ENGINE_READY_UNCONNECTED",
    evidencePaths: ["lib/electrical/loadSurfaceTakeoff.ts", "lib/electrical/surfaceRouteAtomicLaborBridge.ts"],
    note: "Surface-system takeoff logic exists, but the affected catalog services are not connected to it.",
  },
  SURFACE_RACEWAY_TAKEOFF: {
    state: "ENGINE_READY_UNCONNECTED",
    evidencePaths: ["lib/electrical/loadSurfaceTakeoff.ts", "lib/electrical/surfaceRouteAtomicLaborBridge.ts"],
    note: "Joint/support takeoff logic exists, but the affected surface-mounted service recipes are not connected to it.",
  },
};

export type LaborScopeImplementationRow = LaborScopeCollectionTask & GroupImplementation & {
  runtimeConnectedServiceSlugs: string[];
  servicesAwaitingRuntimeConnection: string[];
};

/** Honest implementation ledger: design, capture, engine and runtime are distinct. */
export function buildElectricalLaborScopeImplementationLedger(): LaborScopeImplementationRow[] {
  const readiness = buildElectricalServiceLaborReadiness();
  const affected = readiness.filter((row) => row.missingScopeFacts.length > 0);
  const runtimeConnected = new Set(readiness.filter((row) => row.runtimeConnection === "CONNECTED").map((row) => row.serviceSlug));
  return buildElectricalLaborScopeCollectionPlan(affected.map((row) => row.serviceSlug)).map((task) => {
    const implementation = ELECTRICAL_SCOPE_GROUP_IMPLEMENTATION[task.collectionGroupKey] ?? designedOnly;
    return {
      ...task,
      ...implementation,
      runtimeConnectedServiceSlugs: task.serviceSlugs.filter((slug) => runtimeConnected.has(slug)),
      servicesAwaitingRuntimeConnection: task.serviceSlugs.filter((slug) => !runtimeConnected.has(slug)),
    };
  });
}
