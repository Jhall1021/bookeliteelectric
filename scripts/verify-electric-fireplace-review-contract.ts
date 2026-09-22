import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isReviewedStandardElectricFireplaceCircuit } from "../lib/electrical/electricFireplaceReviewPackage";

const eligible = {
  fireplace_connection: "standard_plug",
  fireplace_amperage: "20a",
  fireplace_wall: "ordinary_drywall",
  fireplace_route_access: "accessible_attic",
  fireplace_distance: "25_to_50",
};
assert.equal(isReviewedStandardElectricFireplaceCircuit(eligible), true);
assert.equal(isReviewedStandardElectricFireplaceCircuit({ ...eligible, fireplace_connection: "nonstandard_or_unsure" }), false);
assert.equal(isReviewedStandardElectricFireplaceCircuit({ ...eligible, fireplace_wall: "specialty_or_unsure" }), false);
assert.equal(isReviewedStandardElectricFireplaceCircuit({ ...eligible, fireplace_route_access: "not_accessible_or_unsure" }), false);
assert.equal(isReviewedStandardElectricFireplaceCircuit({ ...eligible, fireplace_distance: "over_50_or_unsure" }), false);

const seed = readFileSync("prisma/seed-electric-fireplace-circuit.ts", "utf8");
const route = readFileSync("app/api/admin/quotes/[quoteId]/electric-fireplace-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const dedicatedSeed = readFileSync("prisma/seed-dedicated-circuit.ts", "utf8");

assert.ok(seed.includes("Electric Fireplace Circuit & Outlet") && seed.includes("15A or 20A"));
assert.ok(seed.includes('key: "fireplace_amperage"') && seed.includes('"15 amp", "15a"') && seed.includes('"20 amp", "20a"'));
assert.ok(seed.includes('photosBlockBooking: false'));
for (const role of ["BOX_OLD_WORK", "WALL_PLATE", "CONSUMABLES_MEDIUM"]) assert.ok(seed.includes(`"${role}"`));
assert.ok(!dedicatedSeed.match(/const RETIRED = \[[\s\S]*"electric-fireplace-circuit"/));

assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes("circuitAmps !== 15 && circuitAmps !== 20"));
assert.ok(route.includes('circuitAmps === 20 ? "BREAKER_SINGLE_POLE_20A" : "BREAKER_SINGLE_POLE_15A"'));
assert.ok(route.includes('circuitAmps === 20 ? "WIRE_12_2" : "WIRE_14_2"'));
assert.ok(route.includes('"RECEPTACLE_STANDARD"') && !route.includes("GFCI_INTERIOR_20A"));
assert.ok(route.includes("panelCapacityConfirmed: true") && route.includes("fireplaceEquipmentRatingConfirmed: true") && route.includes("CONTRACTOR_MEASUREMENT") && !route.includes("ROUTE_ASSIST"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("isReviewedStandardElectricFireplaceCircuit(answerSnapshot)"));
assert.ok(form.includes("15A · 14/2 cable") && form.includes("20A · 12/2 cable"));
assert.ok(form.includes("homeowner&apos;s distance range is context only") && form.includes("electric-fireplace-scope"));

console.log("electric-fireplace contract: homeowner-visible 15A/20A plug-in packages price through the shared circuit authority; nonstandard scopes stay review-only");
