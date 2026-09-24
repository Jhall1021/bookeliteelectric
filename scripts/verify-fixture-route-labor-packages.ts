import assert from "node:assert/strict";
import { FIXTURE_ROUTE_LABOR_PACKAGES } from "../lib/electrical/fixtureRouteLaborPackages";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-9;
const byKey = new Map(FIXTURE_ROUTE_LABOR_PACKAGES.map((entry) => [entry.componentKey, entry]));

ok(byKey.size === 3, "all three priceable finished fixture routes have atomic premium packages");
ok(near(byKey.get("NEW_CEILING_LIGHT_FINISHED")!.accessibleHours, 1.8), "ceiling-light accessible base remains 1.80 atomic hours");
ok(near(byKey.get("NEW_CEILING_FAN_FINISHED")!.accessibleHours, 3.75), "ceiling-fan accessible base remains 3.75 atomic hours");
ok(near(byKey.get("NEW_WALL_SCONCE_FINISHED_ROUTE")!.accessibleHours, 2.4), "wall-sconce accessible base remains 2.40 atomic hours");
ok(near(byKey.get("NEW_CEILING_LIGHT_FINISHED")!.finishedHours, 8.345), "ceiling-light finished envelope totals 8.345 atomic hours");
ok(near(byKey.get("NEW_CEILING_FAN_FINISHED")!.finishedHours, 10.295), "ceiling-fan finished envelope totals 10.295 atomic hours");
ok(near(byKey.get("NEW_WALL_SCONCE_FINISHED_ROUTE")!.finishedHours, 8.345), "wall-sconce finished envelope totals 8.345 atomic hours");
ok(near(byKey.get("NEW_CEILING_LIGHT_FINISHED")!.premiumHours, 6.545), "ceiling-light premium is the finished-minus-accessible recipe difference");
ok(near(byKey.get("NEW_CEILING_FAN_FINISHED")!.premiumHours, 6.545), "ceiling-fan premium is the finished-minus-accessible recipe difference");
ok(near(byKey.get("NEW_WALL_SCONCE_FINISHED_ROUTE")!.premiumHours, 5.945), "wall-sconce premium is the finished-minus-accessible recipe difference");
ok([...byKey.values()].every((entry) => entry.premiumScheduleMinutes === Math.ceil(entry.premiumHours * 60 - 1e-6)), "premium schedule minutes come from the same atomic labor difference");

console.log(`FIXTURE ROUTE LABOR PACKAGES — ${checks}/${checks} checks passed`);
