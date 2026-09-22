/** Static contract for the rehearsal-only catalog outcome audit. */
import { readFileSync } from "node:fs";

const src = readFileSync("scripts/audit-electrical-storefront-outcomes.ts", "utf8");
let pass = 0, fail = 0;
const ok = (label: string, condition: boolean) => {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}`);
};

console.log("\nELECTRICAL STOREFRONT OUTCOME AUDIT CONTRACT\n");
ok("targets REHEARSAL_DATABASE_URL, never ambient DATABASE_URL", /const rehearsalUrl = process\.env\.REHEARSAL_DATABASE_URL/.test(src));
ok("proves the target is a rehearsal branch", /classifyRehearsalTarget\(rehearsalUrl, process\.env\.DATABASE_URL\)/.test(src));
ok("accepts only the designated disposable contractor prefix", /startsWith\("rv2-pilot-rehearsal-"\)/.test(src));
ok("loads the complete contractor catalog", /loadCatalogForResolution/.test(src));
ok("audits inactive installed services too", /filter\(\(s\) => s\.tradeKey === "electrical"\)/.test(src));
ok("reports active, inactive and tree coverage separately", /activeServices/.test(src) && /servicesWithoutQuestions/.test(src));
ok("separates inactive setup gaps from runtime mismatches", /INACTIVE_READINESS_GAP/.test(src) && /inactiveReadinessPaths/.test(src));
ok("treats an inactive troubleshooting destination as setup, not a broken source tree", /inactiveTroubleshootingDependency/.test(src) && /no active TROUBLESHOOT_ONLY service/.test(src));
ok("uses the homeowner-facing derived pricing bridge", /resolveRouteWithDerivedPricing/.test(src));
ok("checks primary and add-on contexts", /for \(const isPrimary of \[true, false\]\)/.test(src));
ok("probes numeric low, middle and high values", /first \+ hi/.test(src) && /decimal\(hi\)/.test(src));
ok("compares instant, review and reroute terminal promises", /RESOLVE_INSTANT/.test(src) && /PHOTO_REVIEW/.test(src) && /REROUTE_SERVICE/.test(src));
ok("recognizes turned surface routes as review-bound", /hasManualSurfaceTurns/.test(src) && /SURFACE_KEYS\.flat/.test(src));
ok("contains no database mutation call", !/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(src));
ok("writes a full diagnostic report outside the repository", /\/tmp\/electrical-storefront-outcome-audit\.json/.test(src));

console.log(`\n  ${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
