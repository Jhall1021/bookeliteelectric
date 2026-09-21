import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReviewedGarageOpenerRequest } from "../lib/electrical/garageOpenerReviewPackage";

assert.equal(isReviewedGarageOpenerRequest({ garage_opener_scope_review: "continue" }), true);
assert.equal(isReviewedGarageOpenerRequest({ garage_opener_scope_review: "review" }), false);
assert.equal(isReviewedGarageOpenerRequest({}), false);

const route = readFileSync("app/api/admin/quotes/[quoteId]/garage-opener-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes('const SLUG = "garage-door-opener-outlet"'));
for (const role of ["RECEPTACLE_STANDARD", "BOX_OLD_WORK", "WALL_PLATE", "CONSUMABLES_SMALL", "WIRE_14_2", "NM_CABLE_SUPPORT"]) assert.ok(route.includes(`"${role}"`));
assert.ok(route.includes("routeFeet > 300") && route.includes("isReviewedGarageOpenerRequest(answers)"));
assert.ok(route.includes("existingGarageProtectionConfirmed: true"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("isReviewedGarageOpenerRequest(answerSnapshot)"));
assert.ok(form.includes("garage-opener-scope") && form.includes("homeowner&apos;s estimate") && form.includes("New or uncertain protection"));

console.log("garage opener review contract: only contractor-reviewed accessible scope with existing upstream protection derives an editable unsent atomic suggestion");
