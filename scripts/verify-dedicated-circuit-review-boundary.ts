import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";

const seed = readFileSync("prisma/seed-dedicated-circuit.ts", "utf8");
const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === "ELECTRICAL_DEDICATED_120V_RECEPTACLE");
assert.ok(recipe);

assert.ok(seed.includes('label: "I understand — continue with this price"'));
assert.ok(seed.includes('photosBlockBooking: false'));
assert.ok(seed.includes("approximate distance bands"));
assert.match(seed, /value: "20a_240v",[\s\S]{0,180}routeAction: "PHOTO_REVIEW",[\s\S]{0,80}photosBlockBooking: true/);
assert.match(seed, /value: "30a_plus",[\s\S]{0,500}routeAction: "PHOTO_REVIEW",[\s\S]{0,80}photosBlockBooking: true/);

const operations = new Set(recipe.lines.map((line) => line.operationKey));
for (const key of [
  "ELEC_INSTALL_NEW_SINGLE_POLE_BREAKER", "ELEC_NM_CABLE_ACCESSIBLE", "ELEC_SUPPORT_NM_CABLE",
  "ELEC_DRILL_TOP_OR_BOTTOM_PLATE", "ELEC_FISH_WALL_TO_BOX", "ELEC_INSTALL_OLD_WORK_BOX",
  "ELEC_INSTALL_NEW_RECEPTACLE", "ELEC_TEST_BRANCH_EXTENSION", "ELEC_BRANCH_WORK_CLEANUP",
]) assert.ok(operations.has(key), `missing ${key}`);

const framing = recipe.lines.find((line) => line.operationKey === "ELEC_DRILL_FRAMING_CROSSING");
assert.equal(framing?.condition, "finishedRoute");

console.log("dedicated-circuit boundary: bounded accessible routes price from conservative distance bands and exceptions remain review-only");
