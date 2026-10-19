import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";

const seed = readFileSync("prisma/seed-dedicated-circuit.ts", "utf8");
const distanceModel = readFileSync("components/guided-flow/DedicatedCircuitDistanceModel.tsx", "utf8");
const doorway = readFileSync("lib/electrical/doorwayRouting.ts", "utf8");
const activation = readFileSync("scripts/activate-dedicated-finished-wall-pricing-2026-10-06.ts", "utf8");

assert.match(seed, /label: "No"[\s\S]{0,180}value: DEDICATED_ROUTE_ACCESS_VALUES\.finished[\s\S]{0,180}routeAction: "CONTINUE"[\s\S]{0,180}nextQuestionId: q1\.id/);
assert.match(distanceModel, /Tailored diagram of the selected home and dedicated circuit route/);
assert.match(distanceModel, /Don’t include the up-and-down wire at the panel or outlet/);
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
const threeDoorwayRoute = circuitPackageFor("dedicated-120v-circuit-outlet", {
  ...base,
  dedicated_distance: "6",
  dedicated_distance_doorway: "3",
});
assert.equal(threeDoorwayRoute?.routeFeet, 48);
assert.match(threeDoorwayRoute?.description ?? "", /3 doorway bypasses/);
assert.equal(circuitPackageFor("dedicated-120v-circuit-outlet", {
  ...base,
  dedicated_distance: "90",
  dedicated_distance_doorway: "yes",
}), null);
assert.equal(circuitPackageFor("dedicated-120v-circuit-outlet", {
  ...base,
  dedicated_surface_conduit: "yes",
}), null, "a finished-garage EMT route fails closed instead of using concealed-route economics");

console.log("dedicated finished-wall route: tailored home diagram, exact footage, doorway allowance, conservative 16-inch opening envelope, EMT review, and 100-foot boundary verified");
