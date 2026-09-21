import { strict as assert } from "node:assert";
import {
  evaluateRecessedLightingAtomicLabor,
  evaluateSwitchLegAtomicLabor,
  recessedLightingOperationKeys,
  switchLegOperationKeys,
} from "../lib/electrical/lightingRouteAtomicLaborBridge";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`  ✓ ${message}`); };
const calibrated = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, 1]));

const finishedSwitch = evaluateSwitchLegAtomicLabor({
  access: "FINISHED", routeFeet: 14, perpendicularCeilingFeet: 8, framingSpacingInches: 16,
  contractorHours: calibrated(switchLegOperationKeys("FINISHED")),
});
ok(finishedSwitch.kind === "READY", "finished switch leg evaluates from explicit route geometry");
if (finishedSwitch.kind !== "READY") throw new Error("expected ready finished switch leg");
ok(finishedSwitch.quantities.ELEC_CUT_DRYWALL_ACCESS_OPENING === 8, "finished switch leg carries two top-plate access openings plus six 16-inch ceiling crossings");
ok(finishedSwitch.quantities.ELEC_DRILL_FRAMING_CROSSING === 6, "eight perpendicular ceiling feet produces six joist crossings");
ok(!("ELEC_PATCH_DRYWALL_ACCESS_OPENING" in finishedSwitch.quantities), "switch-leg price excludes drywall repair");

const accessibleSwitch = evaluateSwitchLegAtomicLabor({
  access: "ACCESSIBLE", routeFeet: 14, perpendicularCeilingFeet: null, framingSpacingInches: null,
  contractorHours: calibrated(switchLegOperationKeys("ACCESSIBLE")),
});
ok(accessibleSwitch.kind === "READY", "accessible switch leg needs cable footage but no hidden-ceiling framing guess");
if (accessibleSwitch.kind !== "READY") throw new Error("expected ready accessible switch leg");
ok(accessibleSwitch.quantities.ELEC_NM_CABLE_ACCESSIBLE === 14, "accessible switch leg uses measured cable-route feet");

const fourLights = evaluateRecessedLightingAtomicLabor({
  access: "FINISHED", lightCount: 4, interLightCableFeet: 24, nmCableSupportCount: 0, perpendicularCeilingFeet: 8, framingSpacingInches: 16, existingLightingSourceConfirmed: true,
  contractorHours: calibrated(recessedLightingOperationKeys()),
});
ok(fourLights.kind === "READY", "four-light finished-ceiling layout evaluates from explicit geometry");
if (fourLights.kind !== "READY") throw new Error("expected ready recessed-light layout");
ok(fourLights.quantities.ELEC_CUT_RECESSED_LIGHT_OPENING === 4 && fourLights.quantities.ELEC_INSTALL_RECESSED_WAFER === 4, "each requested light carries one cut-in and one wafer installation");
ok(fourLights.quantities.ELEC_FISH_CABLE_CONCEALED === 24, "inter-light cable labor follows the measured layout path");
ok(fourLights.quantities.ELEC_DRILL_FRAMING_CROSSING === 6, "only the eight feet perpendicular to joists creates six crossings");
ok(fourLights.quantities.ELEC_CUT_DRYWALL_ACCESS_OPENING === 8, "finished layout carries two feed/retrieval openings plus six crossing openings");
ok(!("ELEC_PATCH_DRYWALL_ACCESS_OPENING" in fourLights.quantities), "recessed-light price excludes drywall repair");

const missingOrientation = evaluateRecessedLightingAtomicLabor({
  access: "FINISHED", lightCount: 4, interLightCableFeet: 24, nmCableSupportCount: 0, perpendicularCeilingFeet: null, framingSpacingInches: 16, existingLightingSourceConfirmed: true,
  contractorHours: calibrated(recessedLightingOperationKeys()),
});
ok(missingOrientation.kind === "INCOMPLETE" && missingOrientation.missingQuantities.includes("ELEC_DRILL_FRAMING_CROSSING"), "unknown perpendicular distance refuses instead of treating the whole run as parallel or perpendicular");

console.log(`\nLIGHTING ROUTE ATOMIC LABOR BRIDGE — ${checks}/${checks} checks passed`);
