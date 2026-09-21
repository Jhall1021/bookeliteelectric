import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REVIEWED_EV_CHARGER_CONFIGURATION, reviewedEvChargerConfiguration } from "../lib/electrical/evChargerReviewPackage";

assert.deepEqual(REVIEWED_EV_CHARGER_CONFIGURATION, {
  outputAmps: 40,
  circuitAmps: 50,
  breakerRole: "BREAKER_DOUBLE_POLE_50A",
  wireRole: "WIRE_6_2",
});
const answers = {
  ev_charger_equipment: "customer_supplied_hardwired",
  ev_charger_location: "attached_garage_interior",
  ev_charger_route_access: "unfinished_basement",
  ev_charger_distance: "25_to_50",
};
assert.deepEqual(reviewedEvChargerConfiguration("level-2-ev-charger", answers), REVIEWED_EV_CHARGER_CONFIGURATION);
assert.equal(reviewedEvChargerConfiguration("level-2-ev-charger", { ...answers, ev_charger_equipment: "other_or_unsure" }), null);
assert.equal(reviewedEvChargerConfiguration("level-2-ev-charger", { ...answers, ev_charger_location: "other_or_unsure" }), null);
assert.equal(reviewedEvChargerConfiguration("level-2-ev-charger", { ...answers, ev_charger_route_access: "not_accessible_or_unsure" }), null);
assert.equal(reviewedEvChargerConfiguration("level-2-ev-charger", { ...answers, ev_charger_distance: "over_50_or_unsure" }), null);
assert.equal(reviewedEvChargerConfiguration("some-other-service", answers), null);

const seed = readFileSync("prisma/seed-level-2-ev-charger.ts", "utf8");
const route = readFileSync("app/api/admin/quotes/[quoteId]/ev-charger-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const catalog = readFileSync("prisma/seed.ts", "utf8");

assert.ok(seed.includes("40A-output / 50A-circuit") && seed.includes("customer_supplied_hardwired"));
assert.ok(seed.includes("A close range is enough") && seed.includes("measures the actual cable path"));
assert.ok(seed.includes('routeAction: "PHOTO_REVIEW"') && seed.includes("photosBlockBooking: true"));
assert.ok(seed.includes('const SHARED_ROLE_KEYS = ["CONSUMABLES_MEDIUM"]'));
assert.ok(route.includes("config.breakerRole") && route.includes("config.wireRole"));
for (const role of ["NM_CABLE_SUPPORT", "CONSUMABLES_MEDIUM"]) {
  assert.ok(route.includes(`"${role}"`), `runtime includes ${role}`);
}
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes("reviewedEvChargerConfiguration") && route.includes("routeFeet > 50"));
assert.ok(route.includes("panelCapacityConfirmed: true") && route.includes("evChargerConfigurationConfirmed: true"));
assert.ok(route.includes("CONTRACTOR_MEASUREMENT") && !route.includes("ROUTE_ASSIST"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("reviewedEvChargerConfiguration(q.service.slug, answerSnapshot)"));
assert.ok(form.includes("ev-charger-scope") && form.includes("homeowner&apos;s rough range"));
assert.ok(form.includes("load management") && form.includes("Plug-in chargers"));
const catalogLine = catalog.split("\n").find((line) => line.includes('slug: "level-2-ev-charger"')) ?? "";
assert.ok(!catalogLine.includes("basePrice:"), "the legacy flat EV charger price is not seeded");

console.log("EV charger review contract: exact 40A-output hardwired package derives an editable unsent suggestion; plug-in, outdoor, detached, load-managed and inaccessible scopes stay review-only");
