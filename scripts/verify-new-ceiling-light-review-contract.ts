import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReviewedAccessibleNewCeilingFan, isReviewedAccessibleNewCeilingLight, isReviewedAccessibleNewWallSconce } from "../lib/electrical/newCeilingLightReviewPackage";

const eligible = {
  fixture_height: "9_10",
  work_area_below: "level_floor",
  attic_access: "has_access",
  existing_light_source: "yes",
  lighting_control: "existing_switched_light",
  lighting_dimmer_upgrade: "standard",
};
assert.equal(isReviewedAccessibleNewCeilingLight(eligible), true);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, fixture_height: "over_12" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, fixture_height: "under_10" }), true);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, fixture_height: "13_14" }), true);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, fixture_height: "over_14_or_unsure" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, work_area_below: "staircase" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, attic_access: "no_access" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, existing_light_source: "no" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, lighting_control: "no_switch" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, lighting_dimmer_upgrade: "dimmer" }), false);
assert.equal(isReviewedAccessibleNewCeilingFan(eligible), true);
assert.equal(isReviewedAccessibleNewCeilingFan({ ...eligible, lighting_control: "no_switch" }), false);
assert.equal(isReviewedAccessibleNewWallSconce({ "new-wall-sconce_route_access": "accessible", "new-wall-sconce_distance": "standard" }), true);
assert.equal(isReviewedAccessibleNewWallSconce({ "new-wall-sconce_route_access": "finished", "new-wall-sconce_distance": "standard" }), false);
assert.equal(isReviewedAccessibleNewWallSconce({ "new-wall-sconce_route_access": "accessible", "new-wall-sconce_distance": "long" }), false);

const route = readFileSync("app/api/admin/quotes/[quoteId]/new-ceiling-light-scope/route.ts", "utf8");
const fanRoute = readFileSync("app/api/admin/quotes/[quoteId]/new-ceiling-fan-scope/route.ts", "utf8");
const sconceRoute = readFileSync("app/api/admin/quotes/[quoteId]/new-wall-sconce-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes("isReviewedAccessibleNewCeilingLight(answers)"));
assert.ok(route.includes("concealedNmSupportCount") && route.includes("nmCableSupportCount: supportCount"));
assert.ok(route.includes("existingLightingSourceConfirmed: true"));
assert.ok(route.includes('"BOX_CEILING_STANDARD"') && route.includes('"WIRE_14_2"') && route.includes('"NM_CABLE_SUPPORT"'));
assert.ok(route.includes("projectElectricalServiceLabor") && route.includes("assembleMaterialCostCents") && route.includes("suggestPrimaryPrice"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("isReviewedAccessibleNewCeilingLight(answerSnapshot)"));
assert.ok(form.includes("actual cable path—not a homeowner guess") && form.includes("Confirm scope and calculate"));
assert.ok(fanRoute.includes('const SLUG = "new-ceiling-fan"'));
assert.ok(fanRoute.includes('"BOX_FAN_RATED"') && !fanRoute.includes('"BOX_CEILING_STANDARD"'));
assert.ok(fanRoute.includes("isReviewedAccessibleNewCeilingFan(answers)"));
assert.ok(fanRoute.includes("existingLightingSourceConfirmed: true"));
assert.ok(fanRoute.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !fanRoute.includes("quotedPriceCents:"));
assert.ok(page.includes("isReviewedAccessibleNewCeilingFan(answerSnapshot)"));
assert.ok(form.includes("new fan-rated box") && form.includes("new-ceiling-fan-scope"));
assert.ok(sconceRoute.includes('const SLUG = "new-wall-sconce"'));
assert.ok(sconceRoute.includes('"BOX_OLD_WORK"') && !sconceRoute.includes('"BOX_FAN_RATED"'));
assert.ok(sconceRoute.includes("routeFeet > 20") && sconceRoute.includes("isReviewedAccessibleNewWallSconce(answers)"));
assert.ok(sconceRoute.includes("existingLightingSourceConfirmed: true"));
assert.ok(sconceRoute.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !sconceRoute.includes("quotedPriceCents:"));
assert.ok(page.includes("isReviewedAccessibleNewWallSconce(answerSnapshot)"));
assert.ok(form.includes("new-wall-sconce-scope") && form.includes("homeowner&apos;s rough range"));

console.log("new ceiling light/fan/sconce review contract: only bounded accessible existing-source packages derive editable unsent atomic suggestions");
