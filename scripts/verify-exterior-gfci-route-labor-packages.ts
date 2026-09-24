import assert from "node:assert/strict";
import { EXTERIOR_GFCI_ROUTE_LABOR_PACKAGES } from "../lib/electrical/exteriorGfciRouteLaborPackages";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const near = (actual: number | undefined, expected: number) => actual !== undefined && Math.abs(actual - expected) < 1e-9;
const byKey = new Map(EXTERIOR_GFCI_ROUTE_LABOR_PACKAGES.map((entry) => [entry.componentKey, entry]));

ok(byKey.size === 4, "all four compatibility route components have atomic labor packages");
ok(near(byKey.get("EXT_GFCI_RUN_ACCESSIBLE_UNDER_10")?.incrementHours, 0), "accessible under-10 component remains the zero increment over its own base");
ok(near(byKey.get("EXT_GFCI_RUN_ACCESSIBLE_10_20")?.incrementHours, 0.16), "accessible 10-to-20 increment carries ten cable feet and two supports");
ok(near(byKey.get("EXT_GFCI_RUN_FINISHED_UNDER_10")?.incrementHours, 1.79), "finished under-10 increment is the full atomic route difference");
ok(near(byKey.get("EXT_GFCI_RUN_FINISHED_10_20")?.incrementHours, 4.34), "finished 10-to-20 increment is the full atomic route difference");
ok([...byKey.values()].every((entry) => entry.incrementScheduleMinutes === Math.ceil(entry.incrementHours * 60 - 1e-6)), "schedule minutes derive from atomic increment hours");

console.log(`EXTERIOR GFCI ROUTE LABOR PACKAGES — ${checks}/${checks} checks passed`);
