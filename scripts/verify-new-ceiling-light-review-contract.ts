import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReviewedAccessibleNewCeilingLight } from "../lib/electrical/newCeilingLightReviewPackage";

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
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, work_area_below: "staircase" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, attic_access: "no_access" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, existing_light_source: "no" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, lighting_control: "no_switch" }), false);
assert.equal(isReviewedAccessibleNewCeilingLight({ ...eligible, lighting_dimmer_upgrade: "dimmer" }), false);

const route = readFileSync("app/api/admin/quotes/[quoteId]/new-ceiling-light-scope/route.ts", "utf8");
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

console.log("new-ceiling-light review contract: only the bounded accessible existing-source package derives an editable unsent atomic suggestion");
