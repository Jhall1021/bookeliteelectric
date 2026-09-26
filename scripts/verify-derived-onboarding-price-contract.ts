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
const setupPage = fs.readFileSync(path.join(process.cwd(), "app/dashboard/setup/page.tsx"), "utf8");
ok(
  readiness.includes('if (svc.pricingMethod === "DERIVED_RESOLVED_SCOPE") return out;'),
  "derived services never fall through to the single-duration/base-price suggestion check",
);
ok(
  readiness.includes('href: `/dashboard/setup?stage=pricing-foundation#price-${svc.id as string}`'),
  "an unapproved derived basis points to that service in the unified price review",
);
ok(
  setupPage.includes("const approvalState = flatRateApprovalState({")
    && setupPage.includes("hasDerivedPricingApproval: derivedApprovalServiceIds.has(svc.id)"),
  "the launch picker recognizes the same derived economic-basis approval as readiness",
);
ok(
  !setupPage.includes("const needsPrice = promisesFixedPrice && svc.publishedPriceApprovedAt === null;"),
  "the launch picker never mistakes a route-priced service's intentional null base-price approval for unfinished work",
);

console.log(`DERIVED ONBOARDING PRICE CONTRACT — ${checks}/${checks} checks passed`);
