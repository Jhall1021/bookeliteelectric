import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { resolveReviewedDedicatedCircuitPackage } from "../lib/electrical/dedicatedCircuitReviewPackage";

const seed = readFileSync("prisma/seed-questions.ts", "utf8");
assert.ok(seed.includes("seedBidetDedicatedCircuitEntry"));
assert.ok(seed.includes('key: "dedicated_equipment"'));
assert.ok(seed.includes('value: "bidet"'));
assert.ok(seed.includes('routeAction: "REROUTE_SERVICE"'));
assert.ok(seed.includes("rerouteServiceId: dedicatedCircuit.id"));
assert.ok(seed.includes("await seedBidetDedicatedCircuitEntry()"));

const ordinaryOutlet = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((recipe) => recipe.key === "ELECTRICAL_NEW_120V_RECEPTACLE")!;
const dedicated = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((recipe) => recipe.key === "ELECTRICAL_DEDICATED_120V_RECEPTACLE")!;
assert.equal(ordinaryOutlet.appliesTo.includes("bidet-smart-toilet-outlet"), false);
assert.equal(dedicated.appliesTo.includes("bidet-smart-toilet-outlet"), true);

assert.deepEqual(resolveReviewedDedicatedCircuitPackage({
  dedicated_equipment: "bidet",
  dedicated_route_access: "accessible_attic",
  dedicated_distance: "under_25",
  dedicated_finish_ack: "accepted",
}), { circuitAmps: 15, cableRole: "WIRE_14_2", breakerRole: "BREAKER_SINGLE_POLE_15A", receptacleRole: "RECEPTACLE_STANDARD", requiresSumpPumpProtectionConfirmation: false });
assert.deepEqual(resolveReviewedDedicatedCircuitPackage({
  dedicated_equipment: "sump_pump",
  dedicated_route_access: "accessible_attic",
  dedicated_distance: "under_25",
  dedicated_finish_ack: "accepted",
}), { circuitAmps: 20, cableRole: "WIRE_12_2", breakerRole: "BREAKER_SINGLE_POLE_20A", receptacleRole: "GFCI_INTERIOR_20A", requiresSumpPumpProtectionConfirmation: true });

console.log("dedicated entry contract: bidet and sump storefront entries reroute into their exact reviewed dedicated-circuit packages");
