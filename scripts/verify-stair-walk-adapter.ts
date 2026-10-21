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
  ...done, equipment: "microwave", panelPlace: "garage", garageStuds: "open", garageAttic: "no", garageRun: "one", distanceFeet: "54", openSpace: "attic",
});
priced("Garage freezer, panel in the same open garage, 18 ft", {
  ...done, panelPlace: "garage", garageStuds: "open", garageAttic: "no", garageRun: "one", distanceFeet: "18", openSpace: "garage",
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
  ...done, panelPlace: "garage", garageStuds: "open", garageAttic: "no", garageRun: "one", distanceFeet: "20", halfFlights: "2", direction: "up", openSpace: "attic",
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
  ...done, equipment: "microwave", panelPlace: "garage", garageStuds: "drywall", garageAttic: "no", garageRun: "two", distanceFeet: "40", openSpace: "attic",
});
assert.equal(conduitInside.result.answers.dedicated_garage_emt_feet, "28", "24 ft across the garage plus 4 ft up to the ceiling");
assert.equal(conduitInside.pkg.routeFeet, 44, "the walk plus the conduit rise");
assert.equal(conduitInside.pkg.facts.accessibleRouteFeet, 16, "only the cable beyond the conduit is priced as open cable");
assert.ok(conduitInside.pkg.materialRoles.includes("EMT_1_2") && conduitInside.pkg.materialRoles.includes("BOX_OLD_WORK"));
const conduitGarageOutlet = priced("Drywalled garage, freezer in the same garage, 18 ft", {
  ...done, panelPlace: "garage", garageStuds: "drywall", garageAttic: "no", garageRun: "near", distanceFeet: "18", openSpace: "garage",
});
assert.equal(conduitGarageOutlet.pkg.facts.garageEmtFeet, 18);
assert.equal(conduitGarageOutlet.pkg.facts.outletSurfaceBox, true);
assert.ok(conduitGarageOutlet.pkg.materialRoles.includes("BOX_SURFACE_4S") && !conduitGarageOutlet.pkg.materialRoles.includes("BOX_OLD_WORK"));
priced("Drywalled garage panel → 1 staircase up → attic, walked 35 ft", {
  ...done, panelPlace: "garage", garageStuds: "drywall", garageAttic: "no", garageRun: "one", distanceFeet: "35", fullFlights: "1", direction: "up", openSpace: "attic",
});
priced("Drywalled garage panel → same floor, finished walls, 30 ft, 1 doorway", {
  ...done, panelPlace: "garage", garageStuds: "drywall", garageAttic: "no", garageRun: "one", distanceFeet: "30", doorways: "1", openSpace: "neither",
});
const unsureGarage = priced("Garage walls not sure → priced as conduit", {
  ...done, panelPlace: "garage", garageStuds: "unsure", garageAttic: "no", garageRun: "one", distanceFeet: "30", openSpace: "attic",
});
assert.ok(unsureGarage.result.flags.includes("GARAGE_FINISH_UNSURE_PRICED_CONDUIT"));
reviewed("Drywalled garage with an estimated distance", {
  ...done, panelPlace: "garage", garageStuds: "drywall", garageAttic: "no", garageRun: "two", distanceMethod: "estimate", distanceEstimate: "near",
}, "CONDUIT_NEEDS_MEASUREMENT");
// Old home-builder answers that only say "surface conduit" still fail closed.
assert.equal(circuitPackageFor(SLUG, { dedicated_equipment: "fridge_freezer", dedicated_finish_ack: "accepted", dedicated_route_access: "accessible", dedicated_distance: "30", dedicated_surface_conduit: "yes" }), null);
reviewed("Can't find the panel", { ...done, panelPlace: "unsure" }, "PANEL_NOT_FOUND");
reviewed("Garage panel, stairs going down to the basement", {
  ...done, panelPlace: "garage", garageStuds: "open", garageAttic: "no", garageRun: "one", distanceFeet: "20", fullFlights: "1", direction: "basement",
}, "GARAGE_PANEL_TO_BASEMENT");
reviewed("Garage panel, stairs going down to the outlet", {
  ...done, panelPlace: "garage", garageStuds: "open", garageAttic: "no", garageRun: "one", distanceFeet: "20", fullFlights: "1", direction: "down",
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

// The owner's field scenarios (21 Oct 2026). Each asserts the field condition
// the questions must capture, not just that something prices.
const field = (name: string, answers: SwAnswers) => priced(name, { ...answers, finishAck: "accepted" });
// 1. Garage panel, garage attic, two-story house, outlet in a second-floor bedroom with attic above.
const f1 = field("Field 1: garage panel + garage attic → 2nd-floor bedroom via attic", {
  ...done, equipment: "microwave", panelPlace: "garage", garageStuds: "open", garageAttic: "yes", garageRun: "two", distanceFeet: "45", fullFlights: "1", direction: "up", openSpace: "attic",
});
assert.equal(f1.pkg.facts.multiStoryRiserTransitions, 1, "one floor change from the garage level to the bedroom level");
const f1b = field("Field 1b: same, garage walls drywalled", {
  ...done, equipment: "microwave", panelPlace: "garage", garageStuds: "drywall", garageAttic: "yes", garageRun: "two", distanceFeet: "45", fullFlights: "1", direction: "up", openSpace: "attic",
});
assert.equal(f1b.pkg.facts.garageEmtFeet, 4, "with a garage attic the conduit is only the rise into the attic, not across the garage wall");
// 2. Same garage, outlet in a first-floor living room with living space above.
const f2 = field("Field 2: garage panel + garage attic → 1st-floor living room, finished above", {
  ...done, equipment: "microwave", panelPlace: "garage", garageStuds: "open", garageAttic: "yes", garageRun: "two", distanceFeet: "35", doorways: "1", openSpace: "neither",
});
assert.equal(f2.pkg.facts.accessibleRouteFeet, 24, "the garage stretch is open");
assert.equal(f2.pkg.facts.concealedRouteFeet, 11 + 14, "only the house part (plus its doorway) is fished through finished walls");
const f2b = field("Field 2b: same, garage walls drywalled", {
  ...done, equipment: "microwave", panelPlace: "garage", garageStuds: "drywall", garageAttic: "yes", garageRun: "two", distanceFeet: "35", doorways: "1", openSpace: "neither",
});
assert.equal(f2b.pkg.facts.garageEmtFeet, 4);
assert.equal(f2b.pkg.facts.accessibleRouteFeet, 24, "28 ft open garage stretch minus the 4 ft rise in conduit");
// 3. Basement panel with an open ceiling and a first-floor bedroom directly above.
// The direct-basement shortcut replaces the walked route and all later questions.
const f3 = field("Field 3: basement panel → first-floor bedroom directly above", {
  ...done, panelPlace: "basement", panelCeiling: "open", outletOverBasement: "over", directDistanceMethod: "feet", directDistanceFeet: "50",
});
assert.equal(f3.pkg.facts.multiStoryRiserTransitions, 0, "the bedroom sits over the basement; the wire comes up through its floor");
assert.equal(f3.pkg.facts.accessibleRouteFeet, 50);
// 4. Split level: panel in the laundry six steps down from the entry, outlet six steps up in a top-floor bedroom with attic.
const f4 = field("Field 4: split-level laundry panel → 2 half-flights up → attic", {
  ...done, equipment: "microwave", panelPlace: "inside", distanceFeet: "40", halfFlights: "2", direction: "up", openSpace: "attic",
});
assert.equal(f4.pkg.facts.multiStoryRiserTransitions, 2);
// 5. Split level: basement panel, outlet six steps up on the slab-on-grade level beside the basement.
const f5 = field("Field 5: basement panel → half-flight up to a slab level beside it", {
  ...done, equipment: "microwave", panelPlace: "basement", panelCeiling: "open", distanceFeet: "30", halfFlights: "1", outletOverBasement: "beside", openSpace: "below", belowCoverage: "partial", belowPosition: "panel", belowFeet: "15",
});
assert.equal(f5.pkg.facts.multiStoryRiserTransitions, 1, "a room beside the basement is a half-level climb, not a basement-ceiling pop-up");
const f5over = field("Field 5 contrast: half-flight up into a room over the basement", {
  ...done, equipment: "microwave", panelPlace: "basement", panelCeiling: "open", distanceFeet: "30", halfFlights: "1", outletOverBasement: "over", directDistanceMethod: "feet", directDistanceFeet: "8", openSpace: "below", belowCoverage: "all",
});
assert.equal(f5over.pkg.facts.multiStoryRiserTransitions, 0);
const f5unsure = stairWalkToDedicatedAnswers({ ...done, panelPlace: "basement", panelCeiling: "open", distanceFeet: "30", halfFlights: "1", outletOverBasement: "unsure", openSpace: "neither" });
assert.ok(f5unsure.kind === "PRICE_INPUTS" && f5unsure.flags.includes("BASEMENT_OVERLAP_UNSURE_PRICED_BESIDE"), "not sure is priced as the harder, beside case");
// Panel-location questions stay with their panel location.
for (const panelPlace of ["basement", "inside"] as const) {
  const keys = stairWalkScreens({ panelPlace }, { routeOnly: true }).flatMap((screen) => screen.fields.map((f) => f.key));
  assert.ok(!keys.includes("garageAttic") && !keys.includes("garageRun") && !keys.includes("garageStuds"), `${panelPlace} panels never see garage questions`);
}
for (const panelPlace of ["garage", "inside"] as const) {
  const keys = stairWalkScreens({ panelPlace, halfFlights: "1", direction: "up" }, { routeOnly: true }).flatMap((screen) => screen.fields.map((f) => f.key));
  assert.ok(!keys.includes("outletOverBasement") && !keys.includes("panelCeiling"), `${panelPlace} panels never see basement questions`);
}
// After walking up from an inside or garage panel, a basement under the outlet can't be offered.
const upOptions = stairWalkScreens({ panelPlace: "inside", distanceMethod: "feet", distanceFeet: "30", fullFlights: "1", direction: "up" }, { routeOnly: true }).find((screen) => screen.id === "space")?.fields[0];
assert.ok(upOptions?.kind === "choice" && !upOptions.options.some((option) => option.value === "below"));

// A single short climb in a split-level can put the raised section over a
// crawlspace. That is different from offering a basement after a full-story
// climb, which remains impossible above.
const halfUpOptions = stairWalkScreens({ panelPlace: "inside", distanceMethod: "feet", distanceFeet: "30", halfFlights: "1", direction: "up" }, { routeOnly: true }).find((screen) => screen.id === "space")?.fields[0];
assert.ok(halfUpOptions?.kind === "choice");
const raisedCrawlspace = halfUpOptions.options.find((option) => option.value === "below");
assert.match(`${raisedCrawlspace?.label} ${raisedCrawlspace?.detail}`, /crawlspace/i);
assert.doesNotMatch(`${raisedCrawlspace?.label}`, /basement/i);

const garagePanel = stairWalkScreens({ panelPlace: "garage" }, { routeOnly: true }).find((screen) => screen.id === "panel");
const garageAttic = garagePanel?.fields.find((field) => field.key === "garageAttic");
assert.ok(garageAttic?.kind === "choice");
assert.match(garageAttic.label ?? "", /accessible attic space above the garage/i);
assert.match(garageAttic.label ?? "", /toward the house/i);

// A finished basement ceiling must not read as open access to a customer whose panel is upstairs.
const belowForInside = stairWalkScreens({ panelPlace: "inside", distanceMethod: "feet", distanceFeet: "40" }, { routeOnly: true })
  .find((screen) => screen.id === "space")?.fields[0];
assert.ok(belowForInside?.kind === "choice");
const belowOption = belowForInside.options.find((option) => option.value === "below");
assert.match(`${belowOption?.label} ${belowOption?.detail}`, /open/i);
assert.match(`${belowOption?.detail}`, /painted basement ceiling doesn’t count/);

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
