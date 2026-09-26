import assert from "node:assert/strict";
import fs from "node:fs";
import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import { routeShapeFromAnswers } from "../lib/electrical/resolveWithDerivedPricing";
import { ROUTE_PRICING_REVIEW_SERVICE_SLUGS, routePricingReviewScenario } from "../lib/electrical/routePricingReviewScenario";

assert.deepEqual(ROUTE_PRICING_REVIEW_SERVICE_SLUGS, [
  "240v-garage-outlet", "240v-garage-outlet-14-30", "240v-garage-outlet-14-50", "240v-garage-outlet-6-50",
  "dedicated-120v-circuit-outlet", "electric-fireplace-circuit", "new-120v-outlet", "new-240v-appliance-circuit",
  "new-coax-line", "new-ethernet-line",
  "surface-mounted-fixture-box", "surface-mounted-outlet", "surface-mounted-switch",
]);
for (const slug of ROUTE_PRICING_REVIEW_SERVICE_SLUGS) {
  const scenario = routePricingReviewScenario(slug);
  assert.ok(scenario);
  const circuitPackage = circuitPackageFor(slug, scenario.answers);
  if (circuitPackage) {
    assert.equal(circuitPackage.routeFeet, slug.startsWith("240v-garage-outlet") ? 25 : 50);
  } else {
    const shape = routeShapeFromAnswers(scenario.answers);
    assert.ok(shape.routeFeet > 0);
    assert.equal(shape.turnCount, 0);
  }
}
assert.equal(routePricingReviewScenario("recessed-lighting"), null);

const approval = fs.readFileSync("lib/electrical/derivedPricingApproval.ts", "utf8");
const derivedResolver = fs.readFileSync("lib/electrical/resolveWithDerivedPricing.ts", "utf8");
const panel = fs.readFileSync("app/dashboard/route-pricing-review/[serviceId]/RoutePricingReviewPanel.tsx", "utf8");
const page = fs.readFileSync("app/dashboard/route-pricing-review/[serviceId]/page.tsx", "utf8");
assert.ok(approval.includes("routePricingReviewScenario(service.slug)"));
assert.ok(approval.includes("expectedFingerprint !== basisFingerprint"));
assert.ok(approval.includes("components.length === 0"));
assert.ok(derivedResolver.includes("if (isCircuitPackageService(svc.slug))"));
assert.ok(page.includes("withAdminContractor"));
assert.ok(panel.includes("Route price example"));
assert.ok(panel.includes("This example is informational"));
assert.ok(!panel.includes("Approve route pricing"));
assert.ok(!panel.includes("/api/admin/services/") && !panel.includes("active: true"));

console.log("route pricing examples: 13 reviewed scenarios, tenant guard, and informational detail view passed");
