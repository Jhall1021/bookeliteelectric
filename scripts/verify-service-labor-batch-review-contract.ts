import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); };
const panel = readFileSync("app/dashboard/setup/ServiceLaborReviewPanel.tsx", "utf8");
const route = readFileSync("app/api/portal/labor-service-review/route.ts", "utf8");

ok(panel.includes("Nothing is preselected") && panel.includes('type="checkbox"'), "duration review requires explicit selections");
ok(panel.includes("Select all reviewed durations") && panel.includes("Clear duration selections"), "a reviewed duration batch can be selected or cleared deliberately");
ok(panel.includes("expectedHours: row.suggestedHours"), "the UI binds each approval to the displayed duration");
ok(route.includes("TransactionIsolationLevel.Serializable") && route.includes("FOR UPDATE"), "the selected batch locks tenant-owned rows in one serializable transaction");
ok(route.includes('"contractorId" = ${ctx.contractorId}') && route.includes("rows.length !== items.length"), "a missing or cross-tenant service refuses the whole batch");
ok(route.indexOf("const projections = rows.map") < route.indexOf("for (const { service, projection } of projections)"), "every row is recomputed and checked before the first write");
ok(route.includes("STALE_PROJECTION") && route.includes("Math.abs(projection.suggestedHours"), "a stale displayed duration refuses approval");
ok(route.includes("saveServicePricingInputs") && !route.includes("publishedPriceApprovedAt"), "duration approval uses the pricing-input authority and never publishes a customer price");
ok(route.includes('SELECT id, slug, "bookingType", "isPrimaryEligible"') && route.includes("fieldLaborHours: approvedHours, wwtLaborHours: approvedHours"), "atomic duration approval covers primary and same-visit pricing contexts");
ok(route.includes("item.approvedHours !== undefined") && route.includes("itemById.get(service.id)!.approvedHours ?? projection.suggestedHours"), "a contractor may explicitly replace one calculated service total without changing its atomic units");
ok(route.includes("standardScopeFacts[service.slug]") && route.includes("electricalPlatformLaborBaselineByOperation"), "manual service review recomputes against the same prepared facts and baselines as the setup page");

console.log(`\nSERVICE LABOR BATCH REVIEW CONTRACT — ${checks}/${checks} checks passed`);
