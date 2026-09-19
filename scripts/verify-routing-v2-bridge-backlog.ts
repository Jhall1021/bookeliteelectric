import fs from "node:fs";
import { ROUTING_V2_LABOR_AUTHORITY } from "../lib/electrical/routingV2LaborAuthority";
import { ROUTING_V2_BRIDGE_BACKLOG, summarizeRoutingV2BridgeBacklog } from "../lib/electrical/routingV2BridgeBacklog";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  checks += 1;
  console.log(`  ✓ ${message}`);
};

const unconnected = ROUTING_V2_LABOR_AUTHORITY.filter((entry) => !entry.runtimeUsesAtomicDecision).map((entry) => entry.componentKey).sort();
const backlog = ROUTING_V2_BRIDGE_BACKLOG.map((entry) => entry.componentKey).sort();
ok(JSON.stringify(backlog) === JSON.stringify(unconnected), "backlog covers every and only unconnected Routing V2 component");
ok(new Set(backlog).size === backlog.length, "backlog contains no duplicate component");
ok(ROUTING_V2_BRIDGE_BACKLOG.every((item) => item.missingFacts.length > 0 && item.nextWork.length > 0), "every remaining component names facts and a bounded next action");
ok(ROUTING_V2_BRIDGE_BACKLOG.every((item) => item.laborAuthority === "MISSING_FACT_ADAPTER"), "no remaining component is mislabeled as labor-connected");
const componentMaterials = fs.readFileSync("prisma/seed-routing-v2-component-materials.ts", "utf8");
ok(componentMaterials.includes('["SURFACE_DEVICE_BOX_SWITCH", "SURFACE_DEVICE_BOX_1G", 1]'), "connected surface switch box has an explicit canonical material recipe");
ok(componentMaterials.includes('["SURFACE_FIXTURE_BOX", "SURFACE_FIXTURE_BOX", 1]'), "connected surface fixture box has an explicit fixture-rated material recipe");

const summary = summarizeRoutingV2BridgeBacklog();
ok(summary.remainingComponentCount === 7, "seven Routing V2 component types remain after all three surface endpoint bridges");
ok(summary.missingMaterialTakeoffCount === 7, "all seven remaining component types require a non-surface material takeoff");
ok(summary.missingLaborAdapterCount === 7, "all seven remaining component types require a labor fact adapter");

console.log(`\nROUTING V2 BRIDGE BACKLOG — ${checks}/${checks} checks passed`);
