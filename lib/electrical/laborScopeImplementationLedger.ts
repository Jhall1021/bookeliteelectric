import { buildElectricalLaborScopeCollectionPlan, type LaborScopeCollectionTask } from "./laborScopeCollectionPlan";
import { buildElectricalServiceLaborReadiness } from "./serviceLaborReadiness";

export type ScopeCollectionImplementationState =
  | "DESIGNED_ONLY"
  | "CAPTURE_IMPLEMENTED_UNBOUND"
  | "ENGINE_READY_UNCONNECTED"
  | "PARTIAL_RUNTIME_CONNECTION"
  | "RUNTIME_CONNECTED"
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
    evidencePaths: ["prisma/seed-new-outlet-v2.ts", "prisma/seed-questions.ts", "lib/electrical/loadDerivedScope.ts", "app/api/admin/quotes/[quoteId]/low-voltage-scope/route.ts", "app/api/admin/quotes/[quoteId]/flood-camera-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-ceiling-light-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-ceiling-fan-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-wall-sconce-scope/route.ts", "app/api/admin/quotes/[quoteId]/recessed-lighting-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-exterior-light-scope/route.ts", "app/api/admin/quotes/[quoteId]/electric-fireplace-scope/route.ts", "app/api/admin/quotes/[quoteId]/appliance-240v-scope/route.ts", "app/api/admin/quotes/[quoteId]/exterior-gfci-scope/route.ts", "app/api/admin/quotes/[quoteId]/garage-opener-scope/route.ts"],
    note: "Routing V2 connects new-120v-outlet. Ethernet and coax connect only their contractor-reviewed standard accessible packages. The new floodlight camera connects only after guided review confirms a true back-to-back source. New ceiling light, fan, wall sconce, recessed lighting, one exterior-light location, plug-in fireplace circuit, exact four-wire dryer/range circuits, routed exterior GFCI, protected garage-opener outlet and sump-pump circuit connect only their reviewed accessible packages; other affected routes remain unconnected.",
  },
  ACCESSIBLE_ROUTE_MEASUREMENT: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["prisma/_concealedRouteModules.ts", "lib/visual-assist/route-assist/guidedFlowInvocation.ts", "lib/electrical/concealedRouteMaterialConfiguration.ts", "lib/electrical/loadConcealedRouteTakeoff.ts", "app/api/admin/quotes/[quoteId]/labor-scope/route.ts", "app/api/admin/quotes/[quoteId]/low-voltage-scope/route.ts", "app/api/admin/quotes/[quoteId]/dedicated-circuit-scope/route.ts", "app/api/admin/quotes/[quoteId]/electric-fireplace-scope/route.ts", "app/api/admin/quotes/[quoteId]/appliance-240v-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-ceiling-light-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-ceiling-fan-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-wall-sconce-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-exterior-light-scope/route.ts", "app/api/admin/quotes/[quoteId]/exterior-gfci-scope/route.ts", "app/api/admin/quotes/[quoteId]/garage-opener-scope/route.ts", "app/api/admin/quotes/[quoteId]/garage-240v-scope/route.ts", "scripts/apply-dedicated-circuit-entry-aliases.ts"],
    note: "A homeowner estimate is review context only. New outlet, the bounded 15A, sump-specific 20A, plug-in fireplace and exact four-wire dryer/range circuit packages, and the reviewed accessible new-ceiling-light/fan/sconce, recessed-lighting, one-location exterior-light, routed exterior-GFCI and protected garage-opener packages use contractor-confirmed measurements; cable-support counts come from contractor policy. Ethernet and coax may instead use the contractor-approved maximum footage for their standard accessible package. Other affected services still await binding. Route Assist remains reserved for inaccessible finished-space or surface routes.",
  },
  PANEL_CAPACITY_REVIEW: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["prisma/seed-dedicated-circuit.ts", "prisma/seed-electric-fireplace-circuit.ts", "prisma/seed-240v-appliance-circuits.ts", "prisma/seed-questions.ts", "prisma/seed-240v-garage-outlet.ts", "app/api/admin/quotes/[quoteId]/dedicated-circuit-scope/route.ts", "app/api/admin/quotes/[quoteId]/electric-fireplace-scope/route.ts", "app/api/admin/quotes/[quoteId]/appliance-240v-scope/route.ts", "app/api/admin/quotes/[quoteId]/garage-240v-scope/route.ts", "scripts/apply-dedicated-circuit-entry-aliases.ts"],
    note: "The reviewed 15A accessible dedicated-circuit package and its bidet/refrigerator entries, the sump-specific 20A/GFCI package, the plug-in fireplace 15A/20A package, the exact four-wire dryer/range packages, and the four reviewed open-garage 240V receptacle configurations require explicit contractor confirmation that the existing panel can accept the circuit. Other appliance-specific and higher-risk paths remain review-bound.",
  },
  APPLIANCE_CIRCUIT_REVIEW: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["prisma/seed-240v-appliance-circuits.ts", "lib/electrical/appliance240vReviewPackage.ts", "app/api/admin/quotes/[quoteId]/appliance-240v-scope/route.ts"],
    note: "Only the reviewed modern four-wire 30A dryer and 50A range packages connect after contractor confirmation of the appliance instructions, plug, surface-box endpoint and panel capacity. Legacy three-wire, hardwired, flush-wall, finished-route and remediation scopes remain manual review.",
  },
  FIREPLACE_EQUIPMENT_REVIEW: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["prisma/seed-electric-fireplace-circuit.ts", "lib/electrical/electricFireplaceReviewPackage.ts", "app/api/admin/quotes/[quoteId]/electric-fireplace-scope/route.ts"],
    note: "Only contractor review of the label or manufacturer instructions can confirm the bounded standard plug-in 120V 15A/20A fireplace package. Hardwired, 240V, nonstandard-plug and uncertain equipment remain review-bound.",
  },
  SUMP_PUMP_PROTECTION_REVIEW: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["lib/electrical/atomicLabor.ts", "lib/electrical/laborScopeFactRegistry.ts", "lib/electrical/dedicatedCircuitReviewPackage.ts", "prisma/seed-materials.ts", "app/api/admin/quotes/[quoteId]/dedicated-circuit-scope/route.ts"],
    note: "The reviewed accessible sump-pump branch binds its distinct 20A GFCI atomic recipe and exact material roles after contractor confirmation. Finished, inaccessible, long-route and remediation branches remain review-bound.",
  },
  GARAGE_PROTECTION_REVIEW: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["prisma/seed-questions.ts", "lib/electrical/garageOpenerReviewPackage.ts", "app/api/admin/quotes/[quoteId]/garage-opener-scope/route.ts"],
    note: "Both garage-opener storefront entries converge on one blocking guided-photo review. Only the accessible branch with contractor-confirmed existing upstream protection connects to runtime pricing; new or uncertain protection and finished routes remain manual review.",
  },
  LIGHTING_SOURCE_REVIEW: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["lib/electrical/newCeilingLightReviewPackage.ts", "lib/electrical/recessedLightingReviewPackage.ts", "lib/electrical/newExteriorLightReviewPackage.ts", "app/api/admin/quotes/[quoteId]/new-ceiling-light-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-ceiling-fan-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-wall-sconce-scope/route.ts", "app/api/admin/quotes/[quoteId]/recessed-lighting-scope/route.ts", "app/api/admin/quotes/[quoteId]/new-exterior-light-scope/route.ts"],
    note: "The reviewed accessible new-ceiling-light, new-ceiling-fan, new-wall-sconce, recessed-lighting and one-location exterior-light packages record contractor confirmation of the existing lighting source. New-switch, uncertain-source, dimmer, specialty-wall, high-access and finished-route branches remain review-bound.",
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
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["lib/electrical/lightingRouteAssistFacts.ts", "lib/electrical/lightingRouteFacts.ts", "lib/electrical/recessedLightingTakeoff.ts", "app/api/admin/quotes/[quoteId]/recessed-lighting-scope/route.ts"],
    note: "The accessible recessed-lighting branch prices only from contractor-measured cable geometry; Route Assist remains excluded from accessible attic authority. Finished-space layout geometry remains review-bound.",
  },
  LIGHTING_LAYOUT: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["prisma/seed-recessed-lighting.ts", "lib/electrical/recessedLightingReviewPackage.ts", "app/api/admin/quotes/[quoteId]/recessed-lighting-scope/route.ts", "prisma/seed-new-exterior-light-location.ts", "lib/electrical/newExteriorLightReviewPackage.ts", "app/api/admin/quotes/[quoteId]/new-exterior-light-scope/route.ts"],
    note: "The customer's whole-number recessed-light count feeds the reviewed accessible package. The narrowed exterior package fixes the count at exactly one; additional exterior locations remain review-bound.",
  },
  SURFACE_RACEWAY_GEOMETRY: {
    state: "RUNTIME_CONNECTED",
    evidencePaths: ["prisma/_surfaceRouteModule.ts", "lib/electrical/loadDerivedScope.ts", "lib/electrical/surfaceRouteReview.ts"],
    note: "All three surface-mounted services feed customer-visible geometry through the shared takeoff and atomic labor bridge. Route Assist projection retains automaticBindingAuthorized=false; it requires explicit contractor confirmation and never approves a price.",
  },
  RACEWAY_CONDUCTOR_TAKEOFF: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["lib/electrical/loadSurfaceTakeoff.ts", "lib/electrical/surfaceRouteAtomicLaborBridge.ts"],
    note: "The three surface-mounted services consume contractor-declared conductor policy through the shared material takeoff and atomic labor bridge; pool-equipment and transfer-switch recipes remain unconnected.",
  },
  SURFACE_RACEWAY_TAKEOFF: {
    state: "RUNTIME_CONNECTED",
    evidencePaths: ["lib/electrical/loadSurfaceTakeoff.ts", "lib/electrical/surfaceRouteAtomicLaborBridge.ts"],
    note: "The three surface-mounted services consume the shared joint, support and fitting takeoff in runtime pricing.",
  },
  CONNECTED_DEVICE_SCOPE: {
    state: "PARTIAL_RUNTIME_CONNECTION",
    evidencePaths: ["lib/electrical/connectedDeviceLaborFacts.ts", "lib/electrical/laborServiceApproval.ts", "app/api/portal/labor-service-review/route.ts", "app/api/admin/quotes/[quoteId]/doorbell-scope/route.ts", "app/api/admin/quotes/[quoteId]/flood-camera-scope/route.ts"],
    note: "An explicitly resolved contractor commissioning policy binds five compatible clean-device packages plus the reviewed new-doorbell and hardwired back-to-back floodlight-camera packages to atomic pricing. Other connected-device routes with remediation or unmeasured scope remain review-bound.",
  },
  DOORBELL_REMEDIATION_REVIEW: {
    state: "RUNTIME_CONNECTED",
    evidencePaths: ["prisma/seed-video-doorbell-wiring.ts", "app/api/admin/quotes/[quoteId]/doorbell-scope/route.ts"],
    note: "The reviewed standard new-doorbell package derives transformer scope from the no-existing-wiring service path and records the contractor's guided-review confirmation of its included plate penetration. Nonstandard doorbell paths remain review-only.",
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
