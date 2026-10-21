import assert from "node:assert/strict";

import { stairWalkDiagramModel } from "../lib/electrical/stairWalkDiagram";
import { stairWalkToDedicatedAnswers, type SwAnswers } from "../lib/electrical/stairWalk";
import { DEDICATED_STAIR_ROUTE_KEYS } from "../lib/electrical/dedicatedStairRoute";

const screenshotScenario: SwAnswers = {
  panelPlace: "basement",
  panelCeiling: "open",
  distanceMethod: "feet",
  distanceFeet: "12",
  doorways: "0",
  fullFlights: "0",
  halfFlights: "1",
  outletOverBasement: "beside",
  openSpace: "attic",
  wall: "hollow",
  exterior: "no",
};

const screenshot = stairWalkDiagramModel(screenshotScenario);
assert.equal(screenshot.panelLevel, 0, "the panel starts in the basement");
assert.equal(screenshot.outletLevel, 1, "the half-flight places the outlet on the adjacent level");
assert.equal(screenshot.floorChanges, 1, "a room beside the basement keeps its priced level change");
assert.equal(screenshot.plane, "attic");
assert.equal(screenshot.measurementLabel, "12 ft measured");
assert.match(screenshot.description, /through the attic, then down/i);

const directlyOverBasement = stairWalkDiagramModel({
  ...screenshotScenario,
  outletOverBasement: "over",
  openSpace: "below",
});
assert.equal(directlyOverBasement.panelLevel, 0);
assert.equal(directlyOverBasement.outletLevel, 1);
assert.equal(directlyOverBasement.floorChanges, 0, "coming through the floor is not priced as a riser");
assert.equal(directlyOverBasement.routeLabel, "Along the open basement ceiling");

const turningStaircaseAboveBasement = stairWalkDiagramModel({
  ...screenshotScenario,
  fullFlights: "1",
  halfFlights: "0",
  outletOverBasement: undefined,
  openSpace: "below",
});
assert.equal(turningStaircaseAboveBasement.panelLevel, 0);
assert.equal(turningStaircaseAboveBasement.outletLevel, 1, "two six-step runs with a turning landing are one full staircase");
assert.equal(turningStaircaseAboveBasement.floorChanges, 0, "the outlet directly above the basement comes through the floor");

const foyerBetweenHalfFlights: SwAnswers = {
  ...screenshotScenario,
  fullFlights: "0",
  halfFlights: "2",
  outletOverBasement: "over",
  directDistanceMethod: "near",
  openSpace: "below",
  belowCoverage: "all",
  finishAck: "accepted",
};
const foyerDiagram = stairWalkDiagramModel(foyerBetweenHalfFlights);
assert.equal(foyerDiagram.splitFoyerBetween, true, "the drawing uses the foyer-offset split-level section");
assert.equal(foyerDiagram.panelLevel, 0);
assert.equal(foyerDiagram.outletLevel, 1, "the middle level directly above the basement is one physical story higher");
assert.equal(foyerDiagram.floorChanges, 0, "an open basement ceiling reaches the outlet directly instead of following both foyer flights");
assert.equal(foyerDiagram.measurementLabel, "5 ft direct wire distance");
const foyerBelowResult = stairWalkToDedicatedAnswers(foyerBetweenHalfFlights, { routeOnly: true });
assert.equal(foyerBelowResult.kind, "PRICE_INPUTS");

const foyerAtticResult = stairWalkToDedicatedAnswers({ ...foyerBetweenHalfFlights, openSpace: "attic", belowCoverage: undefined }, { routeOnly: true });
assert.equal(foyerAtticResult.kind, "PRICE_INPUTS");
if (foyerAtticResult.kind === "PRICE_INPUTS") {
  assert.equal(foyerAtticResult.answers[DEDICATED_STAIR_ROUTE_KEYS.fullFlights], "1", "the wire gets one full-story transition");
  assert.equal(foyerAtticResult.answers[DEDICATED_STAIR_ROUTE_KEYS.halfFlights], "0", "the wire does not follow the two foyer half-flights");
  assert.equal(foyerAtticResult.facts.find((fact) => fact.label === "Short half-flights")?.value, "2", "the review preserves what the customer walked");
}

const doubledBackWalk: SwAnswers = {
  panelPlace: "basement",
  panelCeiling: "open",
  distanceMethod: "steps",
  distanceSteps: "40",
  doorways: "1",
  fullFlights: "0",
  halfFlights: "2",
  outletOverBasement: "over",
  directDistanceMethod: "near",
  openSpace: "below",
  belowCoverage: "all",
  wall: "hollow",
  exterior: "no",
  finishAck: "accepted",
};
const doubledBackResult = stairWalkToDedicatedAnswers(doubledBackWalk, { routeOnly: true });
assert.equal(doubledBackResult.kind, "PRICE_INPUTS");
if (doubledBackResult.kind === "PRICE_INPUTS") {
  assert.equal(doubledBackResult.answers.dedicated_distance, "5", "the 100 ft doubled-back walk prices the direct ceiling projection");
  assert.match(doubledBackResult.inferred.find((item) => item.label === "Distance used for wire")?.value ?? "", /5 ft instead of 100 ft/);
}

const partialCrawlspace = stairWalkDiagramModel({
  panelPlace: "inside",
  distanceMethod: "feet",
  distanceFeet: "40",
  fullFlights: "0",
  halfFlights: "0",
  doorways: "1",
  openSpace: "below",
  belowCoverage: "partial",
  belowPosition: "outlet",
  belowFeet: "10",
  wall: "hollow",
  exterior: "no",
});
assert.deepEqual(partialCrawlspace.partialOpen, { position: "outlet", ratio: 0.25 });

const steppedDistance = stairWalkDiagramModel({
  panelPlace: "inside",
  distanceMethod: "steps",
  distanceSteps: "7",
  fullFlights: "0",
  halfFlights: "0",
  doorways: "0",
  openSpace: "neither",
  wall: "hollow",
  exterior: "yes",
});
assert.equal(steppedDistance.measurementLabel, "18 ft from your steps");
assert.equal(steppedDistance.outletLabel, "New outlet · outside wall");

console.log("Stair Walk confirmation diagram checks passed.");
