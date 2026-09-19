import fs from "node:fs";
import path from "node:path";
import { ELECTRICAL_LABOR_FAMILIES, indexedElectricalLaborFamilies } from "../lib/electrical/laborCoverageFamilies";

type Issue = { code: string; detail: string };
type Route = {
  serviceSlug: string;
  serviceName: string;
  serviceActive: boolean;
  priceable: boolean;
  pathCount: number;
  issues: Issue[];
};
type Ledger = { generatedAt: string; routes: Route[] };

const root = process.cwd();
const ledgerPath = path.join(root, "docs/audits/electrical-labor-coverage-ledger.json");
const outputJson = path.join(root, "docs/audits/electrical-labor-family-queue.json");
const outputMarkdown = path.join(root, "docs/audits/electrical-labor-family-queue.md");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as Ledger;
const familyIndex = indexedElectricalLaborFamilies();

const services = new Map<string, { name: string; active: boolean; routes: Route[] }>();
for (const route of ledger.routes) {
  const current = services.get(route.serviceSlug) ?? { name: route.serviceName, active: route.serviceActive, routes: [] };
  current.routes.push(route);
  services.set(route.serviceSlug, current);
}

const missing = [...services.keys()].filter((slug) => !familyIndex.has(slug));
if (missing.length) throw new Error(`Services missing from labor families: ${missing.join(", ")}`);

const families = ELECTRICAL_LABOR_FAMILIES.map((family) => {
  const rows = family.serviceSlugs.map((slug) => {
    const service = services.get(slug);
    if (!service) throw new Error(`Family service missing from ledger: ${slug}`);
    const priceable = service.routes.filter((route) => route.priceable);
    const issueCounts: Record<string, number> = {};
    for (const route of priceable) {
      for (const code of new Set(route.issues.map((issue) => issue.code))) {
        issueCounts[code] = (issueCounts[code] ?? 0) + 1;
      }
    }
    return {
      slug,
      name: service.name,
      active: service.active,
      routeGroups: service.routes.length,
      priceableRouteGroups: priceable.length,
      cleanPriceableRouteGroups: priceable.filter((route) => route.issues.length === 0).length,
      priceablePaths: priceable.reduce((sum, route) => sum + route.pathCount, 0),
      issueCounts,
    };
  });
  const issueCounts: Record<string, number> = {};
  for (const row of rows) for (const [code, count] of Object.entries(row.issueCounts)) issueCounts[code] = (issueCounts[code] ?? 0) + count;
  return {
    key: family.key,
    name: family.name,
    status: family.status,
    serviceCount: rows.length,
    activeServiceCount: rows.filter((row) => row.active).length,
    priceableRouteGroups: rows.reduce((sum, row) => sum + row.priceableRouteGroups, 0),
    cleanPriceableRouteGroups: rows.reduce((sum, row) => sum + row.cleanPriceableRouteGroups, 0),
    priceablePaths: rows.reduce((sum, row) => sum + row.priceablePaths, 0),
    issueCounts,
    services: rows,
  };
});

const report = {
  schemaVersion: 1,
  sourceLedgerGeneratedAt: ledger.generatedAt,
  generatedAt: new Date().toISOString(),
  scope: "Every service in the 82-service Electrical catalog, including inactive variants and internal fixtures.",
  families,
};
fs.writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);

const md: string[] = [
  "# Electrical labor family queue",
  "",
  "> Generated from `electrical-labor-coverage-ledger.json` and the checked family registry. Do not edit totals by hand.",
  "",
  "This queue covers every catalog service exactly once. `ATOMIC_STARTED` means decomposition has begun; it does not mean every route is complete or calibrated.",
  "",
  "| Family | Status | Services | Active | Priceable outcomes | Structurally clean | Priceable paths |",
  "|---|---:|---:|---:|---:|---:|---:|",
];
for (const family of families) {
  md.push(`| ${family.name} | ${family.status} | ${family.serviceCount} | ${family.activeServiceCount} | ${family.priceableRouteGroups} | ${family.cleanPriceableRouteGroups} | ${family.priceablePaths} |`);
}
for (const family of families) {
  md.push("", `## ${family.name}`, "", `Status: **${family.status}**`, "", "| Service | Active | Priceable outcomes | Clean | Principal gaps |", "|---|---:|---:|---:|---|");
  for (const service of family.services) {
    const gaps = Object.entries(service.issueCounts).sort((a, b) => b[1] - a[1]).map(([code, count]) => `${code} (${count})`).join(", ") || "none detected";
    md.push(`| ${service.name} \`${service.slug}\` | ${service.active ? "yes" : "no"} | ${service.priceableRouteGroups} | ${service.cleanPriceableRouteGroups} | ${gaps} |`);
  }
}
md.push("");
fs.writeFileSync(outputMarkdown, md.join("\n"));
console.log(`Wrote ${path.relative(root, outputJson)} and ${path.relative(root, outputMarkdown)} (${services.size} services).`);
