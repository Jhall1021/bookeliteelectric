import fs from "node:fs";
import path from "node:path";
import { buildElectricalStandardScenarios } from "../lib/electrical/standardLaborScenarios";
import { indexedElectricalLaborFamilies } from "../lib/electrical/laborCoverageFamilies";

const scenarios = buildElectricalStandardScenarios();
const families = indexedElectricalLaborFamilies();
const rows = scenarios.map((scenario) => ({
  ...scenario,
  family: families.get(scenario.serviceSlug)!.name,
}));
const summary = {
  serviceCount: rows.length,
  standardCount: rows.filter((row) => row.kind === "STANDARD").length,
  routeSpecificCount: rows.filter((row) => row.kind === "NO_STANDARD").length,
};

const outDir = path.join(process.cwd(), "docs/audits");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "electrical-standard-labor-scenarios.json"),
  `${JSON.stringify({ summary, services: rows }, null, 2)}\n`,
);

const lines = [
  "# Electrical standard labor scenarios",
  "",
  "Generated from the executable atomic recipes. A standard means only that the physical quantities are bounded; it does not approve labor, duration, or price.",
  "",
  `- Priceable services classified: **${summary.serviceCount}**`,
  `- Bounded standard scopes: **${summary.standardCount}**`,
  `- Route/job-specific scopes: **${summary.routeSpecificCount}**`,
  "- Publish authority: **none**",
  "",
  "## Bounded standard scopes",
  "",
  "| Service | Family | Recipe | Physical basis |",
  "|---|---|---|---|",
  ...rows.filter((row) => row.kind === "STANDARD").map((row) =>
    `| \`${row.serviceSlug}\` | ${row.family} | \`${row.recipeKey}\` | ${row.source}; ${Object.entries(row.quantities).map(([key, value]) => `${key}×${value}`).join(", ")} |`,
  ),
  "",
  "## No honest standard scope",
  "",
  "These services need facts from the actual route, equipment, or selected option. Missing facts are shown rather than replaced by zeroes or averages.",
  "",
  "| Service | Family | Recipe | Required facts |",
  "|---|---|---|---|",
  ...rows.filter((row) => row.kind === "NO_STANDARD").map((row) =>
    `| \`${row.serviceSlug}\` | ${row.family} | \`${row.recipeKey}\` | ${row.missingFacts.join(", ") || row.invalidConditions.join(", ")} |`,
  ),
  "",
];
fs.writeFileSync(path.join(outDir, "electrical-standard-labor-scenarios.md"), `${lines.join("\n")}\n`);
console.log(`Wrote Electrical standard-scenario audit: ${summary.standardCount} bounded, ${summary.routeSpecificCount} route/job-specific.`);

