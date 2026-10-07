import assert from "node:assert/strict";

import { circuitPackageFor, lowVoltagePackage } from "../lib/electrical/circuitPackagePricing";
import { routeSectionsAnswerKey } from "../lib/electrical/mixedRouteSections";

const sections = JSON.stringify([
  { id: 1, feet: 12, access: "accessible", doorways: 3 },
  { id: 2, feet: 8, access: "finished", doorways: 1 },
]);

const dedicated = circuitPackageFor("dedicated-120v-circuit-outlet", {
  dedicated_equipment: "fridge_freezer",
  dedicated_route_access: "accessible",
  dedicated_distance: "20",
  dedicated_finish_ack: "accepted",
  [routeSectionsAnswerKey("dedicated_distance")]: sections,
});
assert.ok(dedicated);
assert.equal(dedicated.routeFeet, 34);
assert.equal(dedicated.facts.accessibleRouteFeet, 12);
assert.equal(dedicated.facts.concealedRouteFeet, 22);
assert.equal(dedicated.facts.finishedRoute, true);
assert.match(dedicated.description, /mixed open-access and finished-wall/);

const coax = lowVoltagePackage("new-coax-line", {
  "new-coax-line_route_access": "accessible",
  "new-coax-line_distance": "20",
  [routeSectionsAnswerKey("new-coax-line_distance")]: sections,
});
assert.ok(coax);
assert.equal(coax.routeFeet, 34);
assert.equal(coax.facts.accessibleRouteFeet, 12);
assert.equal(coax.facts.concealedRouteFeet, 22);

const accessibleOnly = JSON.stringify([{ id: 1, feet: 20, access: "accessible", doorways: 4 }]);
const ethernet = lowVoltagePackage("new-ethernet-line", {
  "new-ethernet-line_route_access": "finished",
  "new-ethernet-line_distance": "20",
  [routeSectionsAnswerKey("new-ethernet-line_distance")]: accessibleOnly,
});
assert.equal(ethernet?.routeFeet, 20, "doorways on open-access sections are ignored");
assert.equal(ethernet?.facts.finishedRoute, false);

console.log("mixed route sections: accessible and finished footage price independently; doorways apply only to finished sections");
