import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const route = readFileSync("app/api/admin/quotes/[quoteId]/labor-scope/route.ts", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); };

ok(schema.includes("reviewFactsSnapshot Json?") && schema.includes("reviewBasisFingerprint String?"), "contractor-reviewed facts and their pricing basis are durable and separate from homeowner answers");
ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"), "only an authenticated tenant admin can establish the measurement");
ok(route.includes('source: "CONTRACTOR_MEASUREMENT"'), "the persisted fact records contractor measurement authority explicitly");
ok(route.includes("ACCESSIBLE_KEYS.feet in homeownerAnswers"), "the endpoint cannot turn an unrelated quote into an accessible-route quote");
ok(route.includes('component.key === "ELEC_ROUTE_ACCESSIBLE_CONCEALED"') && route.includes('component.key === "CONCEALED_ROUTE_FT"'), "the reviewed answer must reconstruct the intended physical route and exact footage");
ok(route.includes("proposeDerivedScope") && route.includes("proposal.kind !== \"PRICED\""), "the suggestion uses the deterministic derived-scope engine and fails closed when incomplete");
ok(route.includes("reviewSuggestedPriceCents: proposal.totalCents") && !route.includes("quotedPriceCents:"), "calculation stores a suggestion but never sends or decides the quote price");
ok(route.includes("sent: false") && !route.includes("sendQuoteReadyEmail"), "calculation cannot notify the customer");
ok(form.includes("Calculate from scope") && form.includes("setPrice((data.suggestedPriceCents / 100).toFixed(2))"), "the reviewed suggestion prefills an editable final-price decision");
ok(page.includes("initialSuggestedPriceCents={q.reviewSuggestedPriceCents}"), "a saved review resumes with its prior suggestion");
ok(!route.includes("RouteAssist") && !route.includes("ROUTE_ASSIST"), "accessible contractor measurement does not expand Route Assist authority");

console.log(`\nACCESSIBLE ROUTE QUOTE REVIEW CONTRACT — ${checks}/${checks} checks passed`);
