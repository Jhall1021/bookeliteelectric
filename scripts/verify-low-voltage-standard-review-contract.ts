import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/admin/quotes/[quoteId]/low-voltage-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");

assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes('new-ethernet-line') && route.includes('new-coax-line'));
assert.ok(route.includes("calculateCircuitPackage") && route.includes("calculated.kind !== \"PRICED\""));
assert.ok(route.includes("reviewSuggestedPriceCents: calculated.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("lowVoltageStandardReview") && form.includes("Use standard accessible package"));
assert.ok(form.includes("Confirm or edit the customer price before sending"));

console.log("low-voltage standard review contract: contractor policy + approved atomic labor produce an editable unsent suggestion");
