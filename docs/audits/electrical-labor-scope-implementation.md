# Electrical labor scope implementation ledger

This distinguishes a designed collection path from capture code, takeoff-engine support and an actual runtime connection. A row is not complete merely because Route Assist or a formula exists.

- Affected services: **43**
- Grouped collection tasks: **23**
- Tasks fully runtime connected: **0**
- Tasks with any runtime connection: **4**
- Source-authority mismatches: **1**

| Collection task | Path | State | Connected services | Services awaiting connection | Evidence |
|---|---|---|---|---:|---|
| FRAMING_POLICY | CONTRACTOR_POLICY | PARTIAL_RUNTIME_CONNECTION | new-120v-outlet | 18 | lib/electrical/loadDerivedScope.ts; lib/electrical/concealedRouteMaterialConfiguration.ts |
| APPLIANCE_EXISTING_CONDITION | CUSTOMER_TREE | DESIGNED_ONLY | — | 1 | — |
| CONNECTED_DEVICE_SCOPE | CUSTOMER_TREE | DESIGNED_ONLY | — | 7 | — |
| LANDSCAPE_LAYOUT | CUSTOMER_TREE | DESIGNED_ONLY | — | 1 | — |
| LIGHTING_LAYOUT | CUSTOMER_TREE | DESIGNED_ONLY | — | 2 | — |
| MEDIA_SCOPE | CUSTOMER_TREE | DESIGNED_ONLY | — | 2 | — |
| ROUTE_ACCESS | CUSTOMER_TREE | PARTIAL_RUNTIME_CONNECTION | new-120v-outlet | 22 | prisma/seed-new-outlet-v2.ts; lib/electrical/loadDerivedScope.ts |
| TRANSFER_SWITCH_TAKEOFF | CUSTOMER_TREE | DESIGNED_ONLY | — | 1 | — |
| FINISHED_ROUTE_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | PARTIAL_RUNTIME_CONNECTION | new-120v-outlet | 21 | lib/visual-assist/route-assist/guidedFlowInvocation.ts; prisma/_finishedWallModule.ts; lib/electrical/loadDerivedScope.ts |
| GENERAL_ROUTE_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | DESIGNED_ONLY | — | 2 | — |
| LANDSCAPE_LAYOUT | ROUTE_ASSIST_CONFIRMED | DESIGNED_ONLY | — | 1 | — |
| LIGHTING_LAYOUT_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | CAPTURE_IMPLEMENTED_UNBOUND | — | 1 | lib/electrical/lightingRouteAssistFacts.ts; lib/electrical/lightingRouteFacts.ts |
| MEDIA_ROUTE_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | DESIGNED_ONLY | — | 1 | — |
| RACEWAY_ROUTE_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | DESIGNED_ONLY | — | 3 | — |
| SURFACE_RACEWAY_GEOMETRY | ROUTE_ASSIST_CONFIRMED | CAPTURE_IMPLEMENTED_UNBOUND | — | 3 | lib/electrical/routeAssistRoutingV2Facts.ts |
| APPLIANCE_EXISTING_CONDITION | GUIDED_PHOTO_REVIEW | DESIGNED_ONLY | — | 1 | — |
| CONNECTED_DEVICE_REMEDIATION_REVIEW | GUIDED_PHOTO_REVIEW | DESIGNED_ONLY | — | 1 | — |
| DOORBELL_REMEDIATION_REVIEW | GUIDED_PHOTO_REVIEW | DESIGNED_ONLY | — | 1 | — |
| EQUIPMENT_ADAPTATION_REVIEW | GUIDED_PHOTO_REVIEW | DESIGNED_ONLY | — | 4 | — |
| SPECIALTY_EQUIPMENT_TAKEOFF | GUIDED_PHOTO_REVIEW | DESIGNED_ONLY | — | 2 | — |
| ACCESSIBLE_ROUTE_MEASUREMENT | CONTRACTOR_MEASUREMENT | SOURCE_AUTHORITY_MISMATCH | new-120v-outlet | 21 | prisma/_concealedRouteModules.ts; lib/visual-assist/route-assist/guidedFlowInvocation.ts |
| RACEWAY_CONDUCTOR_TAKEOFF | SYSTEM_DERIVED | ENGINE_READY_UNCONNECTED | — | 5 | lib/electrical/loadSurfaceTakeoff.ts; lib/electrical/surfaceRouteAtomicLaborBridge.ts |
| SURFACE_RACEWAY_TAKEOFF | SYSTEM_DERIVED | ENGINE_READY_UNCONNECTED | — | 3 | lib/electrical/loadSurfaceTakeoff.ts; lib/electrical/surfaceRouteAtomicLaborBridge.ts |

