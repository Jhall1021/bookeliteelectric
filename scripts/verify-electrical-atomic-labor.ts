import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS as operations, ELECTRICAL_ATOMIC_LABOR_RECIPES as recipes } from "../lib/electrical/atomicLabor";
import { evaluateLaborRecipe, framingCrossingCount } from "../lib/laborOperations";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };

ok(new Set(operations.map((o) => o.key)).size === operations.length, "operation keys are unique");
ok(new Set(recipes.map((r) => r.key)).size === recipes.length, "recipe keys are unique");
const known = new Set(operations.map((o) => o.key));
ok(recipes.every((r) => r.lines.every((l) => known.has(l.operationKey))), "every recipe line names a known operation");
ok(operations.every((o) => o.referenceLaborHours !== null || o.referenceStatus !== "VERIFIED"), "no null reference is marked verified");
ok(framingCrossingCount(10, 16) === 8, "10 feet perpendicular to 16-inch framing yields 8 crossings");
ok(framingCrossingCount(0, 16) === 0, "zero perpendicular distance yields zero crossings");

const finished = recipes.find((r) => r.key === "ELECTRICAL_FINISHED_SWITCH_LEG")!;
const blankHours = Object.fromEntries(operations.map((o) => [o.key, o.referenceLaborHours]));
const incomplete = evaluateLaborRecipe(finished, { routeFeet: 10, perpendicularCeilingFeet: 10, framingSpacingInches: 16 }, blankHours);
ok(incomplete.kind === "INCOMPLETE", "recipe refuses when atomic labor is not established");
ok(incomplete.kind === "INCOMPLETE" && incomplete.missingOperations.includes("ELEC_DRILL_FRAMING_CROSSING"), "refusal identifies the missing operation");

const calibrated = Object.fromEntries(operations.map((o) => [o.key, 0.1]));
const ready = evaluateLaborRecipe(finished, { routeFeet: 10, perpendicularCeilingFeet: 10, framingSpacingInches: 16 }, calibrated);
ok(ready.kind === "READY", "fully calibrated recipe evaluates");
ok(ready.kind === "READY" && ready.quantities.ELEC_DRILL_FRAMING_CROSSING === 8, "geometry drives framing crossings");
ok(ready.kind === "READY" && ready.quantities.ELEC_CUT_DRYWALL_ACCESS_OPENING === 10, "finished switch leg carries two plate openings plus eight framing-crossing openings");

const recessed = recipes.find((r) => r.key === "ELECTRICAL_RECESSED_LIGHT_GROUP")!;
const unknownRoute = evaluateLaborRecipe(recessed, {
  lightCount: 4, interLightCableFeet: 24, perpendicularCeilingFeet: 8, framingSpacingInches: 16,
}, calibrated);
ok(unknownRoute.kind === "INCOMPLETE" && unknownRoute.missingQuantities.some((x) => x.startsWith("condition:")), "route access must be established rather than silently skipping cable labor");
const recessedReady = evaluateLaborRecipe(recessed, {
  lightCount: 4, interLightCableFeet: 24, perpendicularCeilingFeet: 8,
  framingSpacingInches: 16, finishedRoute: true, accessibleRoute: false,
}, calibrated);
ok(recessedReady.kind === "READY" && recessedReady.quantities.ELEC_INSTALL_RECESSED_WAFER === 4, "four-light recipe installs four wafers");
ok(recessedReady.kind === "READY" && recessedReady.quantities.ELEC_DRILL_FRAMING_CROSSING === 6, "eight perpendicular feet yields six joist crossings");
ok(recessedReady.kind === "READY" && recessedReady.quantities.ELEC_CUT_DRYWALL_ACCESS_OPENING === 8, "finished four-light route carries two baseline openings plus six joist-crossing openings");

console.log(`\nELECTRICAL ATOMIC LABOR — ${checks}/${checks} checks passed`);
