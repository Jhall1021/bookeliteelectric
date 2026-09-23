/**
 * Read-only audit of platform labor-baseline coverage for the atomic
 * Electrical service recipes.
 *
 * This intentionally does not query ContractorLaborOperationDecision. A
 * rehearsal tenant's fixture answers must never make the platform baseline
 * appear complete. Numeric published references are also separated by
 * evidence status so PARTIAL planning values are not reported as VERIFIED.
 */
import {
  ELECTRICAL_ATOMIC_LABOR_OPERATIONS,
  ELECTRICAL_ATOMIC_LABOR_RECIPES,
} from "../lib/electrical/atomicLabor";
import { electricalPlatformLaborBaselineByOperation } from "../lib/electrical/platformLaborBaseline";

const operationByKey = new Map(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, operation]));
const reachableKeys = new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES.flatMap((recipe) => recipe.lines.map((line) => line.operationKey)));
const reachable = [...reachableKeys].map((key) => {
  const operation = operationByKey.get(key);
  if (!operation) throw new Error(`recipe references missing operation ${key}`);
  return operation;
}).sort((a, b) => a.key.localeCompare(b.key));

const verified = reachable.filter((operation) => electricalPlatformLaborBaselineByOperation.get(operation.key)?.status === "PUBLISHED_REFERENCE" && operation.referenceStatus === "VERIFIED");
const provisional = reachable.filter((operation) => electricalPlatformLaborBaselineByOperation.get(operation.key)?.status === "PUBLISHED_REFERENCE" && operation.referenceStatus === "PARTIAL");
const workbookPlanning = reachable.filter((operation) => electricalPlatformLaborBaselineByOperation.get(operation.key)?.status === "WORKBOOK_PLANNING_FACTOR");
const disputed = reachable.filter((operation) => operation.referenceStatus === "DISPUTED");
const missing = reachable.filter((operation) => !electricalPlatformLaborBaselineByOperation.has(operation.key));

console.log("\nELECTRICAL PLATFORM LABOR BASELINE COVERAGE — READ ONLY\n");
console.log(`  installed atomic operations: ${ELECTRICAL_ATOMIC_LABOR_OPERATIONS.length}`);
console.log(`  operations reachable from service recipes: ${reachable.length}`);
console.log(`  verified numeric references: ${verified.length}`);
console.log(`  provisional numeric references: ${provisional.length}`);
console.log(`  workbook planning baselines: ${workbookPlanning.length}`);
console.log(`  reachable operations without a numeric platform value: ${missing.length}`);
console.log(`  reachable operations carrying disputed evidence: ${disputed.length}`);
console.log("  contractor decisions consulted: 0\n");

for (const operation of missing) {
  console.log(`  ✗ ${operation.key} — ${operation.name} [${operation.referenceStatus}]`);
}

console.log();
if (missing.length > 0) process.exitCode = 1;
