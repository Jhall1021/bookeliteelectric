import fs from "node:fs";
import path from "node:path";
import { buildElectricalLaborScopeImplementationLedger } from "../lib/electrical/laborScopeImplementationLedger";

const rows = buildElectricalLaborScopeImplementationLedger();
const counts = Object.fromEntries([...new Set(rows.map((row) => row.state))].sort().map((state) => [state, rows.filter((row) => row.state === state).length]));
const summary = {
  collectionTaskCount: rows.length,
  affectedServiceCount: new Set(rows.flatMap((row) => row.serviceSlugs)).size,
  stateCounts: counts,
  tasksFullyRuntimeConnected: rows.filter((row) => row.servicesAwaitingRuntimeConnection.length === 0).length,
  tasksWithAnyRuntimeConnection: rows.filter((row) => row.runtimeConnectedServiceSlugs.length > 0).length,
  sourceAuthorityMismatchCount: rows.filter((row) => row.state === "SOURCE_AUTHORITY_MISMATCH").length,
};
const outDir = path.join(process.cwd(), "docs/audits");
fs.writeFileSync(path.join(outDir, "electrical-labor-scope-implementation.json"), `${JSON.stringify({ summary, tasks: rows }, null, 2)}\n`);

const lines = [
  "# Electrical labor scope implementation ledger",
  "",
  "This distinguishes a designed collection path from capture code, takeoff-engine support and an actual runtime connection. A row is not complete merely because Route Assist or a formula exists.",
  "",
  `- Affected services: **${summary.affectedServiceCount}**`,
  `- Grouped collection tasks: **${summary.collectionTaskCount}**`,
  `- Tasks fully runtime connected: **${summary.tasksFullyRuntimeConnected}**`,
  `- Tasks with any runtime connection: **${summary.tasksWithAnyRuntimeConnection}**`,
  `- Source-authority mismatches: **${summary.sourceAuthorityMismatchCount}**`,
  "",
  "| Collection task | Path | State | Connected services | Services awaiting connection | Evidence |",
  "|---|---|---|---|---:|---|",
  ...rows.map((row) => `| ${row.collectionGroupKey} | ${row.collectionPath} | ${row.state} | ${row.runtimeConnectedServiceSlugs.join(", ") || "—"} | ${row.servicesAwaitingRuntimeConnection.length} | ${row.evidencePaths.join("; ") || "—"} |`),
  "",
  "## Notes",
  "",
  ...rows.map((row) => `- **${row.collectionGroupKey} / ${row.collectionPath}:** ${row.note}`),
  "",
];
fs.writeFileSync(path.join(outDir, "electrical-labor-scope-implementation.md"), `${lines.join("\n")}\n`);
console.log(`Wrote ${rows.length} electrical labor scope implementation rows.`);
