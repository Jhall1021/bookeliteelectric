import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReviewedAccessibleExteriorGfci } from "../lib/electrical/exteriorGfciReviewPackage";

assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "has_access", ext_gfci_distance: "under_10" }), true);
assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "has_access", ext_gfci_distance: "10_to_20" }), true);
assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "has_access", ext_gfci_distance: "over_20" }), false);
for (const feet of ["1", "10", "10.5", "20"]) {
  assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "has_access", ext_gfci_distance: feet }), true);
}
for (const feet of ["0", "20.1", "25", "__unknown__"]) {
  assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "has_access", ext_gfci_distance: feet }), false);
}
assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "no_access", ext_gfci_distance: "under_10" }), false);
assert.equal(isReviewedAccessibleExteriorGfci({ below_above_access: "unsure", ext_gfci_distance: "under_10" }), false);

const route = readFileSync("app/api/admin/quotes/[quoteId]/exterior-gfci-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const seed = readFileSync("prisma/seed-exterior-gfci-routing.ts", "utf8");
const guide = readFileSync("components/guided-flow/MeasurementGuide.tsx", "utf8");
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes('const SLUG = "exterior-gfci-other-routing"'));
for (const role of ["GFCI_WEATHER_RESISTANT", "COVER_IN_USE_BUBBLE", "BOX_FS_CAST", "CONSUMABLES_SMALL", "WIRE_12_2", "NM_CABLE_SUPPORT"]) assert.ok(route.includes(`"${role}"`));
assert.ok(route.includes("routeFeet > 20") && route.includes("isReviewedAccessibleExteriorGfci(answers)"));
assert.ok(route.includes("contractorConfirmedOrdinarySourceAndExteriorWall: true"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("isReviewedAccessibleExteriorGfci(answerSnapshot)"));
assert.ok(page.includes("answerSnapshot.ext_gfci_distance"));
assert.ok(form.includes("exterior-gfci-scope") && form.includes("homeowner&apos;s measured cable path") && form.includes("masonry complications"));
assert.ok(seed.includes('key: "ext_gfci_distance"') && seed.includes('inputType: "NUMBER"'));
assert.ok(seed.includes("nearest suitable interior outlet"));
assert.ok(seed.includes("numberAllowsDecimal: true") && seed.includes("numberAtLeastExclusive: true"));
assert.ok(seed.includes("addNumericUnknownOption(prisma, qDistance.id)"));
assert.ok(guide.includes('ext_gfci_distance: "outlet-to-outlet"'));
const doorway = readFileSync("lib/electrical/doorwayRouting.ts", "utf8");
const activation = readFileSync("scripts/activate-exterior-gfci-finished-routing-2026-10-06.ts", "utf8");
assert.ok(doorway.includes('"ext_gfci_distance"'), "the exterior GFCI measurement supports the shared doorway toggle");
assert.ok(activation.includes('conditionAnswerKey: DOORWAY_ANSWER_KEY'));
assert.ok(activation.includes('conditionAccessClass: "FINISHED"'));
assert.ok(activation.includes('value: { in: ["under_10", "10_to_20"] }'));
assert.ok(activation.includes('routeAction: "RESOLVE_ADJUSTED"'));
assert.ok(activation.includes("EXTERIOR_GFCI_ROUTE_LABOR_PACKAGES"));

console.log("exterior GFCI review contract: only reviewed accessible 1–20-foot scope derives an editable unsent atomic suggestion");
