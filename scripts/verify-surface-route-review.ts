import { confirmSurfaceRouteReview } from "../lib/electrical/surfaceRouteReview";
import type { RoutingV2SurfacePhysicalFactProjectionV1 } from "../lib/electrical/routeAssistRoutingV2Facts";

let passed = 0;
const ok = (condition: boolean, message: string) => { if (!condition) throw new Error(`FAIL: ${message}`); passed += 1; console.log(`  ok ${message}`); };
const refuses = (fn: () => unknown, fragment: string, message: string) => {
  try { fn(); } catch (error) { ok(error instanceof Error && error.message.includes(fragment), message); return; }
  throw new Error(`FAIL: ${message}`);
};

const projection: RoutingV2SurfacePhysicalFactProjectionV1 = {
  state: "COMPLETE", facts: { surfaceRouteFt: 18.5, insideCornerCount: 1, outsideCornerCount: 0, flatCornerCount: 2 },
  orderedSegmentLengthsFt: [8, 10.5], evidenceConfidenceFloor: 0.92, blockers: [], automaticBindingAuthorized: false,
};
const confirmedFacts = { surfaceRouteFeet: 19, insideCornerCount: 1, outsideCornerCount: 0, flatCornerCount: 2 };

console.log("\nSURFACE ROUTE CONTRACTOR REVIEW\n");
refuses(() => confirmSurfaceRouteReview("OUTLET", { source: "ROUTE_ASSIST_CONFIRMED", explicitlyConfirmed: false, projection, confirmedFacts }), "Contractor confirmation", "Route Assist cannot bind without explicit contractor confirmation");
const outlet = confirmSurfaceRouteReview("OUTLET", { source: "ROUTE_ASSIST_CONFIRMED", explicitlyConfirmed: true, projection, confirmedFacts });
ok(outlet.components.find((row) => row.key === "SURFACE_ROUTE_FT")?.quantity === 19, "contractor-confirmed footage overrides the proposed scan value");
ok(outlet.routeAssistCorrections.surfaceRouteFeet?.proposed === 18.5, "the Route Assist correction remains auditable");
ok(outlet.components.some((row) => row.key === "OUTLET_EXTENSION_CORE") && outlet.components.some((row) => row.key === "SURFACE_DEVICE_BOX_OUTLET"), "outlet endpoint uses the shared endpoint recipe");
ok(!outlet.components.some((row) => row.key === "SURFACE_ROUTE_OUTSIDE_CORNER"), "zero-count physical work is omitted rather than priced");
ok(outlet.automaticPriceApproval === false, "reviewed geometry cannot approve a customer price");
const fixture = confirmSurfaceRouteReview("FIXTURE_BOX", { source: "CONTRACTOR_MEASUREMENT", explicitlyConfirmed: true, confirmedFacts: { surfaceRouteFeet: 14.625, insideCornerCount: 0, outsideCornerCount: 1, flatCornerCount: 0 } });
ok(fixture.components.some((row) => row.key === "FIXTURE_BOX_ENDPOINT") && fixture.components.some((row) => row.key === "SURFACE_FIXTURE_BOX"), "manual measurement binds the fixture-box endpoint without Route Assist");
ok(fixture.components.find((row) => row.key === "SURFACE_ROUTE_FT")?.quantity === 14.625, "fractional contractor measurement is preserved exactly");
ok(Object.keys(fixture.routeAssistCorrections).length === 0, "manual measurement does not invent Route Assist evidence");
refuses(() => confirmSurfaceRouteReview("SWITCH", { source: "CONTRACTOR_MEASUREMENT", explicitlyConfirmed: true, confirmedFacts: { surfaceRouteFeet: 8, insideCornerCount: 1.5, outsideCornerCount: 0, flatCornerCount: 0 } }), "whole number", "fractional corner counts fail closed");
refuses(() => confirmSurfaceRouteReview("SWITCH", { source: "ROUTE_ASSIST_CONFIRMED", explicitlyConfirmed: true, projection: { ...projection, state: "INCOMPLETE", facts: null, blockers: ["missing segment"] }, confirmedFacts }), "incomplete", "incomplete Route Assist evidence cannot masquerade as confirmed scan geometry");
console.log(`\n${passed}/${passed} checks passed.\n`);