## Notes

- **FRAMING_POLICY / CONTRACTOR_POLICY:** The drywall route consumes a contractor policy for the connected new-outlet flow; broader recipe binding remains incomplete.
- **APPLIANCE_EXISTING_CONDITION / CUSTOMER_TREE:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **CONNECTED_DEVICE_SCOPE / CUSTOMER_TREE:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **LANDSCAPE_LAYOUT / CUSTOMER_TREE:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **LIGHTING_LAYOUT / CUSTOMER_TREE:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **MEDIA_SCOPE / CUSTOMER_TREE:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **ROUTE_ACCESS / CUSTOMER_TREE:** Routing V2 connects this decision for new-120v-outlet only; the other affected services remain unconnected.
- **TRANSFER_SWITCH_TAKEOFF / CUSTOMER_TREE:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **FINISHED_ROUTE_MEASUREMENT / ROUTE_ASSIST_CONFIRMED:** Confirmed concealed footage can reach Routing V2 for new-120v-outlet; perpendicular framing footage and the other affected services are not connected.
- **GENERAL_ROUTE_MEASUREMENT / ROUTE_ASSIST_CONFIRMED:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **LANDSCAPE_LAYOUT / ROUTE_ASSIST_CONFIRMED:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **LIGHTING_LAYOUT_MEASUREMENT / ROUTE_ASSIST_CONFIRMED:** Validated cable-path projection exists, but it deliberately cannot infer joist direction and is not connected to customer pricing runtime.
- **MEDIA_ROUTE_MEASUREMENT / ROUTE_ASSIST_CONFIRMED:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **RACEWAY_ROUTE_MEASUREMENT / ROUTE_ASSIST_CONFIRMED:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **SURFACE_RACEWAY_GEOMETRY / ROUTE_ASSIST_CONFIRMED:** Validated geometry projection exists with automaticBindingAuthorized=false; the three surface-mounted service recipes are not runtime connected.
- **APPLIANCE_EXISTING_CONDITION / GUIDED_PHOTO_REVIEW:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **CONNECTED_DEVICE_REMEDIATION_REVIEW / GUIDED_PHOTO_REVIEW:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **DOORBELL_REMEDIATION_REVIEW / GUIDED_PHOTO_REVIEW:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **EQUIPMENT_ADAPTATION_REVIEW / GUIDED_PHOTO_REVIEW:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **SPECIALTY_EQUIPMENT_TAKEOFF / GUIDED_PHOTO_REVIEW:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **ACCESSIBLE_ROUTE_MEASUREMENT / CONTRACTOR_MEASUREMENT:** The current tree asks the homeowner for hidden accessible-path footage. Route Assist correctly refuses to populate it because Route Assist is reserved for inaccessible finished-space or surface routes; contractor-measurement authority is not yet enforced end to end.
- **RACEWAY_CONDUCTOR_TAKEOFF / SYSTEM_DERIVED:** Surface-system takeoff logic exists, but the affected catalog services are not connected to it.
- **SURFACE_RACEWAY_TAKEOFF / SYSTEM_DERIVED:** Joint/support takeoff logic exists, but the affected surface-mounted service recipes are not connected to it.

