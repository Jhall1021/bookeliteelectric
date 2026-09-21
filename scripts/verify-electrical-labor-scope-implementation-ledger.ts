import { strict as assert } from "node:assert";
import { buildElectricalLaborScopeImplementationLedger } from "../lib/electrical/laborScopeImplementationLedger";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; console.log(`  ✓ ${message}`); };
const rows = buildElectricalLaborScopeImplementationLedger();

ok(rows.length === 29, "all 29 currently required authority-specific grouped collection tasks have an implementation row");
ok(new Set(rows.flatMap((row) => row.serviceSlugs)).size === 35, "implementation ledger covers all 35 services with unresolved scope facts");
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
ok(lighting.state === "PARTIAL_RUNTIME_CONNECTION" && lighting.runtimeConnectedServiceSlugs.join() === "recessed-lighting" && lighting.note.includes("Route Assist remains excluded from accessible attic authority"), "lighting geometry connects only through contractor measurement for the accessible recessed package");
const lightingCount = rows.find((row) => row.collectionGroupKey === "LIGHTING_LAYOUT")!;
ok(lightingCount.state === "PARTIAL_RUNTIME_CONNECTION" && lightingCount.runtimeConnectedServiceSlugs.join() === "new-exterior-lighting-locations,recessed-lighting" && lightingCount.note.includes("exactly one") && lightingCount.note.includes("additional exterior locations remain review-bound"), "lighting count connects the recessed layout and exactly one exterior location without opening broad multi-location scope");
const landscapeRows = rows.filter((row) => row.collectionGroupKey === "LANDSCAPE_LAYOUT");
ok(landscapeRows.length === 2 && landscapeRows.every((row) => row.runtimeConnectedServiceSlugs.join() === "outdoor-landscape-lighting"), "landscape fixture count and contractor-measured cable route connect only the reviewed landscape package");
const landscapeReview = rows.find((row) => row.collectionGroupKey === "LANDSCAPE_CONFIGURATION_REVIEW")!;
ok(landscapeReview.state === "PARTIAL_RUNTIME_CONNECTION" && landscapeReview.runtimeConnectedServiceSlugs.join() === "outdoor-landscape-lighting" && landscapeReview.note.includes("Hardscape"), "landscape equipment and softscape conditions require contractor review while nonstandard routes stay review-only");
const spaReview = rows.find((row) => row.collectionGroupKey === "SPA_CONFIGURATION_REVIEW")!;
ok(spaReview.state === "PARTIAL_RUNTIME_CONNECTION" && spaReview.runtimeConnectedServiceSlugs.join() === "hot-tub-spa-electrical" && spaReview.note.includes("NM-B in exterior conduit"), "spa configuration connects only the reviewed wet-location four-wire package and explicitly excludes NM-B");
const racewayMeasurement = rows.find((row) => row.collectionGroupKey === "RACEWAY_ROUTE_MEASUREMENT")!;
ok(racewayMeasurement.state === "PARTIAL_RUNTIME_CONNECTION" && racewayMeasurement.runtimeConnectedServiceSlugs.join() === "hot-tub-spa-electrical" && racewayMeasurement.servicesAwaitingRuntimeConnection.join() === "transfer-switch", "raceway measurement connects spa while transfer switch still awaits a bounded runtime package");
const specialtyTakeoffs = rows.filter((row) => row.collectionGroupKey === "SPECIALTY_EQUIPMENT_TAKEOFF");
ok(specialtyTakeoffs.length === 2 && specialtyTakeoffs.every((row) => row.state === "RUNTIME_CONNECTED") && specialtyTakeoffs.every((row) => row.runtimeConnectedServiceSlugs.join() === "hot-tub-spa-electrical") && specialtyTakeoffs.every((row) => row.servicesAwaitingRuntimeConnection.length === 0), "both specialty-equipment review and measurement authorities are fully connected through the reviewed spa package");
const surface = rows.find((row) => row.collectionGroupKey === "SURFACE_RACEWAY_GEOMETRY")!;
ok(surface.state === "RUNTIME_CONNECTED" && surface.note.includes("automaticBindingAuthorized=false"), "surface services are connected while Route Assist geometry preserves its explicit no-auto-binding boundary");
ok(surface.evidencePaths.includes("lib/electrical/surfaceRouteReview.ts"), "surface geometry cites the explicit contractor-confirmation boundary");
for (const key of ["SURFACE_RACEWAY_GEOMETRY", "SURFACE_RACEWAY_TAKEOFF"]) {
  const row = rows.find((candidate) => candidate.collectionGroupKey === key)!;
  ok(row.runtimeConnectedServiceSlugs.join() === "surface-mounted-fixture-box,surface-mounted-outlet,surface-mounted-switch", `${key} records all three surface services as runtime connected`);
}
const conductorTakeoff = rows.find((candidate) => candidate.collectionGroupKey === "RACEWAY_CONDUCTOR_TAKEOFF")!;
ok(conductorTakeoff.runtimeConnectedServiceSlugs.join() === "hot-tub-spa-electrical,surface-mounted-fixture-box,surface-mounted-outlet,surface-mounted-switch" && conductorTakeoff.servicesAwaitingRuntimeConnection.join() === "transfer-switch", "raceway conductor takeoff records the three surface services plus reviewed spa while transfer switch remains unconnected");
const connected = rows.find((row) => row.collectionGroupKey === "CONNECTED_DEVICE_SCOPE")!;
ok(connected.state === "PARTIAL_RUNTIME_CONNECTION", "connected-device commissioning policy is bound only where technical remediation is not required");
ok(connected.runtimeConnectedServiceSlugs.join() === "customer-supplied-smart-switch,floodlight-camera-existing,new-exterior-flood-camera,new-video-doorbell-wiring,smart-outlet-upgrade,smart-thermostat-install,video-doorbell-existing-wiring", "five clean connected-device packages and the two reviewed new-location packages connect while nonstandard remediation stays review-bound");
const doorbell = rows.find((row) => row.collectionGroupKey === "DOORBELL_REMEDIATION_REVIEW")!;
ok(doorbell.state === "RUNTIME_CONNECTED" && doorbell.runtimeConnectedServiceSlugs.join() === "new-video-doorbell-wiring", "doorbell transformer and penetration facts are connected only through the reviewed standard package");
const panelCapacity = rows.find((row) => row.collectionGroupKey === "PANEL_CAPACITY_REVIEW")!;
ok(panelCapacity.state === "PARTIAL_RUNTIME_CONNECTION" && panelCapacity.runtimeConnectedServiceSlugs.join() === "240v-garage-outlet,240v-garage-outlet-14-30,240v-garage-outlet-14-50,240v-garage-outlet-6-50,bidet-smart-toilet-outlet,dedicated-120v-circuit-outlet,electric-fireplace-circuit,freezer-fridge-dedicated-circuit,level-2-ev-charger,new-240v-appliance-circuit,sump-pump-dedicated-circuit", "panel capacity connects the reviewed 15A entries, plug-in fireplace, sump-specific 20A, dryer/range, hardwired EV charger, and open-garage 240V packages while other circuit scope remains review-bound");
const applianceCircuit = rows.find((row) => row.collectionGroupKey === "APPLIANCE_CIRCUIT_REVIEW")!;
ok(applianceCircuit.state === "PARTIAL_RUNTIME_CONNECTION" && applianceCircuit.runtimeConnectedServiceSlugs.join() === "new-240v-appliance-circuit" && applianceCircuit.note.includes("Legacy three-wire"), "appliance configuration connects only the exact contractor-reviewed modern four-wire dryer and range outcomes");
const evChargerConfiguration = rows.find((row) => row.collectionGroupKey === "EV_CHARGER_CONFIGURATION_REVIEW")!;
ok(evChargerConfiguration.state === "PARTIAL_RUNTIME_CONNECTION" && evChargerConfiguration.runtimeConnectedServiceSlugs.join() === "level-2-ev-charger" && evChargerConfiguration.note.includes("load-managed"), "EV charger configuration connects only the exact contractor-reviewed hardwired outcome");
const fireplaceEquipment = rows.find((row) => row.collectionGroupKey === "FIREPLACE_EQUIPMENT_REVIEW")!;
ok(fireplaceEquipment.state === "PARTIAL_RUNTIME_CONNECTION" && fireplaceEquipment.runtimeConnectedServiceSlugs.join() === "electric-fireplace-circuit" && fireplaceEquipment.note.includes("label or manufacturer instructions"), "fireplace amperage and connection scope require contractor equipment review");
const sumpProtection = rows.find((row) => row.collectionGroupKey === "SUMP_PUMP_PROTECTION_REVIEW")!;
ok(sumpProtection.state === "PARTIAL_RUNTIME_CONNECTION" && sumpProtection.runtimeConnectedServiceSlugs.join() === "sump-pump-dedicated-circuit" && sumpProtection.note.includes("remain review-bound"), "sump-pump protection connects only the exact reviewed accessible branch");
const garageProtection = rows.find((row) => row.collectionGroupKey === "GARAGE_PROTECTION_REVIEW")!;
ok(garageProtection.state === "PARTIAL_RUNTIME_CONNECTION" && garageProtection.runtimeConnectedServiceSlugs.join() === "garage-door-opener-outlet,garage-door-opener-outlet-ev" && garageProtection.note.includes("new or uncertain protection"), "garage protection connects only the reviewed confirmed-existing-protection package while remediation remains review-bound");
const lightingSource = rows.find((row) => row.collectionGroupKey === "LIGHTING_SOURCE_REVIEW")!;
ok(lightingSource.state === "PARTIAL_RUNTIME_CONNECTION" && lightingSource.runtimeConnectedServiceSlugs.join() === "new-ceiling-fan,new-ceiling-light,new-exterior-lighting-locations,new-wall-sconce,recessed-lighting", "existing lighting-source suitability connects only through contractor review of the bounded lighting packages");
const routeAccess = rows.filter((row) => row.collectionGroupKey === "ROUTE_ACCESS");
const routeAccessConnected = [...new Set(routeAccess.flatMap((row) => row.runtimeConnectedServiceSlugs))].sort();
ok(routeAccess.length === 2 && routeAccessConnected.join() === "240v-garage-outlet,240v-garage-outlet-14-30,240v-garage-outlet-14-50,240v-garage-outlet-6-50,bidet-smart-toilet-outlet,dedicated-120v-circuit-outlet,electric-fireplace-circuit,exterior-gfci-other-routing,freezer-fridge-dedicated-circuit,garage-door-opener-outlet,garage-door-opener-outlet-ev,level-2-ev-charger,new-120v-outlet,new-240v-appliance-circuit,new-ceiling-fan,new-ceiling-light,new-coax-line,new-ethernet-line,new-exterior-flood-camera,new-exterior-lighting-locations,new-wall-sconce,recessed-lighting,sump-pump-dedicated-circuit", "route access separates customer-tree access from guided review while recording only the connected bounded branches");
ok(rows.filter((row) => row.state === "SOURCE_AUTHORITY_MISMATCH").length === 0, "no known collection-authority mismatch remains hidden in the ledger");

console.log(`\nELECTRICAL LABOR SCOPE IMPLEMENTATION LEDGER — ${checks}/${checks} checks passed`);
