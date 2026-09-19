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

ok(setupPage.includes("serviceId: svc.id"), "setup pricing rows retain the tenant-scoped service id");
ok(
  pricingFoundation.includes("/dashboard/services/${s.serviceId}?tab=pricing"),
  "an unapproved price links directly to that service's pricing workspace",
);
ok(servicePage.includes("initialTab={serviceWorkspaceTab(searchParams?.tab)}"), "service editor applies the validated tab request");
ok(serviceWorkspaceTab("pricing") === "pricing", "pricing is an accepted deep-link tab");
ok(serviceWorkspaceTab("materials") === "materials", "other real workspace tabs remain accepted");
ok(serviceWorkspaceTab("publish") === "overview", "unknown tab values fail closed to overview");
ok(serviceWorkspaceTab(undefined) === "overview", "ordinary service links retain the overview default");
ok(
  pricingFoundation.includes("GUIDED SETUP NEVER APPROVES A PRICE") &&
    !pricingFoundation.includes("fetch(") &&
    !pricingFoundation.includes("publishedPriceApprovedAt"),
  "the setup price list navigates only and retains no publication write path",
);

console.log(`SETUP PRICING REVIEW HANDOFF — ${checks}/${checks} checks passed`);
