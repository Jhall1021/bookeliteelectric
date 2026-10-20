import assert from "node:assert/strict";

import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { parseMixedRouteSections, routeSectionsAnswerKey, summarizeMixedRouteSections } from "../lib/electrical/mixedRouteSections";
import { platformLaborHours } from "../lib/electrical/platformLaborBaseline";
import {
  pruneRouteWalkAnswers,
  routeWalkEnginePreview,
  routeWalkSteps,
  routeWalkToDedicatedAnswers,
  type RouteWalkAnswers,
} from "../lib/electrical/routeWalk";

const SLUG = "dedicated-120v-circuit-outlet";
const approvedLabor = Object.entries(platformLaborHours()).map(([operationKey, hoursPerUnit]) => ({
  operationKey, hoursPerUnit, source: "PLATFORM_BASELINE" as const,
}));

const done = { exterior: "no", finishAck: "accepted", wall: "drywall", equipment: "fridge_freezer" } as const;

function priced(name: string, answers: RouteWalkAnswers) {
  const result = routeWalkToDedicatedAnswers(answers);
  assert.equal(result.kind, "PRICE_INPUTS", `${name}: expected price inputs, got ${JSON.stringify(result)}`);
  if (result.kind !== "PRICE_INPUTS") throw new Error("unreachable");
  const pkg = circuitPackageFor(SLUG, result.answers);
  assert.ok(pkg, `${name}: engine refused mapped answers ${JSON.stringify(result.answers)}`);
  const preview = routeWalkEnginePreview(result.answers);
  assert.equal(preview.floorTransitions, pkg.facts.multiStoryRiserTransitions, `${name}: preview risers`);
  if (!preview.bandCeiling) assert.equal(preview.routeFeet, pkg.routeFeet, `${name}: preview route feet`);
  const labor = projectElectricalServiceLabor(pkg.laborServiceSlug, approvedLabor, { ...pkg.facts, nmCableSupportCount: Math.ceil(pkg.routeFeet / 4.5) });
  assert.equal(labor.kind, "READY_FOR_APPROVAL", name);
  const hours = labor.kind === "READY_FOR_APPROVAL" ? labor.suggestedHours : NaN;
  console.log(`PRICE   ${name.padEnd(58)} ${String(pkg.routeFeet).padStart(3)} ft  risers ${pkg.facts.multiStoryRiserTransitions}  ${pkg.facts.finishedRoute ? "concealed" : "open"}  ${hours.toFixed(2)} h${result.flags.length ? `  [${result.flags.join(", ")}]` : ""}`);
  return { result, pkg };
}

function reviewed(name: string, answers: RouteWalkAnswers, code: string) {
  const result = routeWalkToDedicatedAnswers(answers);
  assert.equal(result.kind, "REVIEW", `${name}: expected REVIEW, got ${JSON.stringify(result)}`);
  if (result.kind === "REVIEW") assert.equal(result.code, code, name);
  console.log(`REVIEW  ${name.padEnd(58)} ${code}`);
}

// 1. The owner-approved tri-level example must map to the same engine input: 81 ft, 3 risers.
const triLevel = priced("Tri-level, basement panel → upper level via attic, 45 ft", {
  ...done, shape: "tri-level", below: "basement", basementCeiling: "open", hasGarage: "no",
  outletPlace: "3", panelPlace: "basement", openBelowOutlet: "no", atticOverOutlet: "yes", distanceMethod: "feet", distanceFeet: "45",
});
assert.equal(triLevel.pkg.routeFeet, 81);
assert.equal(triLevel.pkg.facts.multiStoryRiserTransitions, 3);
const existingTriLevel = circuitPackageFor(SLUG, {
  dedicated_equipment: "fridge_freezer", dedicated_finish_ack: "accepted", dedicated_route_access: "accessible", dedicated_distance: "45",
  dedicated_home_stories: "three", dedicated_home_layout: "tri-level", dedicated_home_has_garage: "no", dedicated_basement_ceiling: "open",
  dedicated_home_has_crawl_space: "no", dedicated_home_has_attic: "yes", dedicated_destination_floor: "third", dedicated_home_access: "attic",
  dedicated_panel_location: "basement", dedicated_panel_floor: "basement", dedicated_panel_access: "open",
});
assert.deepEqual(triLevel.pkg.facts, existingTriLevel?.facts, "route walk feeds the engine exactly what the home builder did");

