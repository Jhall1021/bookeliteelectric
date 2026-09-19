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
const mediaServices = new Set([...familyIndex.entries()].filter(([, family]) => family.key === "media-low-voltage-security").map(([slug]) => slug));
const panelServices = new Set([...familyIndex.entries()].filter(([, family]) => family.key === "panels-protection").map(([slug]) => slug));
const outdoorServices = new Set([...familyIndex.entries()].filter(([, family]) => family.key === "outdoor-generation-specialty").map(([slug]) => slug));
const branchServices = new Set([...familyIndex.entries()].filter(([, family]) => family.key === "branch-routing").map(([slug]) => slug));
const recipeTargets = new Set(recipes.flatMap((recipe) => recipe.appliesTo));
ok([...deviceServices].every((slug) => recipeTargets.has(slug)), "all 15 device/control services have an atomic recipe");
ok([...applianceServices].every((slug) => recipeTargets.has(slug)), "all five appliance services have an atomic recipe");
ok([...mediaServices].every((slug) => recipeTargets.has(slug)), "all 12 media/low-voltage/security services have an atomic recipe");
ok([...panelServices].every((slug) => recipeTargets.has(slug)), "all five panel/protection services have an atomic recipe");
ok([...outdoorServices].every((slug) => recipeTargets.has(slug)), "all six outdoor/generator/pool/spa services have an atomic recipe");
ok([...branchServices].every((slug) => recipeTargets.has(slug)), "all 19 branch-routing services have a service-level atomic recipe");
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

const ethernet = recipes.find((r) => r.key === "ELECTRICAL_ETHERNET_POINT")!;
const ethernetUnknown = evaluateLaborRecipe(ethernet, {}, calibrated);
ok(ethernetUnknown.kind === "INCOMPLETE" && ethernetUnknown.missingQuantities.includes("condition:accessibleRoute") && ethernetUnknown.missingQuantities.includes("condition:finishedRoute"), "data-cable recipe refuses until its route type is explicit");
const ethernetAccessible = evaluateLaborRecipe(ethernet, { accessibleRoute: true, finishedRoute: false, accessibleRouteFeet: 75 }, calibrated);
ok(ethernetAccessible.kind === "READY" && ethernetAccessible.quantities.ELEC_UTP_CABLE_ACCESSIBLE === 75 && ethernetAccessible.quantities.ELEC_TERMINATE_RJ45_END === 2 && ethernetAccessible.quantities.ELEC_TEST_DATA_CABLE === 1, "accessible Ethernet point carries cable footage, two ends and one test");
const impossibleEthernet = evaluateLaborRecipe(ethernet, { accessibleRoute: true, finishedRoute: true, accessibleRouteFeet: 75, concealedRouteFeet: 75 }, calibrated);
ok(impossibleEthernet.kind === "INCOMPLETE" && impossibleEthernet.invalidConditions.includes("accessibleRoute|finishedRoute"), "data-cable recipe refuses mutually impossible route classes");

const videoDoorbell = recipes.find((r) => r.key === "ELECTRICAL_VIDEO_DOORBELL_EXISTING")!;
const doorbellUnknown = evaluateLaborRecipe(videoDoorbell, {}, calibrated);
ok(doorbellUnknown.kind === "INCOMPLETE" && doorbellUnknown.missingQuantities.includes("condition:commissioningIncluded"), "video-doorbell recipe refuses to assume app commissioning");

const tv = recipes.find((r) => r.key === "ELECTRICAL_TV_NEW_LOCATION")!;
const impossibleMount = evaluateLaborRecipe(tv, { contractorTiltMount: true, contractorFullMotionMount: true }, calibrated);
ok(impossibleMount.kind === "INCOMPLETE" && impossibleMount.invalidConditions.includes("contractorTiltMount|contractorFullMotionMount"), "TV recipe refuses two mutually exclusive contractor-supplied mounts");

const panel = recipes.find((r) => r.key === "ELECTRICAL_PANEL_REPLACEMENT")!;
const panelUnknown = evaluateLaborRecipe(panel, {}, calibrated);
ok(panelUnknown.kind === "INCOMPLETE" && panelUnknown.missingQuantities.includes("ELEC_RECONNECT_SINGLE_POLE_BRANCH") && panelUnknown.missingQuantities.includes("ELEC_RECONNECT_DOUBLE_POLE_BRANCH"), "panel replacement refuses until both branch-circuit counts are known");
const panelReady = evaluateLaborRecipe(panel, { singlePoleCircuitCount: 17, doublePoleCircuitCount: 3 }, calibrated);
ok(panelReady.kind === "READY" && panelReady.quantities.ELEC_RECONNECT_SINGLE_POLE_BRANCH === 17 && panelReady.quantities.ELEC_RECONNECT_DOUBLE_POLE_BRANCH === 3, "panel replacement labor scales with the actual single- and double-pole circuit counts");

