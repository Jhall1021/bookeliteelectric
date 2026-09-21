import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveReviewedAccessibleRecessedLightingPackage } from "../lib/electrical/recessedLightingReviewPackage";

const eligible = {
  fixture_height: "9_10",
  work_area_below: "level_floor",
  ceiling_access: "accessible",
  recessed_light_count: "4",
  lighting_control: "existing_switched_light",
  lighting_dimmer_upgrade: "standard",
};

assert.deepEqual(resolveReviewedAccessibleRecessedLightingPackage(eligible), { lightCount: 4, access: "ACCESSIBLE" });
for (const recessed_light_count of ["0", "1.5", "9", "unknown"]) {
  assert.equal(resolveReviewedAccessibleRecessedLightingPackage({ ...eligible, recessed_light_count }), null);
}
assert.equal(resolveReviewedAccessibleRecessedLightingPackage({ ...eligible, ceiling_access: "finished" }), null);
assert.equal(resolveReviewedAccessibleRecessedLightingPackage({ ...eligible, lighting_control: "new_switch" }), null);
assert.equal(resolveReviewedAccessibleRecessedLightingPackage({ ...eligible, lighting_dimmer_upgrade: "dimmer" }), null);
assert.equal(resolveReviewedAccessibleRecessedLightingPackage({ ...eligible, fixture_height: "over_12" }), null);

const route = readFileSync("app/api/admin/quotes/[quoteId]/recessed-lighting-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const seed = readFileSync("prisma/seed-recessed-lighting.ts", "utf8");
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes("evaluateRecessedLightingTakeoff") && route.includes("resolveReviewedAccessibleRecessedLightingPackage"));
assert.ok(route.includes("CONTRACTOR_MEASUREMENT") && route.includes("GUIDED_PHOTO_REVIEW") && route.includes("SYSTEM_DERIVED"));
assert.ok(route.includes("2 * reviewPackage.lightCount * slackPerTermination"));
assert.ok(route.includes("concealedNmSupportCount(installedCablePathFeet"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("resolveReviewedAccessibleRecessedLightingPackage(answerSnapshot)"));
assert.ok(form.includes("Do not substitute the old ten-feet-per-light allowance"));
assert.ok(form.includes("Confirm layout and calculate"));
assert.ok(seed.includes('routeAction: "PHOTO_REVIEW"') && seed.includes("contractor can") && seed.includes("attic cable path") && seed.includes("photosBlockBooking: true"));

console.log("recessed-lighting review contract: only a contractor-confirmed accessible layout produces an editable unsent atomic suggestion");
