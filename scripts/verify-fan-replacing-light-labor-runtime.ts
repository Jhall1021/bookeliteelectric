import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";

let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); };
const decisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => ({ operationKey: operation.key, hoursPerUnit: 0.5, source: "DIRECT" as const }));
const projection = projectElectricalServiceLabor("fan-replacing-light", decisions);

ok(projection.kind === "READY_FOR_APPROVAL", "light-to-fan standard package produces a reviewable atomic duration");
if (projection.kind === "READY_FOR_APPROVAL") {
  const quantities = Object.fromEntries(projection.projection.lines.map((line) => [line.operationKey, line.quantity]));
  ok(quantities.ELEC_REMOVE_LIGHT_FIXTURE === 1, "standard package removes the existing light once");
  ok(quantities.ELEC_INSTALL_FAN_RATED_BOX === 1, "standard package includes fan-rated support labor once");
  ok(quantities.ELEC_INSTALL_NEW_CEILING_FAN === 1, "standard package installs the new fan once");
}

const materials = readFileSync("prisma/seed-materials.ts", "utf8");
const packageSection = materials.slice(materials.indexOf("POLICY[fan_support]"), materials.indexOf('slug: "remove-and-replace-existing-chandelier"'));
ok(packageSection.includes('slug: "fan-replacing-light"') && packageSection.includes('["BOX_FAN_RATED", 1]'), "labor matches the canonical one-box material allowance");
ok(packageSection.includes("asking a homeowner") && packageSection.includes("is asking them to do a survey"), "package preserves the no-homeowner-diagnosis boundary");

console.log(`\nFAN REPLACING LIGHT LABOR RUNTIME — ${checks}/${checks} checks passed`);
