import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { isReviewedAccessibleNewExteriorLight } from "../lib/electrical/newExteriorLightReviewPackage";

const eligible = {
  exterior_light_existing: "new_location",
  exterior_light_fixture_supply: "customer_supplied",
  exterior_light_height: "9_12",
  exterior_light_wall: "ordinary_siding",
  exterior_light_access: "accessible",
  exterior_light_distance: "25_50",
  exterior_light_control: "existing_switched_source",
};
assert.equal(isReviewedAccessibleNewExteriorLight(eligible), true);
for (const [key, value] of Object.entries({
  exterior_light_existing: "existing_fixture",
  exterior_light_fixture_supply: "contractor_or_unsure",
  exterior_light_height: "high_or_unsure",
  exterior_light_wall: "specialty_or_unsure",
  exterior_light_access: "not_accessible_or_unsure",
  exterior_light_distance: "over_50_or_unsure",
  exterior_light_control: "new_control_or_unsure",
})) assert.equal(isReviewedAccessibleNewExteriorLight({ ...eligible, [key]: value }), false);

const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === "ELECTRICAL_NEW_EXTERIOR_LIGHT_LOCATIONS")!;
const operations = new Set(recipe.lines.map((line) => line.operationKey));
for (const key of ["ELEC_NM_CABLE_ACCESSIBLE", "ELEC_SUPPORT_NM_CABLE", "ELEC_CONNECT_EXISTING_BRANCH_SOURCE", "ELEC_PENETRATE_EXTERIOR_WALL", "ELEC_INSTALL_EXTERIOR_FIXTURE_BOX", "ELEC_INSTALL_NEW_EXTERIOR_LIGHT_POINT", "ELEC_TEST_BRANCH_EXTENSION", "ELEC_BRANCH_WORK_CLEANUP"]) assert.ok(operations.has(key));

const seed = readFileSync("prisma/seed-new-exterior-light-location.ts", "utf8");
const route = readFileSync("app/api/admin/quotes/[quoteId]/new-exterior-light-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const hide = readFileSync("scripts/hide-unbounded-services.ts", "utf8");
assert.ok(seed.includes("Add One Exterior Light Location") && seed.includes("A rough height is enough"));
assert.ok(seed.includes("Choose the closest range") && seed.includes("electrician will confirm the actual cable path"));
assert.ok(seed.includes('routeAction: "PHOTO_REVIEW"') && seed.includes("photosBlockBooking: true"));
assert.ok(seed.includes("BOX_EXTERIOR_FIXTURE") && seed.includes("quantity: 1"));
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes("routeFeet > 75") && route.includes("CONTRACTOR_MEASUREMENT") && !route.includes("ROUTE_ASSIST"));
assert.ok(route.includes("existingLightingSourceConfirmed: true") && route.includes("ordinaryExteriorWallConfirmed: true"));
for (const role of ["BOX_EXTERIOR_FIXTURE", "CONSUMABLES_SMALL", "WIRE_14_2", "NM_CABLE_SUPPORT"]) assert.ok(route.includes(`"${role}"`));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("isReviewedAccessibleNewExteriorLight(answerSnapshot)"));
assert.ok(form.includes("homeowner&apos;s rough distance is context only") && form.includes("new-exterior-light-scope"));
assert.ok(!hide.includes('slug: "new-exterior-lighting-locations"'));

console.log("new exterior-light review contract: one ordinary accessible location can produce an editable unsent atomic suggestion; broader work stays review-only");
