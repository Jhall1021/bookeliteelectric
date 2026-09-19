import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ELECTRICAL_CORE_CALIBRATION_SCENARIOS } from "../lib/electrical/laborCalibrationWizard";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const page = read("app/dashboard/setup/page.tsx");
const panel = read("app/dashboard/setup/AtomicLaborWizardPanel.tsx");
const route = read("app/api/portal/labor-calibration/route.ts");

ok(ELECTRICAL_CORE_CALIBRATION_SCENARIOS.length === 8, "setup uses exactly eight core calibration scenarios");
ok(page.includes("AtomicLaborWizardPanel"), "pricing foundation renders the atomic wizard");
ok(!page.includes('from "./LaborWizardPanel"') && !page.includes("resolveTaskEligibility"), "pricing foundation no longer loads the three-task service wizard");
ok(page.includes("contractorLaborScenarioAnswer.findMany"), "saved scenario evidence is loaded for resume");
ok(panel.includes("Question {index + 1} of 8"), "wizard presents one bounded question at a time");
ok(panel.includes("Published comparison:") && panel.includes("bookComparison.caution"), "published evidence retains its scope caution");
ok(panel.includes('kind: "scenario-answers"'), "wizard saves scenario evidence rather than service values");
ok(panel.includes('kind: "operation-decisions"'), "review saves explicitly selected atomic decisions through the separate boundary");
ok(panel.includes("Nothing is preselected"), "operation proposals are opt-in rather than silently accepted");
ok(panel.includes("selectedOperations.has(proposal.operationKey)"), "only contractor-selected operation rows are submitted");
ok(!panel.includes("fieldLaborHours") && !route.includes("fieldLaborHours"), "new wizard and endpoint cannot write whole-service labor");
ok(!panel.includes("basePrice") && !route.includes("basePrice"), "new wizard and endpoint cannot publish a price");
ok(route.includes("db.$transaction"), "each calibration batch is transactional");
ok(panel.includes("Nothing is copied into a service or customer price automatically"), "contractor sees the no-auto-publish boundary before starting");
ok(panel.includes("supporting evidence only—not an automatic multiplier"), "speed signal is presented as supporting evidence only");

console.log(`ATOMIC LABOR WIZARD CONTRACT — ${checks}/${checks} checks passed`);