const serviceUpgrade = recipes.find((r) => r.key === "ELECTRICAL_200A_SERVICE_UPGRADE")!;
const serviceUnknown = evaluateLaborRecipe(serviceUpgrade, { singlePoleCircuitCount: 17, doublePoleCircuitCount: 3 }, calibrated);
ok(serviceUnknown.kind === "INCOMPLETE" && serviceUnknown.missingQuantities.includes("ELEC_SERVICE_ENTRANCE_CONDUCTOR") && serviceUnknown.missingQuantities.includes("ELEC_INSTALL_GROUNDING_ELECTRODE"), "service upgrade refuses until service footage and grounding-electrode count are known");
const serviceReady = evaluateLaborRecipe(serviceUpgrade, { serviceEntranceFeet: 20, groundingElectrodeCount: 2, singlePoleCircuitCount: 17, doublePoleCircuitCount: 3 }, calibrated);
ok(serviceReady.kind === "READY" && serviceReady.quantities.ELEC_SERVICE_ENTRANCE_CONDUCTOR === 20 && serviceReady.quantities.ELEC_INSTALL_GROUNDING_ELECTRODE === 2, "service-upgrade labor carries measured service footage and grounding scope");

const hotTub = recipes.find((r) => r.key === "ELECTRICAL_HOT_TUB_SPA")!;
const hotTubUnknown = evaluateLaborRecipe(hotTub, {}, calibrated);
ok(hotTubUnknown.kind === "INCOMPLETE" && hotTubUnknown.missingQuantities.includes("ELEC_EXTERIOR_CONDUIT") && hotTubUnknown.missingQuantities.includes("ELEC_PULL_POWER_CONDUCTORS") && hotTubUnknown.missingQuantities.includes("ELEC_INSTALL_EQUIPOTENTIAL_BOND"), "spa circuit refuses unknown route, conductor and bonding quantities");
const hotTubReady = evaluateLaborRecipe(hotTub, { racewayFeet: 25, conductorFeet: 100, bondingConnectionCount: 1 }, calibrated);
ok(hotTubReady.kind === "READY" && hotTubReady.quantities.ELEC_EXTERIOR_CONDUIT === 25 && hotTubReady.quantities.ELEC_PULL_POWER_CONDUCTORS === 100, "spa circuit distinguishes raceway-feet from conductor-feet");

const landscape = recipes.find((r) => r.key === "ELECTRICAL_LANDSCAPE_LIGHTING")!;
const landscapeReady = evaluateLaborRecipe(landscape, { landscapeCableFeet: 120, landscapeFixtureCount: 8 }, calibrated);
ok(landscapeReady.kind === "READY" && landscapeReady.quantities.ELEC_LANDSCAPE_CABLE === 120 && landscapeReady.quantities.ELEC_INSTALL_LANDSCAPE_FIXTURE === 8, "landscape labor scales independently by route length and fixture count");

const transfer = recipes.find((r) => r.key === "ELECTRICAL_TRANSFER_SWITCH")!;
const transferUnknown = evaluateLaborRecipe(transfer, { racewayFeet: 10, conductorFeet: 40 }, calibrated);
ok(transferUnknown.kind === "INCOMPLETE" && transferUnknown.missingQuantities.includes("ELEC_TRANSFER_BRANCH_CIRCUIT"), "transfer-switch labor refuses an unknown transferred-circuit count");

const dedicated = recipes.find((r) => r.key === "ELECTRICAL_DEDICATED_120V_RECEPTACLE")!;
const dedicatedUnknown = evaluateLaborRecipe(dedicated, { accessibleRoute: true, finishedRoute: false }, calibrated);
ok(dedicatedUnknown.kind === "INCOMPLETE" && dedicatedUnknown.missingQuantities.includes("ELEC_NM_CABLE_ACCESSIBLE") && dedicatedUnknown.missingQuantities.includes("ELEC_DRILL_FRAMING_CROSSING"), "dedicated circuit refuses missing route length and framing geometry");
const dedicatedReady = evaluateLaborRecipe(dedicated, { accessibleRoute: true, finishedRoute: false, accessibleRouteFeet: 35, concealedRouteFeet: 0, perpendicularFramingFeet: 8, framingSpacingInches: 16 }, calibrated);
ok(dedicatedReady.kind === "READY" && dedicatedReady.quantities.ELEC_NM_CABLE_ACCESSIBLE === 35 && dedicatedReady.quantities.ELEC_DRILL_FRAMING_CROSSING === 6 && dedicatedReady.quantities.ELEC_INSTALL_NEW_SINGLE_POLE_BREAKER === 1, "dedicated circuit carries route footage, framing crossings and a new breaker");

const garage240 = recipes.find((r) => r.key === "ELECTRICAL_NEW_240V_RECEPTACLE")!;
const garage240Ready = evaluateLaborRecipe(garage240, { accessibleRoute: true, finishedRoute: false, accessibleRouteFeet: 25, concealedRouteFeet: 0, perpendicularFramingFeet: 0, framingSpacingInches: 16 }, calibrated);
ok(garage240Ready.kind === "READY" && garage240Ready.quantities.ELEC_HEAVY_BRANCH_CABLE_ACCESSIBLE === 25 && garage240Ready.quantities.ELEC_INSTALL_NEW_240V_RECEPTACLE === 1, "240V receptacle uses its larger-cable operation rather than the 120V cable unit");

console.log(`\nELECTRICAL ATOMIC LABOR — ${checks}/${checks} checks passed`);
