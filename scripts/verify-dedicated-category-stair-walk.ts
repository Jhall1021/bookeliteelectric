import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  isDedicatedCategoryStairWalkQuestion,
  stairWalkToDedicatedCategoryAnswers,
} from "../lib/electrical/dedicatedCategoryStairWalk";
import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import type { SwAnswers } from "../lib/electrical/stairWalk";

const accessible: SwAnswers = {
  panelPlace: "basement",
  panelCeiling: "open",
  outletOverBasement: "over",
  directDistanceMethod: "feet",
  directDistanceFeet: "20",
  distanceMethod: "feet",
  distanceFeet: "20",
  fullFlights: "0",
  halfFlights: "0",
  doorways: "0",
  openSpace: "below",
  belowCoverage: "all",
  wall: "hollow",
  exterior: "no",
  finishAck: "accepted",
};

assert.equal(isDedicatedCategoryStairWalkQuestion("electric-fireplace-circuit", "fireplace_route_access"), true);
assert.equal(isDedicatedCategoryStairWalkQuestion("new-240v-appliance-circuit", "appliance_240v_route_access"), true);
assert.equal(isDedicatedCategoryStairWalkQuestion("new-ethernet-line", "new-ethernet-line_route_access"), false);

const fireplace = stairWalkToDedicatedCategoryAnswers(accessible, "electric-fireplace-circuit");
assert.equal(fireplace.kind, "PRICE_INPUTS");
if (fireplace.kind !== "PRICE_INPUTS") throw new Error("expected fireplace price inputs");
assert.equal(fireplace.answers.fireplace_route_access, "unfinished_basement");
assert.equal(fireplace.answers.fireplace_distance, "under_25");
assert.ok(circuitPackageFor("electric-fireplace-circuit", {
  fireplace_connection: "standard_plug",
  fireplace_amperage: "15a",
  fireplace_wall: "ordinary_drywall",
  ...fireplace.answers,
}));

const appliance = stairWalkToDedicatedCategoryAnswers({ ...accessible, directDistanceFeet: "35", distanceFeet: "35" }, "new-240v-appliance-circuit");
assert.equal(appliance.kind, "PRICE_INPUTS");
if (appliance.kind !== "PRICE_INPUTS") throw new Error("expected appliance price inputs");
assert.equal(appliance.answers.appliance_240v_route_access, "unfinished_basement");
assert.equal(appliance.answers.appliance_240v_distance, "25_to_50");
assert.ok(circuitPackageFor("new-240v-appliance-circuit", {
  appliance_240v_type: "dryer",
  appliance_240v_connection: "four_prong_plug",
  appliance_240v_endpoint: "surface_box",
  ...appliance.answers,
}));

for (const slug of ["electric-fireplace-circuit", "new-240v-appliance-circuit"] as const) {
  const finished = stairWalkToDedicatedCategoryAnswers({
    ...accessible,
    panelPlace: "inside",
    outletOverBasement: undefined,
    directDistanceMethod: undefined,
    directDistanceFeet: undefined,
    openSpace: "neither",
  }, slug);
  assert.equal(finished.kind, "PRICE_INPUTS");
  if (finished.kind !== "PRICE_INPUTS") throw new Error("expected review mapping");
  assert.equal(finished.answers[slug === "electric-fireplace-circuit" ? "fireplace_route_access" : "appliance_240v_route_access"], "not_accessible_or_unsure");
  assert.ok(finished.flags.includes("ROUTE_REQUIRES_REVIEW"));

  const upstairs = stairWalkToDedicatedCategoryAnswers({
    ...accessible,
    outletOverBasement: "beside",
    directDistanceMethod: undefined,
    directDistanceFeet: undefined,
    fullFlights: "1",
    direction: "up",
    openSpace: "attic",
  }, slug);
  assert.equal(upstairs.kind, "PRICE_INPUTS");
  if (upstairs.kind !== "PRICE_INPUTS") throw new Error("expected multi-floor review mapping");
  assert.ok(upstairs.flags.includes("ROUTE_REQUIRES_REVIEW"), `${slug} must not omit unpriced riser work`);
}

const questionStep = readFileSync("components/guided-flow/QuestionStep.tsx", "utf8");
assert.match(questionStep, /isDedicatedCategoryStairWalkQuestion\(serviceSlug, question\.key\)/);

const fixture = readFileSync("app/dev-fixtures/stair-walk-confirmation/StairWalkConfirmationFixture.tsx", "utf8");
assert.match(fixture, /electric-fireplace-circuit/);
assert.match(fixture, /new-240v-appliance-circuit/);
assert.match(fixture, /not_accessible_or_unsure/);

console.log("dedicated category Stair Walk: fireplace and dryer/range mappings preserve pricing and review boundaries");
