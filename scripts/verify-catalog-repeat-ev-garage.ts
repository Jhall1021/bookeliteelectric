import assert from "node:assert/strict";
import fs from "node:fs";

import { circuitPackageFor, isCircuitPackageService } from "../lib/electrical/circuitPackagePricing";
import { reviewedEvChargerConfiguration } from "../lib/electrical/evChargerReviewPackage";
import { INTERNAL_RECIPE_ONLY_SERVICE_SLUGS } from "../lib/electrical/internalRecipeServices";

const evAnswers = {
  ev_charger_equipment: "customer_supplied_hardwired",
  ev_charger_location: "attached_garage_interior",
  ev_charger_panel_location: "same_garage",
  ev_charger_route_access: "unfinished_basement",
  ev_charger_distance: "under_25",
};

assert.equal(isCircuitPackageService("level-2-ev-charger"), true);
assert.ok(reviewedEvChargerConfiguration("level-2-ev-charger", evAnswers));
assert.equal(reviewedEvChargerConfiguration("level-2-ev-charger", { ...evAnswers, ev_charger_panel_location: "elsewhere" }), null);
const evPackage = circuitPackageFor("level-2-ev-charger", evAnswers, [25, 50]);
assert.ok(evPackage);
assert.equal(evPackage?.routeFeet, 25);
assert.equal(evPackage?.cableRole, "WIRE_6_2");
assert.ok(evPackage?.materialRoles.includes("BREAKER_DOUBLE_POLE_50A"));

for (const slug of ["tilt-tv-mount", "articulating-tv-mount", "garage-door-opener-outlet-ev"]) {
  assert.ok((INTERNAL_RECIPE_ONLY_SERVICE_SLUGS as readonly string[]).includes(slug), `${slug} should not appear as a standalone storefront card`);
}

const evSeed = fs.readFileSync("prisma/seed-level-2-ev-charger.ts", "utf8");
assert.match(evSeed, /ev_charger_panel_location/);
assert.match(evSeed, /priced\("ev_charger_distance", "25 feet or less"/);
assert.match(evSeed, /pricingMethod: "DERIVED_RESOLVED_SCOPE"/);

const servicePage = fs.readFileSync("app/[site]/services/[category]/[service]/page.tsx", "utf8");
assert.match(servicePage, /garage-door-opener-outlet-ev/);
assert.match(servicePage, /new-outlets\/garage-door-opener-outlet/);

console.log("catalog cleanup, repeat pricing, EV and garage flow contract: PASS");
