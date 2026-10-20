import assert from "node:assert/strict";

import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { platformLaborHours } from "../lib/electrical/platformLaborBaseline";
import {
  pruneStairWalkAnswers,
  STAIR_WALK_ROUTE_ANSWER_KEYS,
  stairWalkEnginePreview,
  stairWalkScreens,
  stairWalkToDedicatedAnswers,
  type SwAnswers,
} from "../lib/electrical/stairWalk";
import { parseMixedRouteSections, routeSectionsAnswerKey, summarizeMixedRouteSections } from "../lib/electrical/mixedRouteSections";

const SLUG = "dedicated-120v-circuit-outlet";
const approvedLabor = Object.entries(platformLaborHours()).map(([operationKey, hoursPerUnit]) => ({
  operationKey, hoursPerUnit, source: "PLATFORM_BASELINE" as const,
}));
const done = { equipment: "fridge_freezer", wall: "hollow", exterior: "no", finishAck: "accepted", distanceMethod: "feet" } as const;

function priced(name: string, answers: SwAnswers) {
  const result = stairWalkToDedicatedAnswers(answers);
  assert.equal(result.kind, "PRICE_INPUTS", `${name}: ${JSON.stringify(result)}`);
  if (result.kind !== "PRICE_INPUTS") throw new Error("unreachable");
  const pkg = circuitPackageFor(SLUG, result.answers);
  assert.ok(pkg, `${name}: engine refused ${JSON.stringify(result.answers)}`);
  const preview = stairWalkEnginePreview(result.answers);
  assert.equal(preview.floorTransitions, pkg.facts.multiStoryRiserTransitions, `${name}: preview risers`);
  if (!preview.bandCeiling) assert.equal(preview.routeFeet, pkg.routeFeet, `${name}: preview route feet`);
  const labor = projectElectricalServiceLabor(pkg.laborServiceSlug, approvedLabor, { ...pkg.facts, nmCableSupportCount: Math.ceil(pkg.routeFeet / 4.5) });
  const hours = labor.kind === "READY_FOR_APPROVAL" ? labor.suggestedHours : NaN;
  const screens = stairWalkScreens(answers).length;
  console.log(`PRICE   ${name.padEnd(60)} ${screens} screens  ${String(pkg.routeFeet).padStart(3)} ft  risers ${pkg.facts.multiStoryRiserTransitions}  ${pkg.facts.finishedRoute ? "concealed" : "open"}  ${hours.toFixed(2)} h${result.flags.length ? `  [${result.flags.join(", ")}]` : ""}`);
  return { result, pkg };
}

function reviewed(name: string, answers: SwAnswers, code: string) {
  const result = stairWalkToDedicatedAnswers(answers);
  assert.equal(result.kind, "REVIEW", `${name}: ${JSON.stringify(result)}`);
  if (result.kind === "REVIEW") assert.equal(result.code, code, name);
  console.log(`REVIEW  ${name.padEnd(60)} ${code}`);
}

// The owner-approved tri-level example: 45 ft across the attic, three staircases up from the basement panel.
const tri = priced("Basement panel → 3 staircases up → attic, 45 ft ($835 case)", {
  ...done, panelPlace: "basement", panelCeiling: "open", distanceFeet: "45", fullFlights: "3", openSpace: "attic",
});
assert.equal(tri.pkg.routeFeet, 81);
assert.equal(tri.pkg.facts.multiStoryRiserTransitions, 3);
const existingTri = circuitPackageFor(SLUG, {
  dedicated_equipment: "fridge_freezer", dedicated_finish_ack: "accepted", dedicated_route_access: "accessible", dedicated_distance: "45",
  dedicated_home_stories: "three", dedicated_home_layout: "tri-level", dedicated_home_has_garage: "no", dedicated_basement_ceiling: "open",
  dedicated_home_has_crawl_space: "no", dedicated_home_has_attic: "yes", dedicated_destination_floor: "third", dedicated_home_access: "attic",
  dedicated_panel_location: "basement", dedicated_panel_floor: "basement", dedicated_panel_access: "open",
});
assert.deepEqual(tri.pkg.facts, existingTri?.facts, "same engine facts as the approved example");

