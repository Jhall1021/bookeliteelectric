import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { indexedElectricalLaborFamilies } from "../lib/electrical/laborCoverageFamilies";
import { buildElectricalServiceLaborReadiness } from "../lib/electrical/serviceLaborReadiness";

const retiredSlugs = ["pool-equipment-electrical", "transfer-switch"];
const currentProductSources = [
  { path: "prisma/seed.ts", keyFor: (slug: string) => `slug: "${slug}"` },
  { path: "components/marketing/trades/electricalTemplate.ts", keyFor: (slug: string) => `"key": "${slug}"` },
  { path: "lib/serviceImages.ts", keyFor: (slug: string) => `"${slug}": {` },
  { path: "prisma/seed-labor-hours.ts", keyFor: (slug: string) => `"${slug}",` },
];
for (const slug of retiredSlugs) {
  for (const source of currentProductSources) assert.ok(!readFileSync(source.path, "utf8").includes(source.keyFor(slug)), `${source.path} does not expose or provision retired service ${slug}`);
  assert.ok(!indexedElectricalLaborFamilies().has(slug), `labor families no longer classify ${slug}`);
  assert.ok(!buildElectricalServiceLaborReadiness().some((row) => row.serviceSlug === slug), `readiness no longer counts ${slug}`);
  assert.ok(!ELECTRICAL_ATOMIC_LABOR_RECIPES.some((recipe) => recipe.appliesTo.includes(slug)), `no service recipe remains for ${slug}`);
}

for (const operationKey of [
  "ELEC_INSTALL_TRANSFER_SWITCH",
  "ELEC_TRANSFER_BRANCH_CIRCUIT",
  "ELEC_EXTERIOR_CONDUIT",
  "ELEC_PULL_POWER_CONDUCTORS",
  "ELEC_TERMINATE_OUTDOOR_EQUIPMENT",
  "ELEC_INSTALL_BONDING_CONDUCTOR",
  "ELEC_INSTALL_EQUIPOTENTIAL_BOND",
]) assert.ok(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.some((operation) => operation.key === operationKey), `${operationKey} remains canonical for future narrowly defined work`);

console.log("broad-service retirement: pool equipment and transfer switch are absent from the launch product while their reusable atomic operations remain canonical");
