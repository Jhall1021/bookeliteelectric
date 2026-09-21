import fs from "node:fs";
import path from "node:path";
import { buildElectricalServiceLaborReadiness } from "../lib/electrical/serviceLaborReadiness";

const rows = buildElectricalServiceLaborReadiness();
const outDir = path.join(process.cwd(), "docs/audits");
const counts = Object.fromEntries([...new Set(rows.map((row) => row.state))].sort().map((state) => [state, rows.filter((row) => row.state === state).length]));
const priceable = rows.filter((row) => row.state !== "NON_PRICEABLE_REVIEW" && row.state !== "INTERNAL_FIXTURE");
const summary = {
  serviceCount: rows.length,
  priceableServiceCount: priceable.length,
  servicesWithAtomicRecipes: rows.filter((row) => row.recipeKeys.length > 0).length,
  priceableServicesWithMissingScopeFacts: priceable.filter((row) => row.missingScopeFacts.length > 0).length,
  priceableServicesWithCompleteScopeCollectionDesign: priceable.filter((row) => row.scopeFactsWithoutCollectionPath.length === 0).length,
  priceableServicesNeedingCalibration: priceable.filter((row) => row.operationsNeedingCalibration.length > 0).length,
  priceableServicesWithCompleteWizardPaths: priceable.filter((row) => row.operationsWithoutWizardPath.length === 0).length,
  priceableServicesRuntimeConnected: priceable.filter((row) => row.runtimeConnection === "CONNECTED").length,
  stateCounts: counts,
};

fs.writeFileSync(path.join(outDir, "electrical-service-labor-readiness.json"), `${JSON.stringify({ summary, services: rows }, null, 2)}\n`);
const lines = [
  "# Electrical service labor readiness",
  "",
  "Generated from the executable 81-service family registry and atomic labor library. A recipe is not a published price: physical scope, contractor calibration, explicit approval, and runtime connection remain separate gates.",
  "",
  `- Catalog services: **${summary.serviceCount}**`,
  `- Priceable services: **${summary.priceableServiceCount}**`,
  `- Services with atomic recipes: **${summary.servicesWithAtomicRecipes}**`,
  `- Priceable services still missing standard physical facts: **${summary.priceableServicesWithMissingScopeFacts}**`,
  `- Priceable services whose missing facts all have an explicit collection path: **${summary.priceableServicesWithCompleteScopeCollectionDesign}**`,
  `- Priceable services still needing one or more operation calibrations: **${summary.priceableServicesNeedingCalibration}**`,
  `- Priceable services whose operations all have a direct-question or calibration-family path: **${summary.priceableServicesWithCompleteWizardPaths}**`,
  `- Priceable services connected to atomic runtime pricing: **${summary.priceableServicesRuntimeConnected}**`,
  "",
  "| Service | Family | State | Missing physical facts | Collection groups | Collection gaps | Operations needing calibration | Direct checks | Calibration families | Wizard gaps | Runtime |",
  "|---|---|---|---|---|---:|---:|---|---|---:|---|",
  ...rows.map((row) => `| ${row.serviceSlug} | ${row.familyKey} | ${row.state} | ${row.missingScopeFacts.join(", ") || "—"} | ${row.scopeFactCollectionGroupKeys.join(", ") || "—"} | ${row.scopeFactsWithoutCollectionPath.length} | ${row.operationsNeedingCalibration.length} | ${row.directCalibrationScenarioKeys.join(", ") || "—"} | ${row.calibrationGroupKeys.join(", ") || "—"} | ${row.operationsWithoutWizardPath.length} | ${row.runtimeConnection} |`),
  "",
];
fs.writeFileSync(path.join(outDir, "electrical-service-labor-readiness.md"), `${lines.join("\n")}\n`);
console.log(`Wrote labor readiness for ${summary.serviceCount} services.`);