priced("Basement panel → 1 staircase up, open basement under outlet, 30 ft", {
  ...done, panelPlace: "basement", panelCeiling: "open", distanceFeet: "30", fullFlights: "1", openSpace: "below", belowCoverage: "all",
});
priced("Sump pump next to basement panel, open ceiling, 12 ft", {
  ...done, equipment: "sump_pump", panelPlace: "basement", panelCeiling: "open", distanceFeet: "12", openSpace: "below", belowCoverage: "all",
});
priced("Garage panel (studs show) → same floor, attic, walked 54 ft", {
  ...done, equipment: "microwave", panelPlace: "garage", garageStuds: "open", distanceFeet: "54", openSpace: "attic",
});
priced("Garage freezer, panel in the same open garage, 18 ft", {
  ...done, panelPlace: "garage", garageStuds: "open", distanceFeet: "18", openSpace: "garage",
});
const ranch = priced("Hallway panel, same floor, no open space, 14 steps, 2 doorways", {
  ...done, panelPlace: "inside", distanceMethod: "steps", distanceSteps: "14", doorways: "2", openSpace: "neither",
});
assert.equal(ranch.pkg.routeFeet, 35 + 28);
priced("Basement panel → 2 staircases up, no open space, 30 ft", {
  ...done, panelPlace: "basement", panelCeiling: "open", distanceFeet: "30", fullFlights: "2", openSpace: "neither",
});
priced("Inside panel → 1 staircase up → attic, 30 ft", {
  ...done, panelPlace: "inside", distanceFeet: "30", fullFlights: "1", direction: "up", openSpace: "attic",
});
priced("Split-level: inside panel → 1 half-flight up → attic, 25 ft", {
  ...done, panelPlace: "inside", distanceFeet: "25", halfFlights: "1", direction: "up", openSpace: "attic",
});
priced("Split-level: inside panel → 2 half-flights up → attic, 25 ft", {
  ...done, panelPlace: "inside", distanceFeet: "25", halfFlights: "2", direction: "up", openSpace: "attic",
});
const partialFoundation = priced("Split-level: 18 ft over crawlspace, then 22 ft over slab", {
  ...done, panelPlace: "inside", distanceFeet: "40", halfFlights: "1", direction: "up", doorways: "1",
  openSpace: "below", belowCoverage: "partial", belowPosition: "panel", belowFeet: "18",
});
const partialSections = parseMixedRouteSections(partialFoundation.result.answers[routeSectionsAnswerKey("dedicated_distance")]);
assert.ok(partialSections, "partial foundation maps to mixed route sections");
assert.deepEqual(summarizeMixedRouteSections(partialSections!), { accessibleFeet: 18, finishedMeasuredFeet: 22, doorwayCount: 1 });
assert.equal(partialFoundation.pkg.facts.accessibleRouteFeet, 18, "only the basement/crawlspace portion is open-access labor");
assert.equal(partialFoundation.pkg.facts.concealedRouteFeet, 41, "the slab portion, doorway detour and five-foot half-flight are finished-route labor");
assert.equal(partialFoundation.pkg.routeFeet, 59, "40 walked feet, 14 doorway feet and one five-foot half-flight");
assert.ok(partialFoundation.result.flags.includes("PARTIAL_FOUNDATION_MIXED_ROUTE"));
const middleFoundation = stairWalkToDedicatedAnswers({
  ...done, panelPlace: "inside", distanceFeet: "30", openSpace: "below", belowCoverage: "partial", belowPosition: "middle", belowFeet: "12",
});
assert.equal(middleFoundation.kind, "PRICE_INPUTS");
if (middleFoundation.kind === "PRICE_INPUTS") {
  const middleSections = parseMixedRouteSections(middleFoundation.answers[routeSectionsAnswerKey("dedicated_distance")]);
  assert.equal(middleSections?.length, 3, "a middle basement/crawlspace is shown between two finished/slab sections");
  assert.deepEqual(summarizeMixedRouteSections(middleSections!), { accessibleFeet: 12, finishedMeasuredFeet: 18, doorwayCount: 0 });
}
assert.equal(stairWalkToDedicatedAnswers({
  ...done, panelPlace: "inside", distanceMethod: "estimate", distanceEstimate: "near", estimateAck: "accepted",
  openSpace: "below", belowCoverage: "partial", belowPosition: "panel", belowFeet: "10",
}).kind, "REVIEW", "partial foundations require a measured total route");
assert.equal(stairWalkToDedicatedAnswers({
  ...done, panelPlace: "inside", distanceFeet: "30", openSpace: "below", belowCoverage: "partial", belowPosition: "panel", belowFeet: "30",
}).kind, "INCOMPLETE", "the open portion must be shorter than the full route");
priced("Split-level: garage panel → 2 half-flights up → attic, 20 ft", {
  ...done, panelPlace: "garage", garageStuds: "open", distanceFeet: "20", halfFlights: "2", direction: "up", openSpace: "attic",
});
priced("Panel upstairs → 1 staircase down to a lower floor, crawl space under outlet, 30 ft", {
  ...done, panelPlace: "inside", distanceFeet: "30", fullFlights: "1", direction: "down", openSpace: "below", belowCoverage: "all",
});
const toBasement = priced("First-floor panel → down to the basement, open ceiling near outlet, 30 ft", {
  ...done, equipment: "sump_pump", panelPlace: "inside", distanceFeet: "30", fullFlights: "1", direction: "basement", openSpace: "below", belowCoverage: "all",
});
assert.equal(toBasement.pkg.facts.multiStoryRiserTransitions, 0, "a basement outlet under a first-floor panel uses the basement ceiling, no riser");
priced("Second-floor panel → 2 staircases down to the basement, 30 ft", {
  ...done, panelPlace: "inside", distanceFeet: "30", fullFlights: "2", direction: "basement", openSpace: "below", belowCoverage: "all",
});
const unsureWall = priced("Wall not sure → priced as drywall", {
  ...done, wall: "unsure", panelPlace: "inside", distanceFeet: "20", openSpace: "attic",
});
assert.ok(unsureWall.result.flags.includes("WALL_TYPE_ASSUMED_DRYWALL"));
const estimateAnswers: SwAnswers = { ...done, panelPlace: "inside", distanceMethod: "estimate", distanceEstimate: "near", openSpace: "attic" };
assert.equal(stairWalkToDedicatedAnswers(estimateAnswers).kind, "INCOMPLETE", "an estimate prices only after the customer approves it");
priced("Estimate 'same or next room', approved", { ...estimateAnswers, estimateAck: "accepted" });

