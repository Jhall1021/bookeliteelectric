import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { serviceWorkspaceTab } from "../lib/serviceWorkspaceTab";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const setupPage = read("app/dashboard/setup/page.tsx");
const pricingFoundation = read("app/dashboard/setup/PricingFoundationPanel.tsx");
const servicePage = read("app/dashboard/services/[serviceId]/page.tsx");
const serviceSelection = read("components/admin/ServiceSelectionList.tsx");

ok(setupPage.includes("serviceId: svc.id"), "setup pricing rows retain the tenant-scoped service id");
ok(
  pricingFoundation.includes("/dashboard/services/${s.serviceId}?tab=pricing"),
  "an unapproved price links directly to that service's pricing workspace",
);
ok(
  pricingFoundation.includes('!s.routePriced && s.derivedCents !== null && !s.approved') &&
    pricingFoundation.includes("Labor setup needed") &&
    pricingFoundation.includes('href="#labor-calibration"'),
  "services without a calculable price point to labor setup rather than premature price approval",
);
ok(setupPage.includes('id="labor-calibration"'), "the labor continuation link has a stable in-page target");
ok(
  pricingFoundation.indexOf("{setupWork}") < pricingFoundation.indexOf("Your prices"),
  "material and labor setup render before customer-price review",
);
ok(
  pricingFoundation.includes("ready for price review") &&
    pricingFoundation.includes("waiting for labor setup") &&
    pricingFoundation.includes("prices approved"),
  "pricing foundation distinguishes the three actionable price states",
);
ok(
  setupPage.includes('svc.pricingMethod === "DERIVED_RESOLVED_SCOPE"') &&
    setupPage.includes("derivedApprovalServiceIds.has(svc.id)"),
  "setup reads route-priced approval from the derived-basis authority",
);
ok(
  pricingFoundation.includes("Route pricing review needed") &&
    pricingFoundation.includes("s.routeReviewAvailable") &&
    pricingFoundation.includes("/dashboard/route-pricing-review/${s.serviceId}") &&
    pricingFoundation.includes("!s.routePriced && s.derivedCents === null"),
  "supported route services enter their tenant-scoped reusable review page",
);
ok(
  setupPage.includes("contractorId: ctx.contractorId, offered: true") &&
    !setupPage.includes("contractorId: ctx.contractorId, offered: true, active: true"),
  "selected hidden services enter labor setup before activation",
);
ok(
  pricingFoundation.includes("route services awaiting dedicated review") &&
    pricingFoundation.includes("cannot be batch-approved"),
  "other route services remain visible and fail closed instead of linking to the wrong review flow",
);
ok(servicePage.includes("initialTab={serviceWorkspaceTab(searchParams?.tab)}"), "service editor applies the validated tab request");
ok(serviceWorkspaceTab("pricing") === "pricing", "pricing is an accepted deep-link tab");
ok(serviceWorkspaceTab("materials") === "materials", "other real workspace tabs remain accepted");
ok(serviceWorkspaceTab("publish") === "overview", "unknown tab values fail closed to overview");
ok(serviceWorkspaceTab(undefined) === "overview", "ordinary service links retain the overview default");
ok(
  pricingFoundation.includes("GUIDED SETUP NEVER APPROVES A PRICE") &&
    pricingFoundation.includes('fetch("/api/portal/price-review"') &&
    pricingFoundation.includes("Nothing is preselected") &&
    !pricingFoundation.includes("publishedPriceApprovedAt"),
  "the setup price list requires an explicit selection and delegates publication to its guarded endpoint",
);
ok(
  !serviceSelection.includes('"Needs a price"') &&
    serviceSelection.includes('"Price approved"') &&
    serviceSelection.includes('"Pricing setup next"') &&
    serviceSelection.includes('"Price after selection"'),
  "service selection describes the next step instead of declaring every fixed-price service deficient",
);
ok(
  setupPage.includes('s.pricingMethod === "DERIVED_RESOLVED_SCOPE"') &&
    setupPage.includes("publishedPriceApprovedAt !== null"),
  "service-selection status uses the correct route-derived or legacy approval authority",
);

console.log(`SETUP PRICING REVIEW HANDOFF — ${checks}/${checks} checks passed`);
