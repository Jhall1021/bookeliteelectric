import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";

const seed = readFileSync("prisma/seed-questions.ts", "utf8");
assert.ok(seed.includes("seedBidetDedicatedCircuitEntry"));
assert.ok(seed.includes('key: "dedicated_equipment"'));
assert.ok(seed.includes('value: "bidet"'));
assert.ok(seed.includes('routeAction: "REROUTE_SERVICE"'));
assert.ok(seed.includes("rerouteServiceId: newOutlet.id"));
assert.ok(seed.includes("await seedBidetDedicatedCircuitEntry()"));

const ordinaryOutlet = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((recipe) => recipe.key === "ELECTRICAL_NEW_120V_RECEPTACLE")!;
const dedicated = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((recipe) => recipe.key === "ELECTRICAL_DEDICATED_120V_RECEPTACLE")!;
assert.equal(ordinaryOutlet.appliesTo.includes("bidet-smart-toilet-outlet"), true);
assert.equal(dedicated.appliesTo.includes("bidet-smart-toilet-outlet"), false);

console.log("bidet entry contract: smart-toilet outlets use the general new-outlet route and atomic recipe");
