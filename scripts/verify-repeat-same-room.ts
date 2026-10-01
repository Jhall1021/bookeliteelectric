import assert from "node:assert/strict";
import { buildRepeatLocationAnswers, repeatLocationUI } from "../lib/repeatLocation";

const input = (overrides: Partial<Parameters<typeof buildRepeatLocationAnswers>[0]["input"]> = {}) => ({
  parentLineItemId: "line-1",
  distanceFeet: 12,
  ...overrides,
});

const accessibleOutlet = buildRepeatLocationAnswers({
  serviceSlug: "new-120v-outlet",
  parentAnswers: {
    outlet_load_type: "everyday",
    outlet_power_source: "tap_existing",
    accessible_route_feet: "20",
  },
  input: input(),
});
assert.equal(accessibleOutlet.ok, true);
if (accessibleOutlet.ok) {
  assert.equal(accessibleOutlet.answers.accessible_route_feet, "12");
  assert.equal(accessibleOutlet.answers.outlet_load_type, "everyday");
  assert.equal(accessibleOutlet.ui.askDoorway, false);
}

const finishedOutlet = buildRepeatLocationAnswers({
  serviceSlug: "new-120v-outlet",
  parentAnswers: { concealed_route_feet: "8", concealed_route_obstacles: "clear" },
  input: input({ doorway: true }),
});
assert.equal(finishedOutlet.ok, true);
if (finishedOutlet.ok) {
  assert.equal(finishedOutlet.answers.concealed_route_feet, "12");
  assert.equal(finishedOutlet.answers.concealed_route_obstacles, "doorway");
  assert.equal(finishedOutlet.answers.concealed_route_feet_doorway, "yes");
}

const surfaceLight = buildRepeatLocationAnswers({
  serviceSlug: "surface-mounted-fixture-box",
  parentAnswers: {
    surface_route_feet: "10",
    surface_route_same_wall: "yes",
    surface_route_door_between: "no",
    surface_mounting_surface: "drywall",
    surface_route_obstacles: "clear",
  },
  input: input({ doorway: true, turnsOntoAnotherWall: true }),
});
assert.equal(surfaceLight.ok, true);
if (surfaceLight.ok) {
  assert.equal(surfaceLight.answers.surface_route_feet, "12");
  assert.equal(surfaceLight.answers.surface_route_door_between, "yes");
  assert.equal(surfaceLight.answers.surface_route_same_wall, "no");
  assert.equal(surfaceLight.answers.surface_mounting_surface, "drywall");
}

const sconce = buildRepeatLocationAnswers({
  serviceSlug: "new-wall-sconce",
  parentAnswers: {
    extension_control: "new_switch",
    extension_power_to_switch_feet: "6",
    extension_switch_to_fixture_feet: "9",
    extension_route_access: "finished",
    extension_route_surface: "drywall",
    extension_route_clear: "clear",
    fixture_height: "under_10",
  },
  input: input({ doorway: true }),
});
assert.equal(sconce.ok, true);
if (sconce.ok) {
  assert.equal(sconce.answers.extension_control, "existing_fixture");
  assert.equal(sconce.answers.extension_existing_fixture_feet, "12");
  assert.equal(sconce.answers.extension_existing_fixture_feet_doorway, "yes");
  assert.equal(sconce.answers.extension_power_to_switch_feet, undefined);
  assert.equal(sconce.answers.extension_switch_to_fixture_feet, undefined);
}

const fanParent = {
  accessible_route_feet: "18",
  lighting_control: "switched_outlet",
  fixture_height: "under_10",
};
assert.equal(repeatLocationUI("new-ceiling-fan", fanParent)?.requireSameControl, true);
assert.equal(buildRepeatLocationAnswers({
  serviceSlug: "new-ceiling-fan",
  parentAnswers: fanParent,
  input: input({ sameControl: false }),
}).ok, false);
const fan = buildRepeatLocationAnswers({
  serviceSlug: "new-ceiling-fan",
  parentAnswers: fanParent,
  input: input({ sameControl: true }),
});
assert.equal(fan.ok, true);
if (fan.ok) {
  assert.equal(fan.answers.accessible_route_feet, "12");
  assert.equal(fan.answers.lighting_control, "pull_chains");
  assert.equal(fan.answers._repeat_shared_control, "yes");
}

assert.equal(repeatLocationUI("replace-standard-outlet", { accessible_route_feet: "10" }), null);
assert.equal(buildRepeatLocationAnswers({
  serviceSlug: "new-120v-outlet",
  parentAnswers: { accessible_route_feet: "10" },
  input: input({ distanceFeet: 301 }),
}).ok, false);

console.log("same-room repeat location: PASS");
