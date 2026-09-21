# Electrical labor scope implementation ledger

This distinguishes a designed collection path from capture code, takeoff-engine support and an actual runtime connection. A row is not complete merely because Route Assist or a formula exists.

- Affected services: **40**
- Grouped collection tasks: **21**
- Tasks fully runtime connected: **0**
- Tasks with any runtime connection: **5**
- Source-authority mismatches: **0**

| Collection task | Path | State | Connected services | Services awaiting connection | Evidence |
|---|---|---|---|---:|---|
| FRAMING_POLICY | CONTRACTOR_POLICY | PARTIAL_RUNTIME_CONNECTION | new-120v-outlet | 18 | lib/electrical/loadDerivedScope.ts; lib/electrical/concealedRouteMaterialConfiguration.ts |
| CONNECTED_DEVICE_SCOPE | CUSTOMER_TREE | PARTIAL_RUNTIME_CONNECTION | customer-supplied-smart-switch, floodlight-camera-existing, smart-outlet-upgrade, video-doorbell-existing-wiring | 3 | lib/electrical/connectedDeviceLaborFacts.ts; lib/electrical/laborServiceApproval.ts; app/api/portal/labor-service-review/route.ts |
| LANDSCAPE_LAYOUT | CUSTOMER_TREE | DESIGNED_ONLY | — | 1 | — |
| LIGHTING_LAYOUT | CUSTOMER_TREE | DESIGNED_ONLY | — | 2 | — |
| MEDIA_SCOPE | CUSTOMER_TREE | DESIGNED_ONLY | — | 1 | — |
| ROUTE_ACCESS | CUSTOMER_TREE | PARTIAL_RUNTIME_CONNECTION | new-120v-outlet | 22 | prisma/seed-new-outlet-v2.ts; lib/electrical/loadDerivedScope.ts |
| TRANSFER_SWITCH_TAKEOFF | CUSTOMER_TREE | DESIGNED_ONLY | — | 1 | — |
| FINISHED_ROUTE_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | PARTIAL_RUNTIME_CONNECTION | new-120v-outlet | 21 | lib/visual-assist/route-assist/guidedFlowInvocation.ts; prisma/_finishedWallModule.ts; lib/electrical/loadDerivedScope.ts |
| GENERAL_ROUTE_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | DESIGNED_ONLY | — | 2 | — |
| LANDSCAPE_LAYOUT | ROUTE_ASSIST_CONFIRMED | DESIGNED_ONLY | — | 1 | — |
| LIGHTING_LAYOUT_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | CAPTURE_IMPLEMENTED_UNBOUND | — | 1 | lib/electrical/lightingRouteAssistFacts.ts; lib/electrical/lightingRouteFacts.ts |
| MEDIA_ROUTE_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | DESIGNED_ONLY | — | 1 | — |
| RACEWAY_ROUTE_MEASUREMENT | ROUTE_ASSIST_CONFIRMED | DESIGNED_ONLY | — | 3 | — |
| SURFACE_RACEWAY_GEOMETRY | ROUTE_ASSIST_CONFIRMED | CAPTURE_IMPLEMENTED_UNBOUND | — | 3 | lib/electrical/routeAssistRoutingV2Facts.ts; lib/electrical/surfaceRouteReview.ts |
| CONNECTED_DEVICE_REMEDIATION_REVIEW | GUIDED_PHOTO_REVIEW | DESIGNED_ONLY | — | 1 | — |
| DOORBELL_REMEDIATION_REVIEW | GUIDED_PHOTO_REVIEW | DESIGNED_ONLY | — | 1 | — |
| EQUIPMENT_ADAPTATION_REVIEW | GUIDED_PHOTO_REVIEW | DESIGNED_ONLY | — | 3 | — |
| SPECIALTY_EQUIPMENT_TAKEOFF | GUIDED_PHOTO_REVIEW | DESIGNED_ONLY | — | 2 | — |
| ACCESSIBLE_ROUTE_MEASUREMENT | CONTRACTOR_MEASUREMENT | PARTIAL_RUNTIME_CONNECTION | new-120v-outlet | 21 | prisma/_concealedRouteModules.ts; lib/visual-assist/route-assist/guidedFlowInvocation.ts; app/api/admin/quotes/[quoteId]/labor-scope/route.ts |
| RACEWAY_CONDUCTOR_TAKEOFF | SYSTEM_DERIVED | ENGINE_READY_UNCONNECTED | — | 5 | lib/electrical/loadSurfaceTakeoff.ts; lib/electrical/surfaceRouteAtomicLaborBridge.ts |
| SURFACE_RACEWAY_TAKEOFF | SYSTEM_DERIVED | ENGINE_READY_UNCONNECTED | — | 3 | lib/electrical/loadSurfaceTakeoff.ts; lib/electrical/surfaceRouteAtomicLaborBridge.ts |

## Notes

- **FRAMING_POLICY / CONTRACTOR_POLICY:** The drywall route consumes a contractor policy for the connected new-outlet flow; broader recipe binding remains incomplete.
- **CONNECTED_DEVICE_SCOPE / CUSTOMER_TREE:** An explicitly resolved contractor commissioning policy binds smart-switch and smart-outlet recipes to atomic duration review. Smart thermostats remain unconnected until guided review establishes whether power remediation is required.
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
- **SURFACE_RACEWAY_GEOMETRY / ROUTE_ASSIST_CONFIRMED:** Validated geometry projection exists with automaticBindingAuthorized=false, and an explicit contractor review can confirm or correct the four physical facts into shared Routing V2 components. The three inactive surface-mounted services are still not runtime connected or price-approved.
- **CONNECTED_DEVICE_REMEDIATION_REVIEW / GUIDED_PHOTO_REVIEW:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **DOORBELL_REMEDIATION_REVIEW / GUIDED_PHOTO_REVIEW:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **EQUIPMENT_ADAPTATION_REVIEW / GUIDED_PHOTO_REVIEW:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **SPECIALTY_EQUIPMENT_TAKEOFF / GUIDED_PHOTO_REVIEW:** Collection authority is defined, but no verified end-to-end producer and binding exists for the affected services.
- **ACCESSIBLE_ROUTE_MEASUREMENT / CONTRACTOR_MEASUREMENT:** A homeowner estimate is review context only. The authenticated quote-review path now records a separate contractor measurement and recomputes the connected new-120v-outlet scope; other affected services still await binding. Route Assist remains reserved for inaccessible finished-space or surface routes.
- **RACEWAY_CONDUCTOR_TAKEOFF / SYSTEM_DERIVED:** Surface-system takeoff logic exists, but the affected catalog services are not connected to it.
- **SURFACE_RACEWAY_TAKEOFF / SYSTEM_DERIVED:** Joint/support takeoff logic exists, but the affected surface-mounted service recipes are not connected to it.

