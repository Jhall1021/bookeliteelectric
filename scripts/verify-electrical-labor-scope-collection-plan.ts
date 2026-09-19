import { strict as assert } from "node:assert";
import { buildElectricalLaborScopeCollectionPlan, ELECTRICAL_LABOR_SCOPE_COLLECTION_GROUPS } from "../lib/electrical/laborScopeCollectionPlan";
import { buildElectricalServiceLaborReadiness } from "../lib/electrical/serviceLaborReadiness";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; console.log(`  ✓ ${message}`); };
const rows = buildElectricalServiceLaborReadiness();
const affected = rows.filter((row) => row.missingScopeFacts.length > 0);
const plan = buildElectricalLaborScopeCollectionPlan(affected.map((row) => row.serviceSlug));
const plannedFacts = new Set(plan.flatMap((task) => task.factKeys));
const requiredFacts = new Set(affected.flatMap((row) => row.missingScopeFacts));

ok(Object.keys(ELECTRICAL_LABOR_SCOPE_COLLECTION_GROUPS).length === 21, "the 40 facts collapse into 21 reusable collection groups");
ok([...requiredFacts].every((key) => plannedFacts.has(key)), "the plan covers every fact needed by all 43 affected services");
ok(plan.every((task) => new Set(task.factKeys).size === task.factKeys.length), "no task asks for the same fact twice");
ok(plan.filter((task) => task.collectionPath === "SYSTEM_DERIVED").every((task) => !task.asksUser), "derived takeoffs never become questionnaire prompts");
ok(plan.filter((task) => task.asksUser).every((task) => task.collectionPath !== "SYSTEM_DERIVED"), "every displayed task requires a real human or capture source");

const branchServices = ["new-120v-outlet", "dedicated-120v-circuit-outlet", "level-2-ev-charger"];
const branchPlan = buildElectricalLaborScopeCollectionPlan(branchServices);
ok(branchPlan.filter((task) => task.collectionGroupKey === "ROUTE_ACCESS").length === 1, "three branch-circuit services share one route-access question group");
ok(branchPlan.filter((task) => task.collectionGroupKey === "FRAMING_POLICY").length === 1, "three branch-circuit services share one contractor framing policy");
ok(branchPlan.find((task) => task.collectionGroupKey === "ACCESSIBLE_ROUTE_MEASUREMENT")?.collectionPath === "CONTRACTOR_MEASUREMENT", "accessible attic, basement and crawlspace paths go to contractor measurement");
ok(branchPlan.find((task) => task.collectionGroupKey === "FINISHED_ROUTE_MEASUREMENT")?.collectionPath === "ROUTE_ASSIST_CONFIRMED", "finished routes prefer confirmed Route Assist geometry");

const racewayPlan = buildElectricalLaborScopeCollectionPlan(["surface-mounted-outlet", "surface-mounted-switch", "surface-mounted-fixture-box"]);
ok(racewayPlan.filter((task) => task.collectionGroupKey === "SURFACE_RACEWAY_GEOMETRY").length === 1, "all surface-raceway services share one geometry capture");
ok(racewayPlan.find((task) => task.collectionGroupKey === "SURFACE_RACEWAY_TAKEOFF")?.asksUser === false, "raceway joints and supports are calculated after geometry capture");

const fanPlan = buildElectricalLaborScopeCollectionPlan(["replace-bathroom-exhaust-fan", "fan-replacing-light"]);
ok(fanPlan.filter((task) => task.collectionGroupKey === "EQUIPMENT_ADAPTATION_REVIEW").length === 1, "fan support, housing and duct conditions share one review group");
ok(fanPlan.find((task) => task.collectionGroupKey === "EQUIPMENT_ADAPTATION_REVIEW")?.collectionPath === "GUIDED_PHOTO_REVIEW", "technical fan adaptation never becomes homeowner diagnosis");

ok(buildElectricalLaborScopeCollectionPlan(["replace-standard-outlet"]).length === 0, "a service with no unresolved scope facts receives no extra collection work");
ok(buildElectricalLaborScopeCollectionPlan([]).length === 0, "an empty offered catalog produces no collection tasks");

console.log(`\nELECTRICAL LABOR SCOPE COLLECTION PLAN — ${checks}/${checks} checks passed`);
