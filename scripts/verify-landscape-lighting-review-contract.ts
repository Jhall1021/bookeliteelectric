import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reviewedLandscapeLightingPackage } from "../lib/electrical/landscapeLightingReviewPackage";

const eligible = {
  landscape_equipment: "customer_supplied_complete",
  landscape_source: "existing_outdoor_gfci",
  landscape_fixture_count: "six",
  landscape_route: "ordinary_softscape",
  landscape_distance: "50_to_100",
};
assert.deepEqual(reviewedLandscapeLightingPackage("outdoor-landscape-lighting", eligible), {
  fixtureCount: 6,
  cableRole: "LANDSCAPE_CABLE_12_2",
  connectorRole: "LANDSCAPE_WATERPROOF_CONNECTOR_PAIR",
});
for (const fixtureCount of ["four", "six", "eight"]) assert.ok(reviewedLandscapeLightingPackage("outdoor-landscape-lighting", { ...eligible, landscape_fixture_count: fixtureCount }));
assert.equal(reviewedLandscapeLightingPackage("outdoor-landscape-lighting", { ...eligible, landscape_equipment: "incomplete_or_unsure" }), null);
assert.equal(reviewedLandscapeLightingPackage("outdoor-landscape-lighting", { ...eligible, landscape_source: "missing_or_unsure" }), null);
assert.equal(reviewedLandscapeLightingPackage("outdoor-landscape-lighting", { ...eligible, landscape_fixture_count: "custom" }), null);
assert.equal(reviewedLandscapeLightingPackage("outdoor-landscape-lighting", { ...eligible, landscape_route: "nonstandard_or_unsure" }), null);
assert.equal(reviewedLandscapeLightingPackage("outdoor-landscape-lighting", { ...eligible, landscape_distance: "over_100_or_unsure" }), null);
assert.equal(reviewedLandscapeLightingPackage("some-other-service", eligible), null);

const seed = readFileSync("prisma/seed-landscape-lighting.ts", "utf8");
const route = readFileSync("app/api/admin/quotes/[quoteId]/landscape-lighting-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const recipe = readFileSync("lib/electrical/atomicLabor.ts", "utf8");
const hidden = readFileSync("scripts/hide-unbounded-services.ts", "utf8");

assert.ok(seed.includes("A rough range is enough") && seed.includes("measures the actual route"));
assert.ok(seed.includes('routeAction: "PHOTO_REVIEW"') && seed.includes("photosBlockBooking: true"));
assert.ok(seed.includes('const SHARED_ROLE_KEYS = ["CONSUMABLES_MEDIUM"]'));
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes("cableRouteFeet > 100") && route.includes("landscapeConfigurationConfirmed: true"));
assert.ok(route.includes('source: "CONTRACTOR_MEASUREMENT"') && !route.includes("ROUTE_ASSIST"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("reviewedLandscapeLightingPackage(q.service.slug, answerSnapshot)"));
assert.ok(form.includes("landscape-lighting-scope") && form.includes("homeowner&apos;s rough range"));
assert.ok(recipe.includes('facts: ["landscapeConfigurationConfirmed"]'));
assert.ok(!hidden.includes('slug: "outdoor-landscape-lighting"'), "the narrowed package is no longer in the legacy hide manifest");

console.log("landscape-lighting review contract: exact customer-selected counts plus contractor-confirmed equipment, source, softscape and measured route derive an editable unsent suggestion");
