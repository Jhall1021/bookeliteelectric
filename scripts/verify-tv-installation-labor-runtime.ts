import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";

let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); };
const decisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => ({ operationKey: operation.key, hoursPerUnit: 0.5, source: "DIRECT" as const }));
const projection = projectElectricalServiceLabor("tv-installation", decisions);
const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.appliesTo.includes("tv-installation"))!;

ok(projection.kind === "READY_FOR_APPROVAL", "TV installation produces a reviewable atomic parent duration");
ok(recipe.lines.length === 1 && recipe.lines[0].operationKey === "ELEC_MOUNT_TV_NEW_LOCATION", "parent recipe carries TV mounting exactly once");

const tree = readFileSync("prisma/seed-questions.ts", "utf8");
const treeSection = tree.slice(tree.indexOf("const tvInstall"), tree.indexOf("async function seedTvInstallExistingLocation"));
ok(treeSection.includes("referencedServiceId: tiltMount.id") && treeSection.includes("referencedServiceId: articulatingMount.id"), "contractor-supplied mounts remain separately priced referenced products");
const masonryBranch = treeSection.slice(treeSection.indexOf('value: "masonry"'), treeSection.indexOf("// Fireplace branch"));
const fireplaceBranch = treeSection.slice(treeSection.indexOf("// Fireplace branch"), treeSection.indexOf("// Receptacle branch"));
ok(masonryBranch.includes('routeAction: "PHOTO_REVIEW"') && fireplaceBranch.includes('value: "yes"') && fireplaceBranch.includes('routeAction: "PHOTO_REVIEW"'), "masonry and above-fireplace conditions remain review-led");
ok(treeSection.includes('key: "outlet_access"') && treeSection.includes('key: "outlet_finished_space"'), "power-routing choices remain in their dedicated guided flow");
const tvRoutingSeed = readFileSync("prisma/seed-tv-installation.ts", "utf8");
ok(tvRoutingSeed.includes('const TV_OUTLET_DISTANCE_KEY = "tv_outlet_run_distance"'), "TV power routing collects the nearest-outlet distance before resolving");
ok(tvRoutingSeed.includes('TV_OUTLET_RUN_ACCESSIBLE_UNDER_10') && tvRoutingSeed.includes('TV_OUTLET_RUN_ACCESSIBLE_10_20') && tvRoutingSeed.includes('TV_OUTLET_RUN_FINISHED_UNDER_10') && tvRoutingSeed.includes('TV_OUTLET_RUN_FINISHED_10_20'), "TV outlet pricing varies by access and measured distance");

const measurementGuide = readFileSync("components/guided-flow/MeasurementGuide.tsx", "utf8");
ok(measurementGuide.includes('tv_outlet_run_distance: "outlet-to-tv-outlet"') && measurementGuide.includes("Nearest existing outlet") && measurementGuide.includes("New outlet behind TV"), "TV distance question renders the outlet-to-TV measurement diagram");

const laborSeed = readFileSync("prisma/seed-labor-hours.ts", "utf8");
ok(laborSeed.includes("Mount-install time is already inside Professional TV Installation") && laborSeed.includes("Charging labor here would bill it twice"), "add-on services retain the explicit no-double-labor contract");

console.log(`\nTV INSTALLATION LABOR RUNTIME — ${checks}/${checks} checks passed`);
