import assert from "node:assert/strict";

import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { lowVoltagePackage } from "../lib/electrical/circuitPackagePricing";
import { platformLaborHours } from "../lib/electrical/platformLaborBaseline";
import { evaluateLaborRecipe } from "../lib/laborOperations";

for (const [slug, recipeKey, cableRole, expectedHours] of [
  ["new-ethernet-line", "ELECTRICAL_ETHERNET_POINT", "CABLE_CAT6", 2.1266666666666665],
  ["new-coax-line", "ELECTRICAL_COAX_POINT", "CABLE_RG6", 1.9933333333333332],
] as const) {
  const pkg = lowVoltagePackage(slug, {
    [`${slug}_route_access`]: "exposed_baseboard",
    [`${slug}_exposed_route_feet`]: "40",
  });
  assert(pkg, `${slug} builds an exposed package`);
  assert.equal(pkg.routeFeet, 40);
  assert.equal(pkg.materialQuantities?.[cableRole], 46, `${slug} includes six feet of endpoint allowance`);
  assert.equal(pkg.materialQuantities?.LOW_VOLTAGE_CABLE_CLIP, 22, `${slug} uses two-foot clip spacing plus both ends`);
  assert.equal(pkg.facts.exposedLowVoltageRouteFeet, 40);
  assert.equal(pkg.facts.lowVoltageClipCount, 22);

  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === recipeKey);
  assert(recipe, `${recipeKey} exists`);
  const evaluated = evaluateLaborRecipe(recipe, pkg.facts, platformLaborHours());
  assert.equal(evaluated.kind, "READY");
  if (evaluated.kind === "READY") assert(Math.abs(evaluated.hours - expectedHours) < 1e-9);
}

assert.equal(lowVoltagePackage("new-ethernet-line", {
  "new-ethernet-line_route_access": "exposed_baseboard",
  "new-ethernet-line_exposed_route_feet": "76",
}), null, "routes over 75 feet remain review-only");

console.log("LOW-VOLTAGE EXPOSED BASEBOARD — verified exact footage, clip takeoff, labor and review boundary");
