import { strict as assert } from "node:assert";
import { buildElectricalLaborScopeImplementationLedger } from "../lib/electrical/laborScopeImplementationLedger";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; console.log(`  ✓ ${message}`); };
const rows = buildElectricalLaborScopeImplementationLedger();

ok(rows.length === 23, "all 23 currently required authority-specific grouped collection tasks have an implementation row");
ok(new Set(rows.flatMap((row) => row.serviceSlugs)).size === 36, "implementation ledger covers all 36 services with unresolved scope facts");
ok(!rows.some((row) => row.collectionGroupKey === "MEDIA_SCOPE" || row.collectionGroupKey === "MEDIA_ROUTE_MEASUREMENT"), "prepared soundbar branch no longer creates fake concealment collection work");
ok(rows.every((row) => row.state !== "PARTIAL_RUNTIME_CONNECTION" || row.evidencePaths.length > 0), "every partial-runtime claim cites concrete code evidence");
ok(rows.every((row) => row.state !== "CAPTURE_IMPLEMENTED_UNBOUND" || row.evidencePaths.length > 0), "every capture-only claim cites concrete code evidence");
ok(rows.every((row) => row.state !== "ENGINE_READY_UNCONNECTED" || row.evidencePaths.length > 0), "every engine-ready claim cites concrete code evidence");
ok(rows.filter((row) => row.state === "RUNTIME_CONNECTED").every((row) => row.servicesAwaitingRuntimeConnection.length === 0), "fully connected collection groups have no services left awaiting runtime binding");
ok(rows.filter((row) => !["RUNTIME_CONNECTED", "PARTIAL_RUNTIME_CONNECTION"].includes(row.state)).every((row) => row.servicesAwaitingRuntimeConnection.length > 0), "unconnected collection groups still name services awaiting runtime binding");
ok(rows.filter((row) => row.state !== "PARTIAL_RUNTIME_CONNECTION" || row.servicesAwaitingRuntimeConnection.length > 0 || row.note.includes("remain review-bound")), "branch-partial groups with every service represented explicitly document the branches that remain review-bound");

