import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";

const seed = readFileSync("prisma/seed-flood-camera.ts", "utf8");
const materials = readFileSync("prisma/seed-materials.ts", "utf8");
const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === "ELECTRICAL_FLOOD_CAMERA_NEW_LOCATION");
assert.ok(recipe);

const operationKeys = new Set(recipe.lines.map((line) => line.operationKey));
assert.ok(operationKeys.has("ELEC_INSTALL_EXTERIOR_FIXTURE_BOX"));
assert.ok(operationKeys.has("ELEC_MOUNT_AIM_EXTERIOR_CAMERA"));
assert.ok(!operationKeys.has("ELEC_INSTALL_WEATHERPROOF_RECEPTACLE_BOX"));
assert.ok(!operationKeys.has("ELEC_INSTALL_NEW_GFCI_RECEPTACLE"));

const serviceMaterials = materials.slice(materials.indexOf('slug: "new-exterior-flood-camera"'), materials.indexOf('slug: "single-pole-breaker-replacement"'));
assert.ok(serviceMaterials.includes('"BOX_CEILING_STANDARD"'));
assert.ok(!serviceMaterials.includes('"GFCI_WEATHER_RESISTANT"'));
assert.ok(!serviceMaterials.includes('"COVER_IN_USE_BUBBLE"'));
assert.ok(!serviceMaterials.includes('"CORD_CLIPS"'));

assert.ok(seed.includes('value: "hardwired"') && seed.includes('value: "plug_in"'));
assert.ok(seed.includes("Plug-in cameras require a different reviewed power package."));
for (const value of ["plug_in", "unsure", "attic_access", "under_8", "9_12"]) {
  const start = seed.indexOf(`value: "${value}"`);
  assert.ok(start >= 0, `missing ${value} path`);
  assert.ok(seed.slice(start, start + 240).includes('routeAction: "PHOTO_REVIEW"'), `${value} must remain review-only`);
}
assert.ok(!seed.includes('routeAction: "RESOLVE_INSTANT"'));

console.log("new flood-camera scope: the customer tree keeps hardwired and plug-in power distinct and sends every new location through contractor review");
