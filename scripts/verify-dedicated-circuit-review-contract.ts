import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { concealedNmSupportCount } from "../lib/electrical/concealedRouteMaterialConfiguration";

const route = readFileSync("app/api/admin/quotes/[quoteId]/dedicated-circuit-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");

assert.equal(concealedNmSupportCount(35, 4.5, true), 9);
assert.equal(concealedNmSupportCount(35, 4.5, false), 7);
assert.equal(concealedNmSupportCount(0, 4.5, true), 0);

assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes('new Set(["fridge_freezer", "bidet"])'));
assert.ok(route.includes('answers.dedicated_amperage === "15a_120v"'));
assert.ok(route.includes("routeFeet > 50"));
assert.ok(route.includes("CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination"));
assert.ok(route.includes("CONCEALED_ROUTE_POLICY_KEYS.supportSpacing"));
assert.ok(route.includes("CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination"));
assert.ok(route.includes("concealedNmSupportCount"));
assert.ok(route.includes('"WIRE_14_2"') && !route.includes('"WIRE_12_2"'));
assert.ok(route.includes("assembleMaterialCostCents") && route.includes("projectElectricalServiceLabor") && route.includes("suggestPrimaryPrice"));
assert.ok(route.includes("panelCapacityConfirmed: true"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("dedicatedCircuitStandardReview"));
assert.ok(form.includes("Confirm panel and calculate") && form.includes("rough distance answer is context, not pricing authority"));

console.log("dedicated-circuit review contract: confirmed 15A accessible scope derives exact materials and an editable unsent atomic suggestion");