// 2. Ordinary routes price directly.
priced("One story, basement panel, outlet over open basement, 30 ft", {
  ...done, shape: "one", below: "basement", basementCeiling: "open", hasGarage: "no",
  outletPlace: "1", panelPlace: "basement", openBelowOutlet: "yes", distanceMethod: "feet", distanceFeet: "30",
});
priced("Sump pump in open basement next to panel, 12 ft", {
  ...done, equipment: "sump_pump", wall: "drywall", shape: "two", below: "basement", basementCeiling: "open", hasGarage: "yes", garageSize: "two",
  outletPlace: "0", panelPlace: "basement", distanceMethod: "feet", distanceFeet: "12",
});
const garage = priced("One story, garage panel on far wall (2-car), attic, 30 ft", {
  ...done, shape: "one", below: "slab", hasGarage: "yes", garageSize: "two", outletPlace: "1",
  panelPlace: "garage", garageWall: "far", garageFinished: "no", atticOverOutlet: "yes", distanceMethod: "feet", distanceFeet: "30",
});
assert.equal(garage.pkg.routeFeet, 54);
const steps = priced("Slab ranch, hallway panel, finished walls, 14 steps, 2 doorways", {
  ...done, shape: "one", below: "slab", hasGarage: "no", outletPlace: "1", panelPlace: "inside",
  atticOverOutlet: "no", distanceMethod: "steps", distanceSteps: "14", doorways: "2",
});
assert.equal(steps.pkg.routeFeet, 35 + 28);
assert.equal(steps.pkg.facts.finishedRoute, true);
priced("Bi-level, lower-level panel → upper level via attic, 25 ft", {
  ...done, shape: "bi-level", below: "slab", hasGarage: "no", outletPlace: "2", panelPlace: "inside", panelLevel: "1",
  atticOverOutlet: "yes", distanceMethod: "feet", distanceFeet: "25",
});
const triGarage = priced("Tri-level, lower-level garage panel → upper level via attic", {
  ...done, shape: "tri-level", below: "slab", hasGarage: "yes", garageSize: "one", outletPlace: "3",
  panelPlace: "garage", garageWall: "house", garageFinished: "no", atticOverOutlet: "yes", distanceMethod: "feet", distanceFeet: "20",
});
assert.equal(triGarage.pkg.routeFeet, 30);
assert.equal(triGarage.pkg.facts.multiStoryRiserTransitions, 2);
const unsure = priced("Unsure about attic → priced as finished walls", {
  ...done, shape: "one", below: "slab", hasGarage: "no", outletPlace: "1", panelPlace: "inside",
  atticOverOutlet: "unsure", distanceMethod: "feet", distanceFeet: "20", doorways: "0",
});
assert.equal(unsure.pkg.facts.finishedRoute, true);
const estimateAnswers: RouteWalkAnswers = {
  ...done, shape: "one", below: "basement", basementCeiling: "open", hasGarage: "no", outletPlace: "1",
  panelPlace: "basement", openBelowOutlet: "yes", distanceMethod: "estimate", distanceEstimate: "near",
};
assert.equal(routeWalkToDedicatedAnswers(estimateAnswers).kind, "INCOMPLETE", "an estimate books only after the customer approves it");
const estimate = priced("Estimate 'same or next room', customer approved → first band", { ...estimateAnswers, estimateAck: "accepted" });
assert.equal(estimate.result.answers.dedicated_distance, "under_25");
priced("Garage freezer, panel in same open garage, 18 ft", {
  ...done, shape: "two", below: "slab", hasGarage: "yes", garageSize: "two", outletPlace: "garage",
  panelPlace: "garage", garageWall: "house", garageFinished: "no", distanceMethod: "feet", distanceFeet: "18",
});

const partialSplit = priced("Tri-level, crawlspace under middle of a 40 ft walk", {
  ...done, shape: "tri-level", below: "crawl", hasGarage: "no", outletPlace: "2",
  panelPlace: "inside", panelLevel: "2", openBelowOutlet: "yes", belowCoverage: "partial", belowPosition: "middle",
  distanceMethod: "feet", distanceFeet: "40", belowFeet: "18", doorways: "1",
});
const partialSections = parseMixedRouteSections(partialSplit.result.answers[routeSectionsAnswerKey("dedicated_distance")]);
assert.ok(partialSections, "partial split-level route emits mixed route sections");
assert.deepEqual(summarizeMixedRouteSections(partialSections!), { accessibleFeet: 18, finishedMeasuredFeet: 22, doorwayCount: 1 });
assert.equal(partialSplit.pkg.facts.accessibleRouteFeet, 18);
assert.equal(partialSplit.pkg.facts.concealedRouteFeet, 36);
assert.ok(partialSplit.result.flags.includes("PARTIAL_FOUNDATION_MIXED_ROUTE"));
reviewed("Partial split-level route entered as an estimate", {
  ...done, shape: "tri-level", below: "crawl", hasGarage: "no", outletPlace: "2",
  panelPlace: "inside", panelLevel: "2", openBelowOutlet: "yes", belowCoverage: "partial", belowPosition: "middle",
  distanceMethod: "estimate", distanceEstimate: "across", estimateAck: "accepted",
}, "PARTIAL_FOUNDATION_NEEDS_MEASUREMENT");
const invalidPartial = routeWalkToDedicatedAnswers({
  ...done, shape: "tri-level", below: "crawl", hasGarage: "no", outletPlace: "2",
  panelPlace: "inside", panelLevel: "2", openBelowOutlet: "yes", belowCoverage: "partial", belowPosition: "middle",
  distanceMethod: "feet", distanceFeet: "40", belowFeet: "40", doorways: "0",
});
assert.equal(invalidPartial.kind, "INCOMPLETE", "open-space footage must be shorter than the full walk");

