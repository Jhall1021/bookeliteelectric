import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { platformLaborHours } from "../lib/electrical/platformLaborBaseline";
import {
  dedicatedGarageAllowanceFeet,
  dedicatedGarageRouteFeet,
  dedicatedHomeProfileUsesSurfaceConduit,
  dedicatedVerticalRoutePlan,
  parseDedicatedHomeProfile,
} from "../lib/electrical/dedicatedHomeProfile";

const seed = readFileSync("prisma/seed-dedicated-circuit.ts", "utf8");
const distanceModel = readFileSync("components/guided-flow/DedicatedCircuitDistanceModel.tsx", "utf8");
const doorway = readFileSync("lib/electrical/doorwayRouting.ts", "utf8");
const activation = readFileSync("scripts/activate-dedicated-finished-wall-pricing-2026-10-06.ts", "utf8");

assert.match(seed, /label: "No"[\s\S]{0,180}value: DEDICATED_ROUTE_ACCESS_VALUES\.finished[\s\S]{0,180}routeAction: "CONTINUE"[\s\S]{0,180}nextQuestionId: q1\.id/);
assert.match(distanceModel, /Interactive diagram of the selected home and dedicated circuit route/);
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

const garageProfile = parseDedicatedHomeProfile({
  dedicated_home_stories: "one",
  dedicated_destination_floor: "first",
  dedicated_home_access: "attic",
  dedicated_panel_location: "garage",
  dedicated_panel_access: "accessible",
  dedicated_garage_size: "two",
});
assert.ok(garageProfile);
assert.equal(dedicatedGarageAllowanceFeet(garageProfile), 24);
assert.equal(dedicatedGarageRouteFeet(garageProfile, 1), 24);
assert.equal(dedicatedGarageRouteFeet(garageProfile, 0.5), 12);
assert.equal(dedicatedGarageRouteFeet(garageProfile, 0), 0);
assert.equal(dedicatedHomeProfileUsesSurfaceConduit(garageProfile), false);

const biLevelProfile = parseDedicatedHomeProfile({
  dedicated_home_stories: "two",
  dedicated_home_layout: "bi-level",
  dedicated_destination_floor: "second",
  dedicated_home_access: "none",
  dedicated_panel_location: "inside",
  dedicated_panel_floor: "first",
  dedicated_panel_access: "finished",
});
assert.ok(biLevelProfile);
assert.equal(biLevelProfile.layout, "bi-level");
assert.deepEqual(dedicatedVerticalRoutePlan(biLevelProfile), {
  cableFeet: 5,
  floorTransitions: 1,
  platePenetrations: 1,
  drywallAccessOpenings: 1,
  finishedWallFishFeet: 5,
});

const triLevelGarageProfile = parseDedicatedHomeProfile({
  dedicated_home_stories: "three",
  dedicated_home_layout: "tri-level",
  dedicated_home_has_garage: "yes",
  dedicated_garage_size: "two",
  dedicated_destination_floor: "third",
  dedicated_home_access: "attic",
  dedicated_panel_location: "garage",
  dedicated_panel_floor: "second",
  dedicated_panel_access: "accessible",
});
assert.ok(triLevelGarageProfile);
assert.equal(triLevelGarageProfile.panelFloor, "second");
assert.deepEqual(dedicatedVerticalRoutePlan(triLevelGarageProfile), {
  cableFeet: 5,
  floorTransitions: 1,
  platePenetrations: 1,
  drywallAccessOpenings: 0,
  finishedWallFishFeet: 0,
});

