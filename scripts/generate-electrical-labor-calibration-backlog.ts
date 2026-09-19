import fs from "node:fs";
import path from "node:path";
import {
  ELECTRICAL_ATOMIC_LABOR_OPERATIONS as operations,
  ELECTRICAL_ATOMIC_LABOR_RECIPES as recipes,
  ELECTRICAL_LABOR_CALIBRATION_GROUPS as groups,
} from "../lib/electrical/atomicLabor";

const outDir = path.join(process.cwd(), "docs/audits");
const groupByOperation = new Map<string, string[]>();
for (const group of groups) {
  for (const key of [...group.anchorOperationKeys, ...group.relatedOperationKeys]) {
    groupByOperation.set(key, [...(groupByOperation.get(key) ?? []), group.key]);
  }
}

const ungrouped = operations.filter((operation) => !groupByOperation.has(operation.key));
if (ungrouped.length) throw new Error(`Ungrouped labor operations: ${ungrouped.map((operation) => operation.key).join(", ")}`);

const rows = operations.map((operation) => {
  const usedBy = recipes.filter((recipe) => recipe.lines.some((line) => line.operationKey === operation.key));
  const disposition = operation.referenceStatus === "VERIFIED" && operation.referenceLaborHours !== null
    ? "REFERENCE_READY"
    : operation.referenceLaborHours !== null
      ? "CONTRACTOR_CONFIRM_REFERENCE"
      : "CONTRACTOR_INPUT_REQUIRED";
  return {
    key: operation.key,
    name: operation.name,
    unit: operation.unit,
    disposition,
    referenceStatus: operation.referenceStatus,
    referenceLaborHours: operation.referenceLaborHours,
    evidenceCount: operation.evidence.length,
    calibrationGroups: groupByOperation.get(operation.key)!.sort(),
    recipeCount: usedBy.length,
    affectedTargets: [...new Set(usedBy.flatMap((recipe) => recipe.appliesTo))].sort(),
  };
});

const summary = {
  operationCount: rows.length,
  referenceReady: rows.filter((row) => row.disposition === "REFERENCE_READY").length,
  contractorConfirmReference: rows.filter((row) => row.disposition === "CONTRACTOR_CONFIRM_REFERENCE").length,
  contractorInputRequired: rows.filter((row) => row.disposition === "CONTRACTOR_INPUT_REQUIRED").length,
  calibrationGroupCount: groups.length,
  anchorQuestionCount: new Set(groups.flatMap((group) => group.anchorOperationKeys)).size,
};

fs.writeFileSync(path.join(outDir, "electrical-labor-calibration-backlog.json"), `${JSON.stringify({ summary, groups, operations: rows }, null, 2)}\n`);

const lines = [
  "# Electrical labor calibration backlog",
  "",
  "Generated from the executable operation library. This is not a price list and does not approve labor automatically.",
  "",
  `- Operations: **${summary.operationCount}**`,
  `- Calibration families: **${summary.calibrationGroupCount}**`,
  `- Distinct proposed anchor questions: **${summary.anchorQuestionCount}**`,
  `- Reference-ready: **${summary.referenceReady}**`,
  `- Numeric reference requiring contractor confirmation: **${summary.contractorConfirmReference}**`,
  `- Contractor input still required: **${summary.contractorInputRequired}**`,
  "",
  "## Wizard families",
  "",
  "| Family | Ask directly | Propose from relationships | Guardrail |",
  "|---|---|---|---|",
  ...groups.map((group) => `| ${group.name} | ${group.anchorOperationKeys.join("<br>")} | ${group.relatedOperationKeys.join("<br>") || "—"} | ${group.guardrail} |`),
  "",
  "## Operations",
  "",
  "| Operation | Unit | Status | Reference hours | Families | Affected targets |",
  "|---|---:|---|---:|---|---|",
  ...rows.map((row) => `| ${row.name} \`${row.key}\` | ${row.unit} | ${row.disposition} | ${row.referenceLaborHours ?? "—"} | ${row.calibrationGroups.join(", ")} | ${row.affectedTargets.join(", ") || "not yet used"} |`),
  "",
];
fs.writeFileSync(path.join(outDir, "electrical-labor-calibration-backlog.md"), `${lines.join("\n")}\n`);
console.log(`Wrote Electrical calibration backlog: ${summary.operationCount} operations, ${summary.anchorQuestionCount} proposed anchors.`);
