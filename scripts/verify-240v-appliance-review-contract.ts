import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APPLIANCE_240V_CONFIG_BY_APPLIANCE, reviewedAppliance240vConfiguration } from "../lib/electrical/appliance240vReviewPackage";

const expected = {
  dryer: ["dryer", 30, "RECEPTACLE_14_30", "BREAKER_DOUBLE_POLE_30A", "WIRE_10_3"],
  range: ["range", 50, "RECEPTACLE_14_50", "BREAKER_DOUBLE_POLE_50A", "WIRE_6_3"],
} as const;
for (const [appliance, values] of Object.entries(expected) as ["dryer" | "range", typeof expected.dryer | typeof expected.range][]) {
  const config = APPLIANCE_240V_CONFIG_BY_APPLIANCE[appliance];
  assert.deepEqual([config.appliance, config.amperage, config.receptacleRole, config.breakerRole, config.wireRole], values);
  const answers = {
    appliance_240v_type: config.appliance,
    appliance_240v_connection: "four_prong_plug",
    appliance_240v_endpoint: "surface_box",
    appliance_240v_route_access: "unfinished_basement",
    appliance_240v_distance: "25_to_50",
  };
  assert.deepEqual(reviewedAppliance240vConfiguration("new-240v-appliance-circuit", answers), config);
  assert.equal(reviewedAppliance240vConfiguration("new-240v-appliance-circuit", { ...answers, appliance_240v_connection: "nonstandard_or_unsure" }), null);
  assert.equal(reviewedAppliance240vConfiguration("new-240v-appliance-circuit", { ...answers, appliance_240v_endpoint: "flush_or_unsure" }), null);
  assert.equal(reviewedAppliance240vConfiguration("new-240v-appliance-circuit", { ...answers, appliance_240v_route_access: "not_accessible_or_unsure" }), null);
  assert.equal(reviewedAppliance240vConfiguration("new-240v-appliance-circuit", { ...answers, appliance_240v_distance: "over_50_or_unsure" }), null);
}
assert.equal(reviewedAppliance240vConfiguration("some-other-service", { appliance_240v_type: "dryer" }), null);

const seed = readFileSync("prisma/seed-240v-appliance-circuits.ts", "utf8");
const route = readFileSync("app/api/admin/quotes/[quoteId]/appliance-240v-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const dedicatedSeed = readFileSync("prisma/seed-dedicated-circuit.ts", "utf8");

assert.ok(seed.includes("New Dryer or Range Circuit & Outlet") && seed.includes('"dryer"') && seed.includes('"range"'));
assert.ok(seed.includes("A close range is enough") && seed.includes("electrician measures the actual cable path"));
assert.ok(seed.includes('routeAction: "PHOTO_REVIEW"') && seed.includes("photosBlockBooking: true"));
for (const role of ["RECEPTACLE_14_30", "RECEPTACLE_14_50", "BREAKER_DOUBLE_POLE_30A", "BREAKER_DOUBLE_POLE_50A", "WIRE_10_3", "WIRE_6_3", "BOX_SURFACE_4S", "COVER_RAISED_4S", "CONSUMABLES_MEDIUM"]) {
  assert.ok(seed.includes(`"${role}"`), `seed includes ${role}`);
}
assert.ok(!dedicatedSeed.match(/const RETIRED = \[[\s\S]*"new-240v-appliance-circuit"/));

assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes("reviewedAppliance240vConfiguration") && route.includes("routeFeet > 50"));
assert.ok(route.includes("panelCapacityConfirmed: true") && route.includes("applianceCircuitConfigurationConfirmed: true"));
assert.ok(route.includes("CONTRACTOR_MEASUREMENT") && !route.includes("ROUTE_ASSIST"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("reviewedAppliance240vConfiguration(q.service.slug, answerSnapshot)"));
assert.ok(form.includes("appliance-240v-scope") && form.includes("homeowner&apos;s rough range"));
assert.ok(form.includes("Three-prong legacy outlets") && form.includes("hardwired equipment"));

console.log("240V appliance review contract: exact modern four-wire dryer/range packages derive editable unsent suggestions; legacy, hardwired, flush and inaccessible scopes stay review-only");
