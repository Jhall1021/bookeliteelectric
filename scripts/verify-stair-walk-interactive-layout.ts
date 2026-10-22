import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  stairWalkRouteFeet,
  stairWalkScreens,
  stairWalkToDedicatedAnswers,
  type SwAnswers,
} from "../lib/electrical/stairWalk";

const multiLevel: SwAnswers = {
  panelPlace: "inside",
  fullFlights: "1",
  halfFlights: "0",
  direction: "up",
  openSpace: "attic",
  distanceMethod: "feet",
  distanceFeet: "32",
  doorways: "1",
  wall: "hollow",
  exterior: "no",
};

const screenIds = stairWalkScreens(multiLevel, { routeOnly: true }).map((screen) => screen.id);
assert.deepEqual(screenIds, ["panel", "stairs", "space", "measure", "wall", "confirm"]);
assert.ok(screenIds.indexOf("stairs") < screenIds.indexOf("measure"), "levels are established before measurement");
assert.ok(screenIds.indexOf("space") < screenIds.indexOf("measure"), "the access plane is established before the sketch");

const measure = stairWalkScreens(multiLevel, { routeOnly: true }).find((screen) => screen.id === "measure");
assert.ok(measure);
assert.deepEqual(measure.fields.map((field) => field.kind), ["distance", "stepper"]);

const moved: SwAnswers = { ...multiLevel, panelPosition: "520", outletPosition: "110" };
assert.equal(stairWalkRouteFeet(moved), stairWalkRouteFeet(multiLevel), "dragging changes the drawing, never priced footage");
assert.deepEqual(stairWalkToDedicatedAnswers(moved, { routeOnly: true }), stairWalkToDedicatedAnswers(multiLevel, { routeOnly: true }));

const directlyAbove: SwAnswers = {
  panelPlace: "basement",
  panelCeiling: "open",
  outletOverBasement: "over",
  directDistanceMethod: "steps",
  directDistanceSteps: "4",
};
const directScreens = stairWalkScreens(directlyAbove, { routeOnly: true });
assert.deepEqual(directScreens.map((screen) => screen.id), ["panel", "projection", "measure", "confirm"]);
assert.equal(directScreens.find((screen) => screen.id === "measure")?.fields[0]?.kind, "directDistance");
assert.equal(stairWalkRouteFeet(directlyAbove), 10);

const component = readFileSync("components/guided-flow/StairWalkRouteDiagram.tsx", "utf8");
assert.match(component, /role=\{interactive \? "slider" : undefined\}/);
assert.match(component, /MEASURE THIS BLUE SECTION/);
assert.match(component, /Their height is already set from the stairs you counted/);
assert.match(component, /is already placed directly above the basement/);

console.log("Stair Walk interactive layout: question order, split-level shortcut, accessible dragging, and pricing isolation verified");
