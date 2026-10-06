import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { resolveReviewedDedicatedCircuitPackage } from "../lib/electrical/dedicatedCircuitReviewPackage";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";

const eligible = {
  dedicated_equipment: "fridge_freezer",
  dedicated_route_access: "accessible",
  dedicated_distance: "25_to_50",
  dedicated_finish_ack: "review_first",
};

const fifteenAmpPackage = { circuitAmps: 15, cableRole: "WIRE_14_2", breakerRole: "BREAKER_SINGLE_POLE_15A", receptacleRole: "RECEPTACLE_STANDARD", requiresSumpPumpProtectionConfirmation: false };
assert.deepEqual(resolveReviewedDedicatedCircuitPackage(eligible), fifteenAmpPackage);
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_distance: "17.5" }), fifteenAmpPackage, "exact measured feet are eligible inside the bounded package");
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_route_access: "accessible_attic" }), fifteenAmpPackage, "legacy accessible answers remain price-compatible");
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_route_access: "finished" }), fifteenAmpPackage, "bounded finished-wall answers use the same confirmed circuit configuration");
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_route_access: "finished_route" }), fifteenAmpPackage, "legacy finished-wall answers remain price-compatible");
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_route_access: "no_accessible_route" }), fifteenAmpPackage, "legacy no-access answers remain price-compatible");
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_equipment: "bidet" }), fifteenAmpPackage);
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_equipment: "knows_size", dedicated_amperage: "15a_120v" }), fifteenAmpPackage);
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_equipment: "sump_pump" }), {
  circuitAmps: 20,
  cableRole: "WIRE_12_2",
  breakerRole: "BREAKER_SINGLE_POLE_20A",
  receptacleRole: "GFCI_INTERIOR_20A",
  requiresSumpPumpProtectionConfirmation: true,
});
const approvedOperations = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => ({ operationKey: operation.key, hoursPerUnit: 0.25, source: "DIRECT" as const }));
const sumpLabor = projectElectricalServiceLabor("sump-pump-dedicated-circuit", approvedOperations, {
  accessibleRoute: true,
  finishedRoute: false,
  accessibleRouteFeet: 25,
  nmCableSupportCount: 7,
  panelCapacityConfirmed: true,
  sumpPumpProtectionConfirmed: true,
});
assert.equal(sumpLabor.kind, "READY_FOR_APPROVAL");
assert.equal(sumpLabor.recipeKey, "ELECTRICAL_SUMP_PUMP_DEDICATED_20A");
assert.ok(sumpLabor.kind === "READY_FOR_APPROVAL" && sumpLabor.projection.lines.some((line) => line.operationKey === "ELEC_INSTALL_NEW_GFCI_RECEPTACLE"));

for (const dedicated_equipment of ["microwave", "window_ac", "electric_fireplace", "other_equipment", "unsure"]) {
  assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_equipment }), null, `${dedicated_equipment} must remain review-only`);
}
for (const dedicated_amperage of ["20a_120v", "20a_240v", "30a_plus", "unsure"]) {
  assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_equipment: "knows_size", dedicated_amperage }), null, `${dedicated_amperage} must remain review-only`);
}
for (const dedicated_route_access of ["unsure"]) {
  assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_route_access }), null, `${dedicated_route_access} must remain outside the confirmed package`);
}
assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_distance: "over_50" }), null);
assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_distance: "50.5" }), null);
assert.equal(resolveReviewedDedicatedCircuitPackage({ ...eligible, dedicated_finish_ack: undefined }), null);

const aliases = readFileSync("scripts/apply-dedicated-circuit-entry-aliases.ts", "utf8");
assert.ok(aliases.includes('slug: "freezer-fridge-dedicated-circuit"') && aliases.includes('equipmentValue: "fridge_freezer"'));
assert.ok(aliases.includes('slug: "sump-pump-dedicated-circuit"') && aliases.includes('equipmentValue: "sump_pump"'));

console.log("dedicated-circuit package eligibility: bounded accessible and finished-wall 15A paths plus the reviewed sump-pump 20A/GFCI path open; other 20A/240V and uncertain scopes fail closed");
