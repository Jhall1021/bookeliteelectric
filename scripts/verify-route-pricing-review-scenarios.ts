import assert from "node:assert/strict";
import fs from "node:fs";
import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import { routeShapeFromAnswers } from "../lib/electrical/resolveWithDerivedPricing";
import { ROUTE_PRICING_REVIEW_SERVICE_SLUGS, routePricingReviewScenario } from "../lib/electrical/routePricingReviewScenario";

assert.deepEqual(ROUTE_PRICING_REVIEW_SERVICE_SLUGS, [
  "dedicated-120v-circuit-outlet", "electric-fireplace-circuit", "new-120v-outlet", "new-240v-appliance-circuit",
  "surface-mounted-fixture-box", "surface-mounted-outlet", "surface-mounted-switch",
]);
for (const slug of ROUTE_PRICING_REVIEW_SERVICE_SLUGS) {
  const scenario = routePricingReviewScenario(slug);
  assert.ok(scenario);
  const circuitPackage = circuitPackageFor(slug, scenario.answers);
  if (circuitPackage) {
    assert.equal(circuitPackage.routeFeet, 50);
  } else {
    const shape = routeShapeFromAnswers(scenario.answers);
    assert.ok(shape.routeFeet > 0);
    assert.equal(shape.turnCount, 0);
  }
}
assert.equal(routePricingReviewScenario("recessed-lighting"), null);

const approval = fs.readFileSync("lib/electrical/derivedPricingApproval.ts", "utf8");
const panel = fs.readFileSync("app/dashboard/route-pricing-review/[serviceId]/RoutePricingReviewPanel.tsx", "utf8");
const page = fs.readFileSync("app/dashboard/route-pricing-review/[serviceId]/page.tsx", "utf8");
assert.ok(approval.includes("routePricingReviewScenario(service.slug)"));
assert.ok(approval.includes("expectedFingerprint !== basisFingerprint"));
assert.ok(approval.includes("components.length === 0"));
assert.ok(page.includes("withAdminContractor"));
assert.ok(panel.includes("useState(false)"));
assert.ok(panel.includes("expectedFingerprint: data.approvalToken"));
assert.ok(!panel.includes("/api/admin/services/") && !panel.includes("active: true"));

console.log("route pricing review: 7 reviewed scenarios, tenant guard, explicit selection and stale-price binding passed");
