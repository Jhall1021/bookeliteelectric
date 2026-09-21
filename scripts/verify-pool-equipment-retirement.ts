import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { indexedElectricalLaborFamilies } from "../lib/electrical/laborCoverageFamilies";
import { buildElectricalServiceLaborReadiness } from "../lib/electrical/serviceLaborReadiness";

const retiredSlug = "pool-equipment-electrical";
for (const path of [
  "prisma/seed.ts",
  "components/marketing/trades/electricalTemplate.ts",
  "lib/serviceImages.ts",
  "prisma/seed-labor-hours.ts",
]) assert.ok(!readFileSync(path, "utf8").includes(retiredSlug), `${path} does not expose or provision the retired catch-all service`);

assert.ok(!indexedElectricalLaborFamilies().has(retiredSlug), "labor families no longer classify the retired service");
assert.ok(!buildElectricalServiceLaborReadiness().some((row) => row.serviceSlug === retiredSlug), "readiness no longer counts the retired service");
assert.ok(!ELECTRICAL_ATOMIC_LABOR_RECIPES.some((recipe) => recipe.appliesTo.includes(retiredSlug)), "no service recipe remains for the retired catch-all");

for (const operationKey of [
  "ELEC_EXTERIOR_CONDUIT",
  "ELEC_PULL_POWER_CONDUCTORS",
  "ELEC_TERMINATE_OUTDOOR_EQUIPMENT",
  "ELEC_INSTALL_BONDING_CONDUCTOR",
  "ELEC_INSTALL_EQUIPOTENTIAL_BOND",
]) assert.ok(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.some((operation) => operation.key === operationKey), `${operationKey} remains canonical for spa and future narrowly defined work`);

console.log("pool-equipment retirement: the broad customer-facing service is absent while reusable electrical operations remain canonical");