reviewed("Concrete wall (surface mount not in the engine yet)", { ...done, wall: "concrete", panelPlace: "basement" }, "SURFACE_MOUNT_PENDING_ENGINE");
// Finished garages price as cable in surface EMT instead of going to review.
const conduitInside = priced("Drywalled garage panel (2-car) → same floor via attic, walked 40 ft", {
  ...done, equipment: "microwave", panelPlace: "garage", garageStuds: "drywall", garageRun: "two", distanceFeet: "40", openSpace: "attic",
});
assert.equal(conduitInside.result.answers.dedicated_garage_emt_feet, "28", "24 ft across the garage plus 4 ft up to the ceiling");
assert.equal(conduitInside.pkg.routeFeet, 44, "the walk plus the conduit rise");
assert.equal(conduitInside.pkg.facts.accessibleRouteFeet, 16, "only the cable beyond the conduit is priced as open cable");
assert.ok(conduitInside.pkg.materialRoles.includes("EMT_1_2") && conduitInside.pkg.materialRoles.includes("BOX_OLD_WORK"));
const conduitGarageOutlet = priced("Drywalled garage, freezer in the same garage, 18 ft", {
  ...done, panelPlace: "garage", garageStuds: "drywall", garageRun: "near", distanceFeet: "18", openSpace: "garage",
});
assert.equal(conduitGarageOutlet.pkg.facts.garageEmtFeet, 18);
assert.equal(conduitGarageOutlet.pkg.facts.outletSurfaceBox, true);
assert.ok(conduitGarageOutlet.pkg.materialRoles.includes("BOX_SURFACE_4S") && !conduitGarageOutlet.pkg.materialRoles.includes("BOX_OLD_WORK"));
priced("Drywalled garage panel → 1 staircase up → attic, walked 35 ft", {
  ...done, panelPlace: "garage", garageStuds: "drywall", garageRun: "one", distanceFeet: "35", fullFlights: "1", direction: "up", openSpace: "attic",
});
priced("Drywalled garage panel → same floor, finished walls, 30 ft, 1 doorway", {
  ...done, panelPlace: "garage", garageStuds: "drywall", garageRun: "one", distanceFeet: "30", doorways: "1", openSpace: "neither",
});
const unsureGarage = priced("Garage walls not sure → priced as conduit", {
  ...done, panelPlace: "garage", garageStuds: "unsure", garageRun: "one", distanceFeet: "30", openSpace: "attic",
});
assert.ok(unsureGarage.result.flags.includes("GARAGE_FINISH_UNSURE_PRICED_CONDUIT"));
reviewed("Drywalled garage with an estimated distance", {
  ...done, panelPlace: "garage", garageStuds: "drywall", garageRun: "two", distanceMethod: "estimate", distanceEstimate: "near",
}, "CONDUIT_NEEDS_MEASUREMENT");
// Old home-builder answers that only say "surface conduit" still fail closed.
assert.equal(circuitPackageFor(SLUG, { dedicated_equipment: "fridge_freezer", dedicated_finish_ack: "accepted", dedicated_route_access: "accessible", dedicated_distance: "30", dedicated_surface_conduit: "yes" }), null);
reviewed("Can't find the panel", { ...done, panelPlace: "unsure" }, "PANEL_NOT_FOUND");
reviewed("Garage panel, stairs going down to the basement", {
  ...done, panelPlace: "garage", garageStuds: "open", distanceFeet: "20", fullFlights: "1", direction: "basement",
}, "GARAGE_PANEL_TO_BASEMENT");
reviewed("Garage panel, stairs going down to the outlet", {
  ...done, panelPlace: "garage", garageStuds: "open", distanceFeet: "20", fullFlights: "1", direction: "down",
}, "GARAGE_PANEL_TO_BASEMENT");

