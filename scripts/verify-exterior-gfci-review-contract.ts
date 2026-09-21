import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReviewedAccessibleExteriorGfci } from "../lib/electrical/exteriorGfciReviewPackage";

assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "has_access", ext_gfci_distance: "under_10" }), true);
assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "has_access", ext_gfci_distance: "10_to_20" }), true);
assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "has_access", ext_gfci_distance: "over_20" }), false);
assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "no_access", ext_gfci_distance: "under_10" }), false);
assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "unsure", ext_gfci_distance: "under_10" }), false);

const route = readFileSync("app/api/admin/quotes/[quoteId]/exterior-gfci-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes('const SLUG = "exterior-gfci-other-routing"'));
for (const role of ["GFCI_WEATHER_RESISTANT", "COVER_IN_USE_BUBBLE", "BOX_FS_CAST", "CONSUMABLES_SMALL", "WIRE_12_2", "NM_CABLE_SUPPORT"]) assert.ok(route.includes(`"${role}"`));
assert.ok(route.includes("routeFeet > 20") && route.includes("isReviewedAccessibleExteriorGfci(answers)"));
assert.ok(route.includes("contractorConfirmedOrdinarySourceAndExteriorWall: true"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("isReviewedAccessibleExteriorGfci(answerSnapshot)"));
assert.ok(form.includes("exterior-gfci-scope") && form.includes("homeowner&apos;s rough range") && form.includes("masonry complications"));

console.log("exterior GFCI review contract: only reviewed accessible 1–20-foot scope derives an editable unsent atomic suggestion");