// 3. Ordinary standard-home risers are modelled instead of falling to review.
const basementToSecond = priced("Two story, basement panel → second floor, no attic", {
  ...done, shape: "two", below: "basement", basementCeiling: "open", hasGarage: "no", outletPlace: "2",
  panelPlace: "basement", atticOverOutlet: "no", distanceMethod: "feet", distanceFeet: "30", doorways: "0",
});
assert.equal(basementToSecond.pkg.routeFeet, 48);
assert.equal(basementToSecond.pkg.facts.multiStoryRiserTransitions, 2);
const firstToSecond = priced("Two story, first-floor panel → second floor via attic", {
  ...done, shape: "two", below: "slab", hasGarage: "no", outletPlace: "2", panelPlace: "inside", panelLevel: "1",
  atticOverOutlet: "yes", distanceMethod: "feet", distanceFeet: "30",
});
assert.equal(firstToSecond.pkg.routeFeet, 45);
assert.equal(firstToSecond.pkg.facts.multiStoryRiserTransitions, 1);
const garageToSecond = priced("Two story, garage panel → second floor via attic", {
  ...done, shape: "two", below: "slab", hasGarage: "yes", garageSize: "two", outletPlace: "2", panelPlace: "garage",
  garageWall: "far", garageFinished: "no", atticOverOutlet: "yes", distanceMethod: "feet", distanceFeet: "30",
});
assert.equal(garageToSecond.pkg.routeFeet, 69);
assert.equal(garageToSecond.pkg.facts.multiStoryRiserTransitions, 1);
reviewed("Drywalled garage panel", {
  ...done, shape: "one", below: "slab", hasGarage: "yes", garageSize: "two", outletPlace: "1", panelPlace: "garage",
  garageWall: "house", garageFinished: "yes",
}, "GARAGE_SURFACE_CONDUIT");
reviewed("Sump pump on a concrete basement wall", {
  ...done, equipment: "sump_pump", wall: "concrete", shape: "two", below: "basement", basementCeiling: "open", hasGarage: "no", outletPlace: "0",
}, "SURFACE_MOUNT_PENDING_ENGINE");
const unsureWall = priced("Wall type unsure → priced as drywall with disclosure", {
  ...done, wall: "unsure", shape: "one", below: "basement", basementCeiling: "open", hasGarage: "no", outletPlace: "1",
  panelPlace: "basement", openBelowOutlet: "yes", distanceMethod: "feet", distanceFeet: "30",
});
assert.ok(unsureWall.result.flags.includes("WALL_TYPE_ASSUMED_DRYWALL"));
reviewed("Plaster wall", { ...done, wall: "plaster", shape: "one", below: "slab", hasGarage: "no", outletPlace: "1" }, "WALL_NOT_DRYWALL");
reviewed("Can't find the panel", { ...done, shape: "one", below: "slab", hasGarage: "no", outletPlace: "1", panelPlace: "unsure" }, "PANEL_NOT_FOUND");

// 4. Changing an earlier answer prunes questions that no longer apply.
const stale = pruneRouteWalkAnswers({
  ...done, shape: "two", below: "slab", hasGarage: "no", outletPlace: "1", panelPlace: "inside", panelLevel: "1",
  atticOverOutlet: "yes", distanceMethod: "feet", distanceFeet: "30",
});
assert.equal(stale.atticOverOutlet, undefined, "an attic answer for a top-floor outlet must not survive moving the outlet to the first floor");
assert.ok(routeWalkSteps(stale).some((step) => step.key === "doorways"), "the route falls back to finished walls and asks about doorways");

const stalePartial = pruneRouteWalkAnswers({
  ...done, shape: "tri-level", below: "crawl", hasGarage: "no", outletPlace: "2", panelPlace: "inside", panelLevel: "2",
  openBelowOutlet: "no", belowCoverage: "partial", belowPosition: "middle", belowFeet: "18",
  distanceMethod: "feet", distanceFeet: "40", doorways: "1",
});
assert.equal(stalePartial.belowCoverage, undefined, "partial-route answers are removed when the route no longer uses the lower open space");
assert.equal(stalePartial.belowFeet, undefined, "partial footage does not survive a route change");

console.log("route walk: every priced scenario is accepted by the dedicated-circuit package; standard and split-level risers are counted, while unsupported surfaces and unknowns fail closed");
