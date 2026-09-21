import { strict as assert } from "node:assert";
import { buildElectricalLaborScopeImplementationLedger } from "../lib/electrical/laborScopeImplementationLedger";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; console.log(`  ✓ ${message}`); };
const rows = buildElectricalLaborScopeImplementationLedger();

ok(rows.length === 23, "all 23 grouped collection tasks have an implementation row");
ok(new Set(rows.flatMap((row) => row.serviceSlugs)).size === 43, "implementation ledger covers all 43 services with unresolved scope facts");
ok(rows.every((row) => row.state !== "PARTIAL_RUNTIME_CONNECTION" || row.evidencePaths.length > 0), "every partial-runtime claim cites concrete code evidence");
ok(rows.every((row) => row.state !== "CAPTURE_IMPLEMENTED_UNBOUND" || row.evidencePaths.length > 0), "every capture-only claim cites concrete code evidence");
ok(rows.every((row) => row.state !== "ENGINE_READY_UNCONNECTED" || row.evidencePaths.length > 0), "every engine-ready claim cites concrete code evidence");
ok(rows.every((row) => row.servicesAwaitingRuntimeConnection.length > 0), "no collection task is falsely reported fully connected");

const accessible = rows.find((row) => row.collectionGroupKey === "ACCESSIBLE_ROUTE_MEASUREMENT")!;
ok(accessible.state === "PARTIAL_RUNTIME_CONNECTION", "hidden accessible-route footage now has a bounded contractor-review runtime path");
ok(accessible.note.includes("homeowner") && accessible.note.includes("reserved for inaccessible") && accessible.note.includes("contractor measurement"), "the runtime path preserves Route Assist for inaccessible routes and names the contractor authority for accessible paths");
const lighting = rows.find((row) => row.collectionGroupKey === "LIGHTING_LAYOUT_MEASUREMENT")!;
ok(lighting.state === "CAPTURE_IMPLEMENTED_UNBOUND", "lighting Route Assist projection is not mistaken for runtime binding");
const surface = rows.find((row) => row.collectionGroupKey === "SURFACE_RACEWAY_GEOMETRY")!;
ok(surface.state === "CAPTURE_IMPLEMENTED_UNBOUND" && surface.note.includes("automaticBindingAuthorized=false"), "surface geometry preserves its explicit no-auto-binding boundary");
ok(surface.evidencePaths.includes("lib/electrical/surfaceRouteReview.ts"), "surface geometry cites the explicit contractor-confirmation boundary");
const connected = rows.find((row) => row.collectionGroupKey === "CONNECTED_DEVICE_SCOPE")!;
ok(connected.state === "PARTIAL_RUNTIME_CONNECTION", "connected-device commissioning policy is bound only where technical remediation is not required");
ok(connected.runtimeConnectedServiceSlugs.join() === "customer-supplied-smart-switch,smart-outlet-upgrade", "smart switch and smart outlet connect while thermostat remains review-bound");
const routeAccess = rows.find((row) => row.collectionGroupKey === "ROUTE_ACCESS")!;
ok(routeAccess.runtimeConnectedServiceSlugs.join() === "new-120v-outlet", "runtime scope remains limited to the one connected new-outlet service");
ok(rows.filter((row) => row.state === "SOURCE_AUTHORITY_MISMATCH").length === 0, "no known collection-authority mismatch remains hidden in the ledger");

console.log(`\nELECTRICAL LABOR SCOPE IMPLEMENTATION LEDGER — ${checks}/${checks} checks passed`);
