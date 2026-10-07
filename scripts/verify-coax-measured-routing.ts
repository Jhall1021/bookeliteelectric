import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { lowVoltagePackage } from "../lib/electrical/circuitPackagePricing";
import { DOORWAY_DETOUR_FEET } from "../lib/electrical/doorwayRouting";

const guide = readFileSync("components/guided-flow/MeasurementGuide.tsx", "utf8");
const questionStep = readFileSync("components/guided-flow/QuestionStep.tsx", "utf8");
const seed = readFileSync("prisma/seed-low-voltage-and-sconces.ts", "utf8");
const activation = readFileSync("scripts/activate-coax-measured-routing-2026-10-07.ts", "utf8");

assert.ok(guide.includes('"new-coax-line_distance": "coax-route"'));
assert.ok(guide.includes('"new-coax-line_exposed_route_feet": "coax-route"'));
assert.ok(guide.includes("function Router(") && guide.includes("function CoaxWallPlate("));
assert.ok(guide.includes('left: "Router or existing coax source", right: "New coax wall plate"'));
assert.ok(
  questionStep.includes('answers["new-coax-line_route_access"]') &&
    questionStep.includes('measurementAccessClass === "FINISHED"') &&
    questionStep.includes("following the finished walls and ceiling") &&
    questionStep.includes("through the attic, basement, or crawlspace"),
  "coax measurement help must describe the route selected by the customer",
);
assert.ok(!seed.includes("attic, basement, crawlspace, or finished walls"));
assert.ok(!activation.includes("attic, basement, crawlspace, or finished walls"));
assert.ok(seed.includes('value: "measured_route"') && seed.includes('numberAtMost: 75'));
assert.ok(activation.includes('inputType: "NUMBER"') && activation.includes("three routes -> exact feet"));
assert.ok(activation.includes("answerOptionComponent.deleteMany") && activation.includes("templateAnswerOptionComponent.deleteMany"));
assert.ok(seed.includes("if (usesExactCoaxMeasurement)") && seed.includes("answerOptionComponent.deleteMany"));

for (const access of ["accessible", "finished", "exposed_baseboard"] as const) {
  const key = access === "exposed_baseboard" ? "new-coax-line_exposed_route_feet" : "new-coax-line_distance";
  const pkg = lowVoltagePackage("new-coax-line", { "new-coax-line_route_access": access, [key]: "42.5" });
  assert.ok(pkg, `${access} coax route should produce an instant-price package`);
  assert.equal(pkg.routeFeet, 42.5);
  assert.equal(pkg.materialQuantities?.CABLE_RG6, 48.5);
}

const finishedDoorway = lowVoltagePackage("new-coax-line", {
  "new-coax-line_route_access": "finished", "new-coax-line_distance": "20", "new-coax-line_distance_doorway": "yes",
});
assert.equal(finishedDoorway?.routeFeet, 20 + DOORWAY_DETOUR_FEET);
const finishedThreeDoorways = lowVoltagePackage("new-coax-line", {
  "new-coax-line_route_access": "finished", "new-coax-line_distance": "20", "new-coax-line_distance_doorway": "3",
});
assert.equal(finishedThreeDoorways?.routeFeet, 20 + (3 * DOORWAY_DETOUR_FEET));
assert.equal(lowVoltagePackage("new-coax-line", { "new-coax-line_route_access": "accessible", "new-coax-line_distance": "76" }), null);

console.log("COAX MEASURED ROUTING — exact-foot packages and dedicated router-to-wall-plate artwork verified");