const basementAtticProfile = parseDedicatedHomeProfile({
  dedicated_home_stories: "two",
  dedicated_destination_floor: "second",
  dedicated_home_access: "attic",
  dedicated_panel_location: "basement",
  dedicated_panel_access: "open",
});
assert.ok(basementAtticProfile);
assert.deepEqual(dedicatedVerticalRoutePlan(basementAtticProfile), {
  cableFeet: 27,
  floorTransitions: 2,
  platePenetrations: 4,
  drywallAccessOpenings: 2,
  finishedWallFishFeet: 18,
});
const finishedBasementAtticProfile = parseDedicatedHomeProfile({
  dedicated_home_stories: "two",
  dedicated_destination_floor: "second",
  dedicated_home_access: "attic",
  dedicated_panel_location: "basement",
  dedicated_panel_access: "finished",
});
assert.ok(finishedBasementAtticProfile);
assert.deepEqual(dedicatedVerticalRoutePlan(finishedBasementAtticProfile), {
  cableFeet: 27,
  floorTransitions: 2,
  platePenetrations: 4,
  drywallAccessOpenings: 3,
  finishedWallFishFeet: 21,
});
const threeStoryBasementAtticProfile = parseDedicatedHomeProfile({
  dedicated_home_stories: "three",
  dedicated_destination_floor: "third",
  dedicated_home_access: "attic",
  dedicated_panel_location: "basement",
  dedicated_panel_floor: "basement",
  dedicated_panel_access: "open",
});
assert.ok(threeStoryBasementAtticProfile);
assert.deepEqual(dedicatedVerticalRoutePlan(threeStoryBasementAtticProfile), {
  cableFeet: 36,
  floorTransitions: 3,
  platePenetrations: 6,
  drywallAccessOpenings: 3,
  finishedWallFishFeet: 27,
});
const basementAtticRoute = circuitPackageFor("dedicated-120v-circuit-outlet", {
  ...base,
  dedicated_route_access: "accessible",
  dedicated_distance: "20",
  dedicated_home_stories: "two",
  dedicated_destination_floor: "second",
  dedicated_home_access: "attic",
  dedicated_panel_location: "basement",
  dedicated_panel_access: "open",
});
assert.equal(basementAtticRoute?.routeFeet, 47);
assert.equal(basementAtticRoute?.facts.accessibleRouteFeet, 29);
assert.equal(basementAtticRoute?.facts.concealedRouteFeet, 18);
assert.equal(basementAtticRoute?.facts.perpendicularFramingFeet, 0);
assert.equal(basementAtticRoute?.facts.dedicatedPlatePenetrations, 4);
assert.equal(basementAtticRoute?.facts.dedicatedWallToBoxFishes, 1);
assert.equal(basementAtticRoute?.facts.dedicatedVerticalDrywallOpenings, 2);
assert.equal(basementAtticRoute?.facts.multiStoryRiserTransitions, 2);
assert.match(basementAtticRoute?.description ?? "", /27-foot basement-to-attic riser with 2 access openings/);
const splitLevelRoute = circuitPackageFor("dedicated-120v-circuit-outlet", {
  ...base,
  dedicated_distance: "20",
  dedicated_home_stories: "two",
  dedicated_home_layout: "bi-level",
  dedicated_destination_floor: "second",
  dedicated_home_access: "none",
  dedicated_panel_location: "inside",
  dedicated_panel_floor: "first",
  dedicated_panel_access: "finished",
});
assert.equal(splitLevelRoute?.routeFeet, 25);
assert.equal(splitLevelRoute?.facts.dedicatedPlatePenetrations, 1);
assert.equal(splitLevelRoute?.facts.dedicatedVerticalDrywallOpenings, 1);
assert.equal(splitLevelRoute?.facts.multiStoryRiserTransitions, 1);
assert.match(splitLevelRoute?.description ?? "", /5-foot split-level transition with 1 access opening/);
const garageRoute = circuitPackageFor("dedicated-120v-circuit-outlet", {
  ...base,
  dedicated_route_access: "accessible",
  dedicated_distance: "44",
  dedicated_distance_route_sections: JSON.stringify([{ id: 1, feet: 44, access: "accessible", doorways: 0 }]),
});
assert.equal(garageRoute?.routeFeet, 44, "24 garage feet plus 20 remaining feet prices as a 44-foot route");

const threeLevelCustomerRoute = circuitPackageFor("dedicated-120v-circuit-outlet", {
  ...base,
  dedicated_route_access: "accessible",
  dedicated_distance: "45",
  dedicated_home_stories: "three",
  dedicated_home_layout: "tri-level",
  dedicated_home_has_garage: "no",
  dedicated_basement_ceiling: "open",
  dedicated_home_has_crawl_space: "no",
  dedicated_home_has_attic: "yes",
  dedicated_destination_floor: "third",
  dedicated_home_access: "attic",
  dedicated_panel_location: "basement",
  dedicated_panel_floor: "basement",
  dedicated_panel_access: "open",
});
assert.ok(threeLevelCustomerRoute);
assert.equal(threeLevelCustomerRoute.routeFeet, 81);
assert.equal(threeLevelCustomerRoute.facts.multiStoryRiserTransitions, 3);
const approvedLabor = Object.entries(platformLaborHours()).map(([operationKey, hoursPerUnit]) => ({
  operationKey, hoursPerUnit, source: "PLATFORM_BASELINE" as const,
}));
const threeLevelLabor = projectElectricalServiceLabor(
  threeLevelCustomerRoute.laborServiceSlug,
  approvedLabor,
  { ...threeLevelCustomerRoute.facts, nmCableSupportCount: 18 },
);
const sameRouteWithoutTransitionAllowance = projectElectricalServiceLabor(
  threeLevelCustomerRoute.laborServiceSlug,
  approvedLabor,
  { ...threeLevelCustomerRoute.facts, multiStoryRiserTransitions: 0, nmCableSupportCount: 18 },
);
assert.equal(threeLevelLabor.kind, "READY_FOR_APPROVAL");
assert.equal(sameRouteWithoutTransitionAllowance.kind, "READY_FOR_APPROVAL");
if (threeLevelLabor.kind !== "READY_FOR_APPROVAL" || sameRouteWithoutTransitionAllowance.kind !== "READY_FOR_APPROVAL") {
  throw new Error("three-level dedicated route labor must resolve");
}
assert.equal(
  threeLevelLabor.projection.lines.find((line) => line.operationKey === "ELEC_MULTI_STORY_RISER_TRANSITION")?.quantity,
  3,
);
assert.ok(Math.abs(threeLevelLabor.suggestedHours - sameRouteWithoutTransitionAllowance.suggestedHours - 3) < 1e-9);

console.log("dedicated route: tailored home diagram, panel-position garage estimate, exact remaining footage, doorway allowance, multi-story riser labor, conservative opening envelope, and 100-foot boundary verified");
