import { strict as assert } from "node:assert";
import { recessedLightingOperationKeys } from "../lib/electrical/lightingRouteAtomicLaborBridge";
import type { RecessedLightingRouteFactInput } from "../lib/electrical/lightingRouteFacts";
import { evaluateRecessedLightingTakeoff } from "../lib/electrical/recessedLightingTakeoff";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`  ✓ ${message}`); };
const source = (value: number | "FINISHED" | null, sourceName: RecessedLightingRouteFactInput[keyof RecessedLightingRouteFactInput]["source"]) => ({ value, source: sourceName });
const facts: RecessedLightingRouteFactInput = {
  access: source("FINISHED", "CUSTOMER_TREE"), lightCount: source(4, "CUSTOMER_TREE"),
  installedCablePathFeet: source(32, "ROUTE_ASSIST_CONFIRMED"), perpendicularCeilingFeet: source(8, "ROUTE_ASSIST_CONFIRMED"),
  framingSpacingInches: source(16, "CONTRACTOR_POLICY"), totalCableSlackFeet: source(8, "CONTRACTOR_POLICY"),
} as RecessedLightingRouteFactInput;
const result = evaluateRecessedLightingTakeoff({
  facts,
  contractorHours: Object.fromEntries(recessedLightingOperationKeys().map((key) => [key, 1])),
  selections: [
    { role: "RECESSED_WAFER", packageQuantity: 1, packageUnit: "each", packagePriceCents: 3000 },
    { role: "WIRE_14_2", packageQuantity: 250, packageUnit: "ft", packagePriceCents: 12500 },
    { role: "CONSUMABLES_SMALL", packageQuantity: 1, packageUnit: "job", packagePriceCents: 300 },
  ],
});
ok(result.kind === "EVALUATED", "one validated layout evaluates labor and materials together");
if (result.kind !== "EVALUATED" || result.labor.kind !== "READY") throw new Error("expected evaluated ready takeoff");
ok(result.labor.quantities.ELEC_FISH_CABLE_CONCEALED === 32, "labor consumes the validated 32-foot cable path");
ok(result.materials.physicalRequirements.some((item) => item.role === "WIRE_14_2" && item.quantity === 40), "materials consume the same 32-foot path plus the explicit eight-foot slack policy");
ok(result.labor.quantities.ELEC_INSTALL_RECESSED_WAFER === 4 && result.materials.physicalRequirements.some((item) => item.role === "RECESSED_WAFER" && item.quantity === 4), "the same exact light count drives installation labor and wafer quantity");

const refused = evaluateRecessedLightingTakeoff({
  facts: { ...facts, installedCablePathFeet: source(null, "ROUTE_ASSIST_CONFIRMED") } as RecessedLightingRouteFactInput,
  contractorHours: {}, selections: [],
});
ok(refused.kind === "INCOMPLETE_FACTS" && refused.missingFacts.includes("installedCablePathFeet"), "neither labor nor materials evaluates when shared route footage is missing");

console.log(`\nRECESSED LIGHTING COMBINED TAKEOFF — ${checks}/${checks} checks passed`);
