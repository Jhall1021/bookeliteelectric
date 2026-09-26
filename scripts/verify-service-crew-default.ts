import fs from "node:fs";
import path from "node:path";
import { laborRateForService } from "../lib/pricing";

let failures = 0;
function ok(condition: boolean, message: string) {
  if (condition) console.log(`  ✓ ${message}`);
  else { console.error(`  ✗ ${message}`); failures += 1; }
}

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const schema = read("prisma/schema.prisma");
const panel = read("app/dashboard/setup/PricingFoundationPanel.tsx");
const setupPage = read("app/dashboard/setup/page.tsx");
const endpoint = read("app/api/admin/services/[serviceId]/offered/route.ts");
const provisioning = read("lib/templateProvisioning.ts");
const extraction = read("scripts/extract-template-catalog.ts");
const routeReview = read("lib/electrical/routePricingReview.ts");
const routeApproval = read("lib/electrical/derivedPricingApproval.ts");
const derivedBasis = read("lib/electrical/derivedPricingBasis.ts");
const circuitPricing = read("lib/electrical/circuitPackagePricing.ts");

console.log("SERVICE CREW DEFAULT + GUIDED PRICE TOGGLE");
ok((schema.match(/laborCrewType\s+LaborCrewType\s+@default\(ELECTRICIAN\)/g) ?? []).length === 2,
  "service and template schema defaults are one electrician");
ok(!schema.includes("laborCrewType LaborCrewType @default(ELECTRICIAN_AND_HELPER)"),
  "no service schema default silently adds a helper");
ok(provisioning.includes('?? "ELECTRICIAN"'),
  "template provisioning falls back to one electrician");
ok(extraction.includes('laborCrewType: "ELECTRICIAN" as const'),
  "catalog extraction creates a one-electrician baseline");
ok(setupPage.includes("active: svc.active") && setupPage.includes("laborCrewType: svc.laborCrewType"),
  "guided setup receives each service's live state and crew choice");
ok(panel.includes('role="switch"') && panel.includes("Helper needed for ${s.name}"),
  "Your prices renders an accessible per-service helper switch");
ok(panel.includes('body: JSON.stringify({ laborCrewType: next })') && panel.includes("router.refresh()"),
  "crew changes persist and refresh the calculated prices");
ok(panel.includes("Changing the crew recalculates the suggestion and requires price review"),
  "the contractor is warned that a crew change requires price review");
ok(endpoint.includes("basePrice: null") && endpoint.includes("whileWeThereBasePrice: null")
    && endpoint.includes("publishedPriceApprovedAt: null")
    && endpoint.includes("contractorDerivedPricingApproval.deleteMany"),
  "crew changes retract fixed and route-price approvals");
ok(routeReview.includes("laborRateForService(service, settings)")
    && routeReview.includes("laborCrewType: service.laborCrewType"),
  "route review prices and displays the service's selected crew rate");
ok(routeApproval.includes("laborCrewType: service.laborCrewType")
    && derivedBasis.includes("service-labor-crew|")
    && circuitPricing.includes('laborCrewType: service.laborCrewType ?? "ELECTRICIAN"'),
  "route approvals bind the selected crew into both derived pricing paths");

const settings = {
  crewHourRateCents: 25_000,
  electricianHourRateCents: 15_000,
  primaryMinimumCents: 0,
  roundingIncrementCents: 100,
  defaultPermitAdminCents: 0,
};
ok(laborRateForService({ laborCrewType: "ELECTRICIAN" }, settings) === 15_000,
  "one-electrician services use the electrician rate");
ok(laborRateForService({ laborCrewType: "ELECTRICIAN_AND_HELPER" }, settings) === 25_000,
  "helper-selected services use the electrician-and-helper rate");
ok(laborRateForService({ laborCrewType: null }, settings) === 15_000,
  "legacy missing crew values fail safely to one electrician");

if (failures) process.exitCode = 1;
else console.log("\nAll service crew checks passed.");
