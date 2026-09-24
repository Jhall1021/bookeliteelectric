import assert from "node:assert/strict";
import { LIGHTING_CONTROL_LABOR_PACKAGES } from "../lib/electrical/lightingControlLaborPackages";
import { LIGHTING_CONTROL_MATERIAL_RECIPES } from "../lib/electrical/lightingControlMaterialRecipes";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const near = (actual: number | undefined, expected: number) => actual !== undefined && Math.abs(actual - expected) < 1e-9;
const labor = new Map(LIGHTING_CONTROL_LABOR_PACKAGES.map((entry) => [entry.componentKey, entry]));
const materials = new Map(LIGHTING_CONTROL_MATERIAL_RECIPES.map((entry) => [entry.componentKey, entry]));

ok(labor.size === 6, "all six priceable switch-leg components have atomic labor packages");
ok([...labor.keys()].every((key) => materials.has(key)), "every atomic labor package has a matching material recipe");
ok([...materials.keys()].every((key) => labor.has(key)), "every switch-leg material recipe has a matching atomic labor package");
ok(near(labor.get("SWITCHLEG_ACCESSIBLE_UNDER_10")?.laborHours, 1.51), "accessible under-10 package totals 1.51 atomic crew-hours");
ok(near(labor.get("SWITCHLEG_ACCESSIBLE_10_20")?.laborHours, 1.61), "accessible 10-to-20 package totals 1.61 atomic crew-hours");
ok(near(labor.get("SWITCH_POWER_RUN_ACCESSIBLE")?.laborHours, 1.66), "accessible standard power run totals 1.66 atomic crew-hours");
ok(near(labor.get("SWITCHLEG_FINISHED_UNDER_10")?.laborHours, 4.62), "finished under-10 envelope totals 4.62 atomic crew-hours");
ok(near(labor.get("SWITCHLEG_FINISHED_10_20")?.laborHours, 7.17), "finished 10-to-20 envelope totals 7.17 atomic crew-hours");
ok(near(labor.get("SWITCH_POWER_RUN_FINISHED")?.laborHours, 8.595), "finished standard power-run envelope totals 8.595 atomic crew-hours");
ok([...labor.values()].every((entry) => entry.scheduleMinutes === Math.ceil(entry.laborHours * 60 - 1e-6)), "schedule minutes come from the same atomic package hours");
ok([...labor.values()].filter((entry) => entry.access === "FINISHED").every((entry) => entry.perpendicularCeilingFeet === entry.routeFeet), "finished fixed prices use the disclosed all-perpendicular envelope");

console.log(`LIGHTING CONTROL LABOR PACKAGES — ${checks}/${checks} checks passed`);
