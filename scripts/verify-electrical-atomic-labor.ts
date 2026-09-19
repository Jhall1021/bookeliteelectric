import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS as operations, ELECTRICAL_ATOMIC_LABOR_RECIPES as recipes, ELECTRICAL_LABOR_CALIBRATION_GROUPS as calibrationGroups } from "../lib/electrical/atomicLabor";
import { indexedElectricalLaborFamilies } from "../lib/electrical/laborCoverageFamilies";
import { evaluateLaborRecipe, framingCrossingCount } from "../lib/laborOperations";
import fs from "node:fs";
import path from "node:path";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };

ok(new Set(operations.map((o) => o.key)).size === operations.length, "operation keys are unique");
ok(new Set(recipes.map((r) => r.key)).size === recipes.length, "recipe keys are unique");
const known = new Set(operations.map((o) => o.key));
ok(recipes.every((r) => r.lines.every((l) => known.has(l.operationKey))), "every recipe line names a known operation");
ok(operations.every((o) => o.referenceLaborHours !== null || o.referenceStatus !== "VERIFIED"), "no null reference is marked verified");
ok(framingCrossingCount(10, 16) === 8, "10 feet perpendicular to 16-inch framing yields 8 crossings");
ok(framingCrossingCount(0, 16) === 0, "zero perpendicular distance yields zero crossings");

const ledger = JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs/audits/electrical-labor-coverage-ledger.json"), "utf8")) as {
  routes: { serviceSlug: string }[];
};
const ledgerServices = new Set(ledger.routes.map((route) => route.serviceSlug));
const familyIndex = indexedElectricalLaborFamilies();
ok(familyIndex.size === 82, "family registry contains all 82 catalog services exactly once");
ok([...ledgerServices].every((slug) => familyIndex.has(slug)), "every service in the generated ledger belongs to a labor family");
ok([...familyIndex.keys()].every((slug) => ledgerServices.has(slug)), "family registry contains no service absent from the generated ledger");
const deviceServices = new Set(familyIndex.size ? [...familyIndex.entries()].filter(([, family]) => family.key === "devices-controls").map(([slug]) => slug) : []);
const applianceServices = new Set([...familyIndex.entries()].filter(([, family]) => family.key === "appliances").map(([slug]) => slug));
const recipeTargets = new Set(recipes.flatMap((recipe) => recipe.appliesTo));
ok([...deviceServices].every((slug) => recipeTargets.has(slug)), "all 15 device/control services have an atomic recipe");
ok([...applianceServices].every((slug) => recipeTargets.has(slug)), "all five appliance services have an atomic recipe");
ok(calibrationGroups.every((group) => [...group.anchorOperationKeys, ...group.relatedOperationKeys].every((key) => known.has(key))), "every calibration group refers only to known operations");

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

const surface = recipes.find((r) => r.key === "ELECTRICAL_SURFACE_RACEWAY_ROUTE")!;
const surfaceReady = evaluateLaborRecipe(surface, {
  surfaceRouteFeet: 18, conductorFeet: 54, straightJointCount: 2, supportCount: 8, wireClipCount: 0,
  insideCornerCount: 1, outsideCornerCount: 1, flatCornerCount: 2,
  blankEndCount: 1, transitionCount: 1, surfaceDeviceBoxCount: 1,
}, calibrated);
ok(surfaceReady.kind === "READY" && surfaceReady.quantities.ELEC_SURFACE_RACEWAY === 18, "surface recipe consumes measured raceway footage");
ok(surfaceReady.kind === "READY" && surfaceReady.quantities.ELEC_SURFACE_RACEWAY_FLAT_CORNER === 2, "surface recipe preserves physical corner counts");

const missingSurfaceFact = evaluateLaborRecipe(surface, {
  surfaceRouteFeet: 18, conductorFeet: 54, straightJointCount: 2, supportCount: 8, wireClipCount: 0,
  insideCornerCount: 0, outsideCornerCount: 0, flatCornerCount: 0,
  blankEndCount: 1, surfaceDeviceBoxCount: 1,
}, calibrated);
ok(missingSurfaceFact.kind === "INCOMPLETE" && missingSurfaceFact.missingQuantities.includes("ELEC_SURFACE_RACEWAY_TRANSITION"), "surface recipe refuses when a required fitting count is unknown");

const smart = recipes.find((r) => r.key === "ELECTRICAL_SMART_DEVICE")!;
const smartUnknown = evaluateLaborRecipe(smart, {}, calibrated);
ok(smartUnknown.kind === "INCOMPLETE" && smartUnknown.missingQuantities.includes("condition:commissioningIncluded"), "smart-device recipe refuses until commissioning responsibility is explicit");
const smartWithoutCommissioning = evaluateLaborRecipe(smart, { commissioningIncluded: false }, calibrated);
ok(smartWithoutCommissioning.kind === "READY" && !smartWithoutCommissioning.quantities.ELEC_COMMISSION_CONNECTED_DEVICE, "smart-device hardware can be calibrated without silently adding commissioning");

const thermostat = recipes.find((r) => r.key === "ELECTRICAL_SMART_THERMOSTAT")!;
const thermostatReady = evaluateLaborRecipe(thermostat, { powerRemediationRequired: true, commissioningIncluded: true }, calibrated);
ok(thermostatReady.kind === "READY" && thermostatReady.quantities.ELEC_THERMOSTAT_POWER_REMEDIATION === 1 && thermostatReady.quantities.ELEC_COMMISSION_CONNECTED_DEVICE === 1, "thermostat recipe keeps power remediation and commissioning as explicit adders");

const newMicrowave = recipes.find((r) => r.key === "ELECTRICAL_NEW_OTR_MICROWAVE")!;
const microwaveUnknown = evaluateLaborRecipe(newMicrowave, {}, calibrated);
ok(microwaveUnknown.kind === "INCOMPLETE" && microwaveUnknown.missingQuantities.includes("condition:existingHoodRemoval") && microwaveUnknown.missingQuantities.includes("condition:convertHoodFeedToReceptacle"), "new-microwave recipe refuses until existing hood/feed scope is explicit");
const hoodConversion = evaluateLaborRecipe(newMicrowave, { existingHoodRemoval: true, convertHoodFeedToReceptacle: true }, calibrated);
ok(hoodConversion.kind === "READY" && hoodConversion.quantities.ELEC_REMOVE_EXISTING_RANGE_HOOD === 1 && hoodConversion.quantities.ELEC_ADD_RECEPTACLE_FROM_HOOD_FEED === 1, "hood-conversion recipe adds removal and receptacle work separately");

console.log(`\nELECTRICAL ATOMIC LABOR — ${checks}/${checks} checks passed`);
