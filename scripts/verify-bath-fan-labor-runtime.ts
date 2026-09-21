import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";

let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); };
const decisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => ({ operationKey: operation.key, hoursPerUnit: 0.5, source: "DIRECT" as const }));
const slugs = ["bathroom-fan-light-combo", "replace-bathroom-exhaust-fan", "replace-bathroom-exhaust-fan-with-light"];

for (const slug of slugs) {
  const projection = projectElectricalServiceLabor(slug, decisions);
  ok(projection.kind === "READY_FOR_APPROVAL", `${slug} clean-swap package produces a reviewable atomic duration`);
  if (projection.kind === "READY_FOR_APPROVAL") {
    const lines = projection.projection.lines;
    ok(lines.length === 1 && lines[0].operationKey === "ELEC_REPLACE_BATH_EXHAUST_FAN" && lines[0].quantity === 1, `${slug} baseline excludes unconfirmed housing and duct adaptation`);
  }
}

const packages = readFileSync("scripts/build-fan-packages.ts", "utf8");
ok(packages.includes("standard-size replacement fan") && packages.includes("existing duct") && packages.includes("connection we can reuse"), "contractor-supplied baseline names compatible housing and reusable duct scope");
ok(packages.includes('value: "different"') && packages.includes('action: "PHOTO_REVIEW"'), "different housing or duct scope remains review-only");
ok(packages.includes('value: "unsure"') && packages.includes('action: "PHOTO_REVIEW"'), "uncertain customer scope fails to review rather than assuming compatibility");

const ownerSeed = readFileSync("prisma/seed-bathroom-fans.ts", "utf8");
ok(ownerSeed.includes("beyond a straight swap") && ownerSeed.includes("give you the price before proceeding"), "owner-supplied package discloses adaptation as separately approved work");
ok(ownerSeed.includes("DEFERRED FROM PROMOTION") && ownerSeed.includes("DUCT_CONNECTOR"), "unresolved owner-supplied material role remains visible and is not guessed by this labor connection");

console.log(`\nBATH FAN LABOR RUNTIME — ${checks}/${checks} checks passed`);