// The engine reads stair counts directly and refuses mixed or malformed descriptions.
const stairBase = {
  dedicated_equipment: "fridge_freezer", dedicated_finish_ack: "accepted", dedicated_route_access: "accessible", dedicated_distance: "30",
  dedicated_floor_changes_full: "1", dedicated_floor_changes_half: "0", dedicated_vertical_attic: "yes", dedicated_vertical_from_basement: "no",
};
assert.ok(circuitPackageFor(SLUG, stairBase));
assert.equal(circuitPackageFor(SLUG, { ...stairBase, dedicated_home_stories: "two" }), null, "stair counts plus a home profile fail closed");
assert.equal(circuitPackageFor(SLUG, { ...stairBase, dedicated_floor_changes_full: "4" }), null, "more than three floor changes fail closed");
assert.equal(circuitPackageFor(SLUG, { ...stairBase, dedicated_vertical_from_basement: "yes" }), null, "a basement start needs its panel-end condition");
assert.equal(circuitPackageFor(SLUG, { ...stairBase, dedicated_floor_changes_full: "0" }), null, "stair keys with no floor change are malformed");

// Storefront mode: the route question comes before "What will this power?",
// so route-only answers must be complete without equipment and price as soon
// as the tree adds it (the live Route Walk dead-ended here).
const routeOnlyAnswers: SwAnswers = { wall: "hollow", exterior: "no", finishAck: "accepted", distanceMethod: "feet", panelPlace: "inside", distanceFeet: "30", fullFlights: "1", direction: "up", openSpace: "attic" };
const routeOnly = stairWalkToDedicatedAnswers(routeOnlyAnswers, { routeOnly: true });
assert.equal(routeOnly.kind, "PRICE_INPUTS", "route-only answers are complete without equipment");
if (routeOnly.kind === "PRICE_INPUTS") {
  assert.equal(routeOnly.answers.dedicated_equipment, undefined);
  assert.equal(circuitPackageFor(SLUG, routeOnly.answers), null, "nothing prices before the equipment question");
  const later = circuitPackageFor(SLUG, { ...routeOnly.answers, dedicated_equipment: "microwave" });
  assert.equal(later?.routeFeet, 45, "prices once the tree adds the equipment");
  assert.ok(Object.keys(routeOnly.answers).every((key) => key === "dedicated_route_access" || (STAIR_WALK_ROUTE_ANSWER_KEYS as readonly string[]).includes(key)), "every route-only key survives the flow's replay");
}
assert.ok(!stairWalkScreens({}, { routeOnly: true }).some((screen) => screen.id === "project"));

// Changing to a panel location that cannot use the guided route drops prior access answers.
const pruned = pruneStairWalkAnswers({ ...done, panelPlace: "outside", panelCeiling: "open", distanceFeet: "30", fullFlights: "1", openSpace: "below", belowCoverage: "all" });
assert.equal(pruned.panelCeiling, undefined);
assert.equal(pruned.openSpace, undefined, "an unsupported outside-panel route cannot retain an inferred open space");
const prunedFoundation = pruneStairWalkAnswers({ ...done, panelPlace: "inside", distanceFeet: "30", openSpace: "attic", belowCoverage: "partial", belowPosition: "middle", belowFeet: "12" });
assert.equal(prunedFoundation.belowCoverage, undefined);
assert.equal(prunedFoundation.belowPosition, undefined);
assert.equal(prunedFoundation.belowFeet, undefined);

console.log("stair walk: every priced scenario is accepted by the dedicated-circuit package (stair-count path), the approved tri-level example is unchanged, and unsupported conditions fail closed");
