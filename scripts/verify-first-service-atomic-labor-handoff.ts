import fs from "node:fs";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  checks += 1;
  console.log(`  ✓ ${message}`);
};
const read = (path: string) => fs.readFileSync(path, "utf8");

const data = read("lib/electrical/firstServiceWizardData.ts");
const ui = read("app/dashboard/first-service/FirstServiceWizard.tsx");
const readiness = read("lib/electrical/onboardingPilotReadiness.ts");

ok(data.includes("contractorLaborOperationDecision.findMany"), "first-service data reads the atomic decision authority");
ok(data.includes("ELECTRICAL_SURFACE_RACEWAY_ROUTE"), "first-service labor list comes from the same route recipe as pricing");
ok(!data.includes("contractorComponent.findMany"), "first-service data no longer reads bundled component labor");
ok(!ui.includes("/api/admin/component-labor"), "first-service UI no longer writes values the route price engine ignores");
ok(ui.includes("/dashboard/setup#labor") && ui.includes("Complete labor setup"), "unfinished labor hands off to the shared atomic setup");
ok(ui.includes("individual physical labor operations") && ui.includes("same approved units"), "contractor-facing copy explains reuse without implementation jargon");
ok(readiness.includes('priced.code === "ATOMIC_LABOR_NOT_ESTABLISHED"'), "pilot readiness keeps the contractor on LABOR for missing atomic units");

console.log(`\nFIRST SERVICE ATOMIC LABOR HANDOFF — ${checks}/${checks} checks passed`);
