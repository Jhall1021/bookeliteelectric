import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { lowVoltagePackage } from "../lib/electrical/circuitPackagePricing";
import { stairWalkToLowVoltageAnswers, type LowVoltageStairWalkSlug } from "../lib/electrical/lowVoltageStairWalk";
import { stairWalkScreens, type SwAnswers } from "../lib/electrical/stairWalk";
import { routeSectionsAnswerKey } from "../lib/electrical/mixedRouteSections";

const complete = (answers: SwAnswers, slug: LowVoltageStairWalkSlug) => {
  const result = stairWalkToLowVoltageAnswers({ ...answers, finishAck: "accepted" }, slug);
  assert.equal(result.kind, "PRICE_INPUTS");
  if (result.kind !== "PRICE_INPUTS") throw new Error("expected mapped price inputs");
  return result;
};

const directlyAbove: SwAnswers = {
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
};

for (const slug of ["new-ethernet-line", "new-coax-line"] as const) {
  const result = complete(directlyAbove, slug);
  assert.deepEqual(stairWalkScreens(directlyAbove, { routeOnly: true, routeKind: slug === "new-ethernet-line" ? "ethernet" : "coax" }).map((screen) => screen.id), ["panel", "projection", "confirm"]);
  assert.equal(result.answers[`${slug}_route_access`], "accessible");
  assert.equal(result.answers[`${slug}_distance`], "5", `${slug} uses the direct ceiling projection, not the 100 ft walk`);
  const priced = lowVoltagePackage(slug, result.answers);
  assert.equal(priced?.routeFeet, 5);
}

const visibleBaseboard: SwAnswers = {
  panelPlace: "inside",
  distanceMethod: "feet",
  distanceFeet: "20",
  doorways: "0",
  fullFlights: "0",
  halfFlights: "0",
  openSpace: "surface",
  wall: "hollow",
  exterior: "no",
};
for (const slug of ["new-ethernet-line", "new-coax-line"] as const) {
  const result = complete(visibleBaseboard, slug);
  assert.equal(result.answers[`${slug}_route_access`], "exposed_baseboard");
  assert.equal(result.answers[`${slug}_exposed_route_feet`], "20");
  assert.equal(lowVoltagePackage(slug, result.answers)?.facts.exposedLowVoltageRoute, true);
}

const finishedRoute: SwAnswers = {
  panelPlace: "inside",
  distanceMethod: "feet",
  distanceFeet: "35",
  doorways: "1",
  fullFlights: "0",
  halfFlights: "0",
  openSpace: "neither",
  wall: "hollow",
  exterior: "no",
};
for (const slug of ["new-ethernet-line", "new-coax-line"] as const) {
  const result = complete(finishedRoute, slug);
  assert.equal(result.answers[`${slug}_route_access`], "finished");
  assert.equal(result.answers[`${slug}_distance`], "35");
  assert.equal(result.answers[`${slug}_distance_doorway`], "1");
  assert.equal(lowVoltagePackage(slug, result.answers)?.routeFeet, 49);
}

const partialOpen = complete({
  ...finishedRoute,
  distanceFeet: "40",
  openSpace: "below",
  belowCoverage: "partial",
  belowPosition: "outlet",
  belowFeet: "10",
}, "new-ethernet-line");
assert.match(partialOpen.answers[routeSectionsAnswerKey("new-ethernet-line_distance")] ?? "", /accessible/);
assert.equal(lowVoltagePackage("new-ethernet-line", partialOpen.answers)?.routeFeet, 54);

const tooLong = stairWalkToLowVoltageAnswers({ ...finishedRoute, distanceFeet: "70", finishAck: "accepted" }, "new-coax-line");
assert.equal(tooLong.kind, "REVIEW", "the doorway detour takes the route beyond the 75 ft automatic-pricing limit");

const diagramSource = readFileSync("components/guided-flow/StairWalkRouteDiagram.tsx", "utf8");
assert.match(diagramSource, /kind === "coax"/);
assert.match(diagramSource, /kind === "ethernet"/);
assert.match(diagramSource, /<DestinationDevice x=\{outletX\} y=\{outletY\}/);

console.log("low-voltage Stair Walk: Ethernet and coax exact, projected, finished, baseboard, and mixed-access routes verified");
