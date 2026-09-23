import { LIGHTING_CONTROL_MATERIAL_RECIPES } from "../lib/electrical/lightingControlMaterialRecipes";

let failed = 0;
const ok = (label: string, condition: boolean) => {
  if (!condition) failed++;
  console.log(`  ${condition ? "ok" : "FAIL"}  ${label}`);
};
const byKey = new Map(LIGHTING_CONTROL_MATERIAL_RECIPES.map((recipe) => [recipe.componentKey, recipe]));
const quantity = (component: string, role: string) => byKey.get(component)?.lines.find((line) => line.role === role)?.quantity ?? 0;

console.log("\nLIGHTING CONTROL MATERIAL RECIPES\n");
ok("six bounded switch components have recipes", LIGHTING_CONTROL_MATERIAL_RECIPES.length === 6);
for (const key of byKey.keys()) {
  ok(`${key} uses one old-work box`, quantity(key, "BOX_OLD_WORK") === 1);
  ok(`${key} uses one standard switch`, quantity(key, "SWITCH_STANDARD") === 1);
  ok(`${key} uses one wall plate`, quantity(key, "WALL_PLATE") === 1);
}
ok("under-10 variants price ten feet of 14/2", ["SWITCHLEG_ACCESSIBLE_UNDER_10", "SWITCHLEG_FINISHED_UNDER_10"].every((key) => quantity(key, "WIRE_14_2") === 10));
ok("10-to-20 variants price twenty feet of 14/2", ["SWITCHLEG_ACCESSIBLE_10_20", "SWITCHLEG_FINISHED_10_20"].every((key) => quantity(key, "WIRE_14_2") === 20));
ok("standard power-run variants price twenty-five feet of 14/2", ["SWITCH_POWER_RUN_ACCESSIBLE", "SWITCH_POWER_RUN_FINISHED"].every((key) => quantity(key, "WIRE_14_2") === 25));
ok("accessible variants include derived support quantities", quantity("SWITCHLEG_ACCESSIBLE_UNDER_10", "NM_CABLE_SUPPORT") === 4
  && quantity("SWITCHLEG_ACCESSIBLE_10_20", "NM_CABLE_SUPPORT") === 6
  && quantity("SWITCH_POWER_RUN_ACCESSIBLE", "NM_CABLE_SUPPORT") === 7);
ok("finished-wall variants do not invent inaccessible supports", ["SWITCHLEG_FINISHED_UNDER_10", "SWITCHLEG_FINISHED_10_20", "SWITCH_POWER_RUN_FINISHED"].every((key) => quantity(key, "NM_CABLE_SUPPORT") === 0));
ok("component recipes do not duplicate the host service's job-level consumables", LIGHTING_CONTROL_MATERIAL_RECIPES.every((recipe) => quantity(recipe.componentKey, "CONSUMABLES_SMALL") === 0));

console.log(`\n  ${failed ? `${failed} failed` : "all checks passed"}\n`);
if (failed) process.exit(1);
