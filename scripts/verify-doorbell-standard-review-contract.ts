import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/admin/quotes/[quoteId]/doorbell-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const seed = readFileSync("prisma/seed-video-doorbell-wiring.ts", "utf8");

assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
for (const [key, value] of [["doorbell_existing", "none"], ["doorbell_access", "accessible"], ["doorbell_surface", "standard"], ["doorbell_supply", "customer"], ["doorbell_chime", "no_chime"]]) {
  assert.ok(route.includes(`${key}: "${value}"`));
}
assert.ok(route.includes('"WIRE_BELL_18_2"') && route.includes('"DOORBELL_TRANSFORMER"'));
assert.ok(route.includes("loadConnectedDeviceLaborFacts") && route.includes("platePenetrationRequired: true") && route.includes("newTransformerRequired: true"));
assert.ok(route.includes("projectElectricalServiceLabor") && route.includes("suggestPrimaryPrice"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes('routeFeet: { value: routeFeet, source: "CONTRACTOR_POLICY" }'));
assert.ok(route.includes('platePenetrationRequired: { value: true, source: "GUIDED_PHOTO_REVIEW" }'));
assert.ok(route.includes('newTransformerRequired: { value: true, source: "SYSTEM_DERIVED" }'));
assert.ok(route.includes("sent: false"));
assert.ok(seed.includes("one ordinary \" +\n  \"top- or bottom-plate penetration"));
assert.ok(page.includes("doorbellStandardReview") && form.includes("Use standard doorbell package"));

console.log("doorbell standard review contract: approved package facts produce an editable unsent atomic suggestion");
