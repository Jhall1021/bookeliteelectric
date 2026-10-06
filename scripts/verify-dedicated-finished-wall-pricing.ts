import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";

const seed = readFileSync("prisma/seed-dedicated-circuit.ts", "utf8");
const guide = readFileSync("components/guided-flow/MeasurementGuide.tsx", "utf8");
const doorway = readFileSync("lib/electrical/doorwayRouting.ts", "utf8");
const activation = readFileSync("scripts/activate-dedicated-finished-wall-pricing-2026-10-06.ts", "utf8");

assert.match(seed, /label: "No"[\s\S]{0,180}value: DEDICATED_ROUTE_ACCESS_VALUES\.finished[\s\S]{0,180}routeAction: "CONTINUE"[\s\S]{0,180}nextQuestionId: q3\.id/);
assert.match(guide, /dedicatedFinishedRoute[\s\S]{0,700}<ElectricalPanel x=\{135\} y=\{165\} \/>[\s\S]{0,200}<Outlet x=\{455\} y=\{185\} \/>/);
assert.match(guide, /Measure from the electrical panel along the finished wall and ceiling to the new outlet/);
assert.match(doorway, /"dedicated_distance"/);
assert.match(activation, /No -> exact panel-to-outlet measurement -> disclosure -> derived price/);
assert.match(activation, /The route the wire will travel from the electrical panel to the new outlet, including any finished walls or ceilings/);

const base = {
  dedicated_equipment: "fridge_freezer",
  dedicated_route_access: "finished",
  dedicated_distance: "18",
  dedicated_finish_ack: "accepted",
};
const finished = circuitPackageFor("dedicated-120v-circuit-outlet", base);
assert.ok(finished);
assert.equal(finished.routeFeet, 18);
assert.equal(finished.facts.accessibleRoute, false);
assert.equal(finished.facts.finishedRoute, true);
assert.equal(finished.facts.concealedRouteFeet, 18);
assert.equal(finished.facts.perpendicularFramingFeet, 18);
assert.equal(finished.facts.framingSpacingInches, 16);
assert.ok(!finished.materialRoles.includes("NM_CABLE_SUPPORT"));
assert.match(finished.description, /electrical panel|finished-wall|120V dedicated circuit/i);

const doorwayRoute = circuitPackageFor("dedicated-120v-circuit-outlet", {
  ...base,
  dedicated_distance_doorway: "yes",
});
assert.equal(doorwayRoute?.routeFeet, 32);
assert.match(doorwayRoute?.description ?? "", /doorway bypass/);
assert.equal(circuitPackageFor("dedicated-120v-circuit-outlet", {
  ...base,
  dedicated_distance: "40",
  dedicated_distance_doorway: "yes",
}), null);

console.log("dedicated finished-wall route: panel source, exact footage, doorway allowance, conservative 16-inch opening envelope, and 50-foot review boundary verified");