const accessible = rows.find((row) => row.collectionGroupKey === "ACCESSIBLE_ROUTE_MEASUREMENT")!;
ok(accessible.state === "PARTIAL_RUNTIME_CONNECTION", "hidden accessible-route footage now has a bounded contractor-review runtime path");
ok(accessible.note.includes("homeowner") && accessible.note.includes("reserved for inaccessible") && accessible.note.includes("contractor-approved maximum footage"), "the runtime path preserves Route Assist for inaccessible routes and names the contractor authorities for accessible paths");
const lighting = rows.find((row) => row.collectionGroupKey === "LIGHTING_LAYOUT_MEASUREMENT")!;
ok(lighting.state === "CAPTURE_IMPLEMENTED_UNBOUND", "lighting Route Assist projection is not mistaken for runtime binding");
const surface = rows.find((row) => row.collectionGroupKey === "SURFACE_RACEWAY_GEOMETRY")!;
ok(surface.state === "RUNTIME_CONNECTED" && surface.note.includes("automaticBindingAuthorized=false"), "surface services are connected while Route Assist geometry preserves its explicit no-auto-binding boundary");
ok(surface.evidencePaths.includes("lib/electrical/surfaceRouteReview.ts"), "surface geometry cites the explicit contractor-confirmation boundary");
for (const key of ["SURFACE_RACEWAY_GEOMETRY", "RACEWAY_CONDUCTOR_TAKEOFF", "SURFACE_RACEWAY_TAKEOFF"]) {
  const row = rows.find((candidate) => candidate.collectionGroupKey === key)!;
  ok(row.runtimeConnectedServiceSlugs.join() === "surface-mounted-fixture-box,surface-mounted-outlet,surface-mounted-switch", `${key} records all three surface services as runtime connected`);
}
const connected = rows.find((row) => row.collectionGroupKey === "CONNECTED_DEVICE_SCOPE")!;
ok(connected.state === "PARTIAL_RUNTIME_CONNECTION", "connected-device commissioning policy is bound only where technical remediation is not required");
ok(connected.runtimeConnectedServiceSlugs.join() === "customer-supplied-smart-switch,floodlight-camera-existing,new-exterior-flood-camera,new-video-doorbell-wiring,smart-outlet-upgrade,smart-thermostat-install,video-doorbell-existing-wiring", "five clean connected-device packages and the two reviewed new-location packages connect while nonstandard remediation stays review-bound");
const doorbell = rows.find((row) => row.collectionGroupKey === "DOORBELL_REMEDIATION_REVIEW")!;
ok(doorbell.state === "RUNTIME_CONNECTED" && doorbell.runtimeConnectedServiceSlugs.join() === "new-video-doorbell-wiring", "doorbell transformer and penetration facts are connected only through the reviewed standard package");
const panelCapacity = rows.find((row) => row.collectionGroupKey === "PANEL_CAPACITY_REVIEW")!;
ok(panelCapacity.state === "PARTIAL_RUNTIME_CONNECTION" && panelCapacity.runtimeConnectedServiceSlugs.join() === "240v-garage-outlet,240v-garage-outlet-14-30,240v-garage-outlet-14-50,240v-garage-outlet-6-50,bidet-smart-toilet-outlet,dedicated-120v-circuit-outlet,freezer-fridge-dedicated-circuit,sump-pump-dedicated-circuit", "panel capacity connects the reviewed 15A entries, sump-specific 20A package and four exact open-garage 240V configurations while other circuit scope remains review-bound");
const sumpProtection = rows.find((row) => row.collectionGroupKey === "SUMP_PUMP_PROTECTION_REVIEW")!;
ok(sumpProtection.state === "PARTIAL_RUNTIME_CONNECTION" && sumpProtection.runtimeConnectedServiceSlugs.join() === "sump-pump-dedicated-circuit" && sumpProtection.note.includes("remain review-bound"), "sump-pump protection connects only the exact reviewed accessible branch");
const garageProtection = rows.find((row) => row.collectionGroupKey === "GARAGE_PROTECTION_REVIEW")!;
ok(garageProtection.state === "PARTIAL_RUNTIME_CONNECTION" && garageProtection.runtimeConnectedServiceSlugs.join() === "garage-door-opener-outlet,garage-door-opener-outlet-ev" && garageProtection.note.includes("new or uncertain protection"), "garage protection connects only the reviewed confirmed-existing-protection package while remediation remains review-bound");
const lightingSource = rows.find((row) => row.collectionGroupKey === "LIGHTING_SOURCE_REVIEW")!;
ok(lightingSource.state === "PARTIAL_RUNTIME_CONNECTION" && lightingSource.runtimeConnectedServiceSlugs.join() === "new-ceiling-fan,new-ceiling-light,new-wall-sconce", "existing lighting-source suitability connects only through contractor review of the bounded new-light, new-fan and new-sconce packages");
const routeAccess = rows.filter((row) => row.collectionGroupKey === "ROUTE_ACCESS");
const routeAccessConnected = [...new Set(routeAccess.flatMap((row) => row.runtimeConnectedServiceSlugs))].sort();
ok(routeAccess.length === 2 && routeAccessConnected.join() === "240v-garage-outlet,240v-garage-outlet-14-30,240v-garage-outlet-14-50,240v-garage-outlet-6-50,bidet-smart-toilet-outlet,dedicated-120v-circuit-outlet,exterior-gfci-other-routing,freezer-fridge-dedicated-circuit,garage-door-opener-outlet,garage-door-opener-outlet-ev,new-120v-outlet,new-ceiling-fan,new-ceiling-light,new-coax-line,new-ethernet-line,new-exterior-flood-camera,new-wall-sconce,sump-pump-dedicated-circuit", "route access separates customer-tree access from guided review while recording only the connected bounded branches");
ok(rows.filter((row) => row.state === "SOURCE_AUTHORITY_MISMATCH").length === 0, "no known collection-authority mismatch remains hidden in the ledger");

console.log(`\nELECTRICAL LABOR SCOPE IMPLEMENTATION LEDGER — ${checks}/${checks} checks passed`);
