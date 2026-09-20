import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publishSuggestedPrice } from "../lib/pricePublication";

const panel = readFileSync("app/dashboard/setup/PricingFoundationPanel.tsx", "utf8");
const route = readFileSync("app/api/portal/price-review/route.ts", "utf8");
const authority = readFileSync("lib/pricePublication.ts", "utf8");
let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); };

ok(panel.includes("Nothing is preselected"), "batch review tells the contractor selection is explicit");
ok(panel.includes('type="checkbox"') && panel.includes("selectedPriceIds.has(s.serviceId)"), "each reviewable service has its own unchecked selection state");
ok(!panel.includes("Select all prices"), "price publication has no select-all shortcut");
ok(panel.includes("expectedCents: service.derivedCents"), "the UI sends the exact figure the contractor reviewed");
ok(route.includes("expectedBasePrice: item.expectedCents"), "the server binds approval to that displayed figure");
ok(authority.includes("STALE_SUGGESTED_PRICE") && authority.indexOf("STALE_SUGGESTED_PRICE") < authority.indexOf("await db.service.update"), "stale-price refusal happens before publication");
ok(route.includes("TransactionIsolationLevel.Serializable"), "a selected batch is one serializable transaction");
ok(route.includes('pricingMethod === "DERIVED_RESOLVED_SCOPE"'), "route-priced services cannot enter the flat-price batch");
ok(route.includes("publishedPriceApprovedAt !== null") && route.includes("ALREADY_APPROVED"), "batch review cannot overwrite an existing approved price");
ok(route.includes("contractorId: ctx.contractorId"), "selected services are tenant-scoped at the write boundary");
ok(route.includes("publishSuggestedPrice") && !/data\s*:\s*\{[\s\S]*?\b(?:basePrice|publishedPriceApprovedAt)\s*:/.test(route), "the endpoint delegates to the single publication authority");

async function verifyAuthority() {
  let writes = 0;
  const fakeDb = {
  service: {
    findUnique: async () => ({
      id: "svc", unresolvedPolicyKeys: [], fieldLaborHours: 1, wwtLaborHours: null,
      requiresTechCount: 1, materialCostCents: 0, materialMultiplier: null,
      permitAdminCents: 0, otherDirectCostCents: 0, isPrimaryEligible: true,
    }),
    update: async () => { writes++; return {}; },
  },
  pricingSettings: {
    findUnique: async () => ({ crewHourRateCents: 25_000, primaryMinimumCents: 25_000, roundingIncrementCents: 500, defaultPermitAdminCents: 0 }),
  },
  } as never;
  const stale = await publishSuggestedPrice(fakeDb, "contractor", "svc", { expectedBasePrice: 99_999 });
  ok(!stale.ok && stale.refusal.code === "STALE_SUGGESTED_PRICE" && writes === 0, "a stale displayed figure performs zero writes");
  const current = await publishSuggestedPrice(fakeDb, "contractor", "svc", { expectedBasePrice: 25_000 });
  ok(current.ok && current.basePrice === 25_000 && writes === 1, "the exact current suggestion can publish through the authority");
}

verifyAuthority().then(() => {
  console.log(`\nSETUP PRICE REVIEW CONTRACT — ${checks}/${checks} checks passed`);
}).catch((error) => { console.error(error); process.exit(1); });
