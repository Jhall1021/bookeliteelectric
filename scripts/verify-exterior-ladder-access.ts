import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyBranch, customerPrice, startConfiguration } from "../lib/pricing";

let checks = 0;
const ok = (condition: unknown, label: string) => {
  assert.ok(condition, label);
  checks++;
  console.log(`  ✓ ${label}`);
};

const generic = readFileSync("prisma/seed-height-access.ts", "utf8");
const exterior = readFileSync("prisma/seed-exterior-ladder-access.ts", "utf8");

for (const slug of [
  "replace-exterior-light-fixture",
  "replace-motion-flood-light",
  "floodlight-camera-existing",
]) {
  ok(exterior.includes(`"${slug}"`), `${slug} uses exterior ladder access`);
  ok(!generic.includes(`"${slug}"`), `${slug} is excluded from indoor height/access`);
}

ok(exterior.includes('prompt: "What kind of ladder is needed to reach the existing fixture?"'), "customer is asked about ladder type rather than ceiling height");
ok(!/label:.*(?:stairs|furniture)|prompt:.*(?:stairs|furniture)|helpText:.*(?:stairs|furniture)/i.test(exterior), "exterior customer copy contains no indoor obstruction wording");
ok(exterior.includes("EXTENSION_LADDER_LABOR_HOURS = 0.5"), "extension ladder adds one-half crew-hour");
ok(exterior.includes("EXTENSION_LADDER_SCHEDULE_MINUTES = 30"), "extension ladder reserves thirty additional minutes");
ok(exterior.includes('value: "other_or_unsure"') && exterior.includes('routeAction: "PHOTO_REVIEW"'), "unusual or uncertain access requires photo review");

const base = startConfiguration({
  fieldLaborHours: 1.07,
  materialCostCents: 0,
  estimatedMinutes: 65,
  requiresTechCount: 1,
});
const extension = applyBranch(base, {
  approvedComponentPriceCents: 9000,
  addFieldLaborHours: 0.5,
  addScheduleMinutes: 30,
});
ok(extension.fieldLaborHours === 1.57, "extension ladder changes operational labor from 1.07 to 1.57 hours");
ok(extension.estimatedMinutes === 95, "extension ladder changes the scheduled duration by thirty minutes");
ok(customerPrice(extension, 29000).totalCents === 38000, "approved labor increment is added to the published customer price");

console.log(`\nEXTERIOR LADDER ACCESS — ${checks}/${checks} checks passed`);
