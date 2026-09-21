import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveReviewedDedicatedCircuitPackage } from "../lib/electrical/dedicatedCircuitReviewPackage";

const eligible = {
  dedicated_equipment: "fridge_freezer",
  dedicated_route_access: "accessible_attic",
  dedicated_distance: "25_to_50",
  dedicated_finish_ack: "review_first",
};

assert.deepEqual(resolveReviewedDedicatedCircuitPackage(eligible), { circuitAmps: 15, cableRole: "WIRE_14_2" });
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_equipment: "bidet" }), { circuitAmps: 15, cableRole: "WIRE_14_2" });
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_equipment: "knows_size", dedicated_amperage: "15a_120v" }), { circuitAmps: 15, cableRole: "WIRE_14_2" });

for (const dedicated_equipment of ["sump_pump", "microwave", "window_ac", "electric_fireplace", "other_equipment", "unsure"]) {
  assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_equipment }), null, `${dedicated_equipment} must remain review-only`);
}
for (const dedicated_amperage of ["20a_120v", "20a_240v", "30a_plus", "unsure"]) {
  assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_equipment: "knows_size", dedicated_amperage }), null, `${dedicated_amperage} must remain review-only`);
}
for (const dedicated_route_access of ["finished_route", "no_accessible_route", "unsure"]) {
  assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_route_access }), null, `${dedicated_route_access} must not use the accessible package`);
}
assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_distance: "over_50" }), null);
assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_finish_ack: undefined }), null);

const aliases = readFileSync("scripts/apply-dedicated-circuit-entry-aliases.ts", "utf8");
assert.ok(aliases.includes('slug: "freezer-fridge-dedicated-circuit"') && aliases.includes('equipmentValue: "fridge_freezer"'));
assert.ok(aliases.includes('slug: "sump-pump-dedicated-circuit"') && aliases.includes('equipmentValue: "sump_pump"'));

console.log("dedicated-circuit package eligibility: direct, bidet and refrigerator/freezer entry paths open for reviewed 15A scope; incomplete 20A/240V and inaccessible scopes fail closed");
