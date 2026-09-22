import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import {
  CIRCUIT_FAMILY_COSTS,
  CIRCUIT_LABOR_SERVICE_SLUGS,
  CIRCUIT_POLICY_ALLOWANCES,
  FIXTURE_COSTS,
  ROUTE_LABOR_OPERATION_KEYS,
} from "./_derivedStorefrontFixture";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const pricedRoles = new Set([...FIXTURE_COSTS, ...CIRCUIT_FAMILY_COSTS].map(([roleKey]) => roleKey));
const requiredRoles = [
  "WIRE_14_2", "WIRE_12_2", "NM_CABLE_SUPPORT",
  "BREAKER_SINGLE_POLE_15A", "BREAKER_SINGLE_POLE_20A",
  "RECEPTACLE_STANDARD", "GFCI_INTERIOR_20A", "BOX_OLD_WORK", "WALL_PLATE",
  "WIRE_10_3", "WIRE_6_3", "BREAKER_DOUBLE_POLE_30A", "BREAKER_DOUBLE_POLE_50A",
  "RECEPTACLE_14_30", "RECEPTACLE_14_50", "BOX_SURFACE_4S", "COVER_RAISED_4S",
  "CONSUMABLES_MEDIUM",
];
for (const roleKey of requiredRoles) {
  ok(pricedRoles.has(roleKey), `the rehearsal fixture costs ${roleKey}`);
}

ok(CIRCUIT_POLICY_ALLOWANCES["dedicated-120v-circuit-outlet"].some(([key, quantity]) => key === "WIRE_14_2" && quantity === 50), "dedicated circuits declare their 50-foot wire allowance");
for (const slug of ["dedicated-120v-circuit-outlet", "electric-fireplace-circuit", "new-240v-appliance-circuit"] as const) {
  ok(CIRCUIT_POLICY_ALLOWANCES[slug].some(([key, quantity]) => key === "CONSUMABLES_MEDIUM" && quantity === 1), `${slug} declares one consumables package`);
}

const calibratedOperations = new Set(ROUTE_LABOR_OPERATION_KEYS);
const requiredOperations = new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES
  .filter((recipe) => recipe.appliesTo.some((slug) => CIRCUIT_LABOR_SERVICE_SLUGS.has(slug)))
  .flatMap((recipe) => recipe.lines.map((line) => line.operationKey)));
for (const operationKey of requiredOperations) {
  ok(calibratedOperations.has(operationKey), `the rehearsal fixture calibrates ${operationKey}`);
}

const source = readFileSync("scripts/_derivedStorefrontFixture.ts", "utf8");
for (const slug of ["dedicated-120v-circuit-outlet", "electric-fireplace-circuit", "new-240v-appliance-circuit"]) {
  ok(source.includes(`"${slug}"`), `the rehearsal fixture includes ${slug} in its calculated-price lifecycle`);
}
ok(source.includes("decideDerivedPricingApproval"), "the fixture approves calculated pricing through the supported decision");
ok(source.includes("activateService"), "the fixture activates approved circuit services through the supported lifecycle");
ok(!source.includes("publishSuggestedPrice"), "the fixture does not publish a legacy base price for calculated circuit services");
ok(!source.includes("saveServicePricingInputs"), "the fixture does not write legacy service labor hours for calculated circuit services");

console.log(`DERIVED STOREFRONT CIRCUIT FAMILY — ${checks}/${checks} checks passed`);
