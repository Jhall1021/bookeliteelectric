import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const page = readFileSync("app/dashboard/setup/page.tsx", "utf8");
const panel = readFileSync("app/dashboard/setup/LaborSetupPanel.tsx", "utf8");
const route = readFileSync("app/api/portal/labor-setup/route.ts", "utf8");

ok(page.includes("<LaborSetupPanel"), "pricing setup renders one unified labor panel");
ok(!page.includes("<AtomicLaborWizardPanel") && !page.includes("<ServiceLaborReviewPanel"), "the repeated calibration and service-approval panels are no longer rendered");
ok(panel.includes("Review the prepared labor times once"), "the unified panel explains the single-review model");
ok(panel.includes("Preview calculated service times"), "service totals are a preview instead of a second approval task");
ok(route.includes("saveLaborOperationDecisions"), "edited atomic units remain the labor authority");
ok(route.includes("projectElectricalServiceLabor") && route.includes("saveServicePricingInputs"), "bounded service durations update automatically from atomic units");
ok(route.includes("published: false"), "saving labor cannot claim to publish customer prices");
ok(route.includes('projection.kind === "NO_STANDARD_SCOPE"'), "route-priced services remain quantity-driven instead of receiving a fabricated fixed duration");

console.log(`UNIFIED LABOR SETUP — ${checks}/${checks} checks passed`);
