import { strict as assert } from "node:assert";
import { computeRecessedLightingMaterialTakeoff } from "../lib/electrical/recessedLightingMaterialTakeoff";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`  ✓ ${message}`); };
const selections = [
  { role: "RECESSED_WAFER", packageQuantity: 1, packageUnit: "each", packagePriceCents: 3000 },
  { role: "WIRE_14_2", packageQuantity: 250, packageUnit: "ft", packagePriceCents: 12500 },
  { role: "CONSUMABLES_SMALL", packageQuantity: 1, packageUnit: "job", packagePriceCents: 300 },
  { role: "NM_CABLE_SUPPORT", packageQuantity: 1, packageUnit: "each", packagePriceCents: 10 },
];

const layout = computeRecessedLightingMaterialTakeoff({ lightCount: 4, installedCablePathFeet: 32, totalCableSlackFeet: 8, nmCableSupportCount: 9, selections });
ok(layout.purchaseComplete, "four-light layout resolves when count, measured cable path, slack, and products are established");
ok(layout.physicalRequirements.some((item) => item.role === "RECESSED_WAFER" && item.quantity === 4), "four requested lights require four wafer assemblies");
ok(layout.physicalRequirements.some((item) => item.role === "WIRE_14_2" && item.quantity === 40), "32 installed feet plus eight explicit slack feet requires 40 cable feet");
ok(layout.physicalRequirements.some((item) => item.role === "CONSUMABLES_SMALL" && item.quantity === 1), "the bounded consumables package is counted once per job, not once per additional light");
ok(layout.physicalRequirements.some((item) => item.role === "NM_CABLE_SUPPORT" && item.quantity === 9), "policy-derived accessible cable supports are included in the same material takeoff");

const longLayout = computeRecessedLightingMaterialTakeoff({ lightCount: 4, installedCablePathFeet: 55, totalCableSlackFeet: 8, nmCableSupportCount: 14, selections });
ok(longLayout.physicalRequirements.some((item) => item.role === "WIRE_14_2" && item.quantity === 63), "the same four lights can consume 63 feet when the actual layout is longer");

const missingPath = computeRecessedLightingMaterialTakeoff({ lightCount: 4, installedCablePathFeet: null, totalCableSlackFeet: 8, nmCableSupportCount: 9, selections });
ok(!missingPath.purchaseComplete && missingPath.unresolvedRequirements.some((gap) => gap.code === "LIGHTING_LAYOUT_NOT_ESTABLISHED"), "missing layout footage refuses instead of substituting ten feet per light");
const missingSlack = computeRecessedLightingMaterialTakeoff({ lightCount: 4, installedCablePathFeet: 32, totalCableSlackFeet: null, nmCableSupportCount: 9, selections });
ok(!missingSlack.purchaseComplete && missingSlack.unresolvedRequirements.some((gap) => gap.code === "LIGHTING_CABLE_ALLOWANCE_NOT_ESTABLISHED"), "missing slack refuses instead of hiding an allowance in the cable quantity");

const finishedLayout = computeRecessedLightingMaterialTakeoff({ lightCount: 4, installedCablePathFeet: 32, totalCableSlackFeet: 8, nmCableSupportCount: 0, selections: selections.filter((selection) => selection.role !== "NM_CABLE_SUPPORT") });
ok(finishedLayout.purchaseComplete && !finishedLayout.physicalRequirements.some((item) => item.role === "NM_CABLE_SUPPORT"), "a zero-support layout does not require or price an unused support product");

console.log(`\nRECESSED LIGHTING MATERIAL TAKEOFF — ${checks}/${checks} checks passed`);
