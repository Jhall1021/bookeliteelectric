import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";

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
ok(section.includes('value: "existing_hood"') && section.includes('routeAction: "PHOTO_REVIEW"') && section.includes("photosBlockBooking: true"), "existing hood and feed conversion require review");
ok(!section.includes("priceModifierCents: 7500"), "legacy $75 feed-conversion guess is removed");
ok(section.includes('value: "no_power_no_hood"') && section.includes("you'll also need a dedicated circuit run"), "no-power branch remains an explicit mount-only package with separate circuit work");

console.log(`\nNEW MICROWAVE LABOR RUNTIME — ${checks}/${checks} checks passed`);
