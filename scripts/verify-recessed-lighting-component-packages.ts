import assert from "node:assert/strict";
import {
  RECESSED_LIGHTING_COMPONENT_LABOR_PACKAGES,
  RECESSED_LIGHTING_COMPONENT_MATERIAL_RECIPES,
} from "../lib/electrical/recessedLightingComponentPackages";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const near = (actual: number | undefined, expected: number) => actual !== undefined && Math.abs(actual - expected) < 1e-9;
const labor = new Map(RECESSED_LIGHTING_COMPONENT_LABOR_PACKAGES.map((entry) => [entry.componentKey, entry]));
const materials = new Map(RECESSED_LIGHTING_COMPONENT_MATERIAL_RECIPES.map((entry) => [entry.componentKey, entry]));
const quantity = (componentKey: string, role: string) => materials.get(componentKey as "RECESSED_ADDITIONAL_ACCESSIBLE" | "RECESSED_ADDITIONAL_FINISHED")?.lines.find((line) => line.role === role)?.quantity ?? 0;

ok(labor.size === 3, "all three compatibility recessed-light components have atomic labor packages");
ok(near(labor.get("RECESSED_ADDITIONAL_ACCESSIBLE")?.incrementHours, 0.61), "accessible additional light carries one light, ten cable feet and two supports");
ok(near(labor.get("RECESSED_FIRST_LIGHT_FINISHED")?.incrementHours, 6.725), "first finished-light premium is the complete 25-foot atomic route difference");
ok(near(labor.get("RECESSED_ADDITIONAL_FINISHED")?.incrementHours, 3.3), "finished additional light carries its opening, wafer and conservative concealed segment");
ok([...labor.values()].every((entry) => entry.incrementScheduleMinutes === Math.ceil(entry.incrementHours * 60 - 1e-6)), "schedule minutes derive from atomic increment hours");
ok(quantity("RECESSED_ADDITIONAL_ACCESSIBLE", "RECESSED_WAFER") === 1 && quantity("RECESSED_ADDITIONAL_ACCESSIBLE", "WIRE_14_2") === 10 && quantity("RECESSED_ADDITIONAL_ACCESSIBLE", "NM_CABLE_SUPPORT") === 2, "accessible material increment includes one wafer, ten wire feet and two per-item supports");
ok(quantity("RECESSED_ADDITIONAL_FINISHED", "RECESSED_WAFER") === 1 && quantity("RECESSED_ADDITIONAL_FINISHED", "WIRE_14_2") === 10 && quantity("RECESSED_ADDITIONAL_FINISHED", "NM_CABLE_SUPPORT") === 0, "finished material increment includes the wafer and wire without inaccessible supports");
ok([...materials.values()].every((recipe) => !recipe.lines.some((line) => line.role === "CONSUMABLES_SMALL")), "incremental components do not duplicate the host service's job-level consumables");

console.log(`RECESSED LIGHTING COMPONENT PACKAGES — ${checks}/${checks} checks passed`);
