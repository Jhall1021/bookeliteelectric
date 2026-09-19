import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { flatRateApprovalState } from "../lib/onboardingReadiness";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

ok(
  flatRateApprovalState({
    pricingMethod: "DERIVED_RESOLVED_SCOPE",
    publishedPriceApprovedAt: null,
    hasDerivedPricingApproval: true,
  }) === "APPROVED",
  "derived route pricing is satisfied by its economic-basis approval without a base price",
);
ok(
  flatRateApprovalState({
    pricingMethod: "DERIVED_RESOLVED_SCOPE",
    publishedPriceApprovedAt: new Date(),
    hasDerivedPricingApproval: false,
  }) === "DERIVED_PRICING_NOT_APPROVED",
  "a legacy base-price timestamp cannot substitute for derived-basis approval",
);
ok(
  flatRateApprovalState({
    pricingMethod: "LEGACY_PUBLISHED",
    publishedPriceApprovedAt: null,
    hasDerivedPricingApproval: true,
  }) === "LEGACY_PRICE_NOT_APPROVED",
  "a derived approval cannot substitute for a legacy service's published price",
);
ok(
  flatRateApprovalState({
    pricingMethod: "LEGACY_PUBLISHED",
    publishedPriceApprovedAt: new Date(),
    hasDerivedPricingApproval: false,
  }) === "APPROVED",
  "legacy fixed pricing retains its existing publication contract",
);

const readiness = fs.readFileSync(path.join(process.cwd(), "lib/onboardingReadiness.ts"), "utf8");
ok(
  readiness.includes('if (svc.pricingMethod === "DERIVED_RESOLVED_SCOPE") return out;'),
  "derived services never fall through to the single-duration/base-price suggestion check",
);
ok(
  readiness.includes('href: "/dashboard/first-service"'),
  "an unapproved derived basis points to the existing supported approval workflow",
);

console.log(`DERIVED ONBOARDING PRICE CONTRACT — ${checks}/${checks} checks passed`);
