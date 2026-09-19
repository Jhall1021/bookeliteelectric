import { strict as assert } from "node:assert";
import fs from "node:fs";
import { drywallConcealedOperationKeys, evaluateDrywallConcealedAtomicLabor } from "../lib/electrical/drywallConcealedAtomicLaborBridge";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`  ✓ ${message}`); };
const hours = Object.fromEntries(drywallConcealedOperationKeys("OUTLET").map((key) => [key, 1]));
const result = evaluateDrywallConcealedAtomicLabor({
  endpoint: "OUTLET",
  components: [{ key: "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS", quantity: 1 }, { key: "CONCEALED_ROUTE_FT", quantity: 10 }, { key: "RESTORE_DRYWALL_ACCESS", quantity: 1 }, { key: "OUTLET_EXTENSION_CORE", quantity: 1 }],
  framingSpacingInches: 16,
  contractorHours: hours,
});
ok(result.kind === "READY", "drywall concealed outlet evaluates from atomic operations");
if (result.kind !== "READY") throw new Error("expected ready labor");
ok(result.quantities.ELEC_FISH_CABLE_CONCEALED === 10, "concealed fishing uses measured route feet");
ok(result.quantities.ELEC_DRILL_FRAMING_CROSSING === 8, "10 feet at 16-inch framing produces eight physical crossings");
ok(result.quantities.ELEC_CUT_DRYWALL_ACCESS_OPENING === 8, "each framing crossing carries one access opening");
ok(!("ELEC_PATCH_DRYWALL_ACCESS_OPENING" in result.quantities), "drywall patching contributes no labor to the electrical price");
const missing = evaluateDrywallConcealedAtomicLabor({ endpoint: "OUTLET", components: [{ key: "CONCEALED_ROUTE_FT", quantity: 10 }], framingSpacingInches: null, contractorHours: hours });
ok(missing.kind === "INCOMPLETE" && missing.missingQuantities.includes("ELEC_DRILL_FRAMING_CROSSING"), "missing contractor framing rule refuses instead of assuming 16 inches");
const runtime = fs.readFileSync("lib/electrical/loadDerivedScope.ts", "utf8");
ok(runtime.includes("evaluateDrywallConcealedAtomicLabor"), "derived pricing dispatches drywall routes to the geometry bridge");
console.log(`\nDRYWALL CONCEALED ATOMIC LABOR BRIDGE — ${checks}/${checks} checks passed`);
