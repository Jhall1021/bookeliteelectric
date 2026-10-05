import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import {
  calculateMicrowaveHoodConversionPricing,
  MICROWAVE_HOOD_MATERIAL_KEYS,
  MICROWAVE_HOOD_OPERATION_KEYS,
  resolveMicrowaveHoodLaborHours,
} from "../lib/electrical/microwaveHoodPricing";

let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); };
const decisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => ({ operationKey: operation.key, hoursPerUnit: 0.5, source: "DIRECT" as const }));
const projection = projectElectricalServiceLabor("install-new-microwave", decisions);

ok(projection.kind === "READY_FOR_APPROVAL", "prepared/mount-only microwave package produces a reviewable atomic duration");
if (projection.kind === "READY_FOR_APPROVAL") {
  ok(projection.projection.lines.length === 1 && projection.projection.lines[0].operationKey === "ELEC_MOUNT_NEW_OTR_MICROWAVE", "base package includes mounting without silently adding hood or feed-conversion labor");
}

const tree = readFileSync("prisma/seed-questions.ts", "utf8");
const section = tree.slice(tree.indexOf("// Install New Microwave"), tree.indexOf("async function seedSafetyProtection"));
ok(section.includes('value: "existing_power"') && section.includes('routeAction: "RESOLVE_INSTANT"'), "existing cabinet power prices immediately");
ok(section.includes('value: "existing_hood"') && section.includes("priceModifierCents: hoodConversion.priceModifierCents") && section.includes("addFieldLaborHours: hoodConversion.addFieldLaborHours"), "existing hood adds the established removal and feed-conversion scope without review");
ok(section.includes('value: "no_power_no_hood"') && section.includes('routeAction: "REROUTE_SERVICE"') && section.includes("rerouteServiceId: dedicatedCircuit.id"), "no-power branch reroutes into the canonical dedicated-circuit flow");

const pricing = calculateMicrowaveHoodConversionPricing({
  service: {
    fieldLaborHours: 2.02,
    materialCostCents: 500,
    estimatedMinutes: 121,
    requiresTechCount: 1,
    materialMultiplier: 2,
    permitAdminCents: 0,
    otherDirectCostCents: 0,
    isPrimaryEligible: true,
    laborCrewType: "ELECTRICIAN",
  },
  settings: {
    crewHourRateCents: 32500,
    electricianHourRateCents: 25000,
    primaryMinimumCents: 25000,
    roundingIncrementCents: 500,
    defaultPermitAdminCents: 0,
  },
  laborHoursByOperation: new Map(MICROWAVE_HOOD_OPERATION_KEYS.map((key, index) => [key, index === 0 ? 0.25 : 0.65])),
  materialCostByKey: new Map(MICROWAVE_HOOD_MATERIAL_KEYS.map((key) => [key, 200])),
});
ok(pricing.addFieldLaborHours === 0.9 && pricing.addScheduleMinutes === 54, "hood conversion uses the two existing labor codes and adds their real duration");
ok(pricing.addMaterialCostCents === 600 && pricing.priceModifierCents > 0, "hood conversion includes the box, receptacle and plate and produces a positive approved increment");
ok(resolveMicrowaveHoodLaborHours(new Map()).size === 2, "the two existing platform labor baselines supply uncalibrated contractor operations");

console.log(`\nNEW MICROWAVE LABOR RUNTIME — ${checks}/${checks} checks passed`);
