import fs from "node:fs";
import path from "node:path";
import {
  ROUTING_V2_LABOR_AUTHORITY,
  routingV2LaborAuthority,
  summarizeRoutingV2LaborBridge,
} from "../lib/electrical/routingV2LaborAuthority";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  checks += 1;
  console.log(`  ✓ ${message}`);
};

const seed = fs.readFileSync(path.join(process.cwd(), "prisma/seed-routing-v2-components.ts"), "utf8");
const seedKeys = [...seed.matchAll(/^\s+key: "([A-Z0-9_]+)",$/gm)].map((match) => match[1]);
const authorityKeys = ROUTING_V2_LABOR_AUTHORITY.map((entry) => entry.componentKey);
const operationKeys = new Set(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => operation.key));

ok(seedKeys.length === 18, "Routing V2 seed still defines the expected 18 physical components");
ok(new Set(authorityKeys).size === authorityKeys.length, "authority registry contains no duplicate component key");
ok(seedKeys.every((key) => authorityKeys.includes(key)), "every seeded Routing V2 component has an explicit labor-authority classification");
ok(authorityKeys.every((key) => seedKeys.includes(key)), "authority registry contains no stale component absent from the seed");
ok(ROUTING_V2_LABOR_AUTHORITY.every((entry) => entry.atomicOperationKeys.every((key) => operationKeys.has(key))), "every candidate atomic operation exists in the canonical operation library");
ok(ROUTING_V2_LABOR_AUTHORITY.filter((entry) => entry.runtimeUsesAtomicDecision).every((entry) => ["ELEC_ROUTE_SURFACE_MOUNTED", "ELEC_ROUTE_BACK_TO_BACK", "ELEC_ROUTE_ACCESSIBLE_CONCEALED", "SURFACE_ROUTE_FT", "CONCEALED_ROUTE_FT", "SURFACE_ROUTE_INSIDE_CORNER", "SURFACE_ROUTE_OUTSIDE_CORNER", "SURFACE_ROUTE_FLAT_CORNER", "OUTLET_EXTENSION_CORE", "SURFACE_DEVICE_BOX_OUTLET", "SWITCH_ENDPOINT_CORE", "SURFACE_DEVICE_BOX_SWITCH", "FIXTURE_BOX_ENDPOINT", "SURFACE_FIXTURE_BOX"].includes(entry.componentKey)), "only implemented surface, back-to-back, and accessible-concealed paths claim atomic runtime adoption");

const summary = summarizeRoutingV2LaborBridge();
ok(summary.componentCount === 18 && summary.exactButUnwiredCount === 0 && summary.compositeUnwiredCount === 4, "summary distinguishes connected route paths from four remaining composite mappings");
ok(summary.runtimeConnectedCount === 14, "fourteen component types now report atomic runtime adoption");
ok(routingV2LaborAuthority("SURFACE_ROUTE_FT")?.kind === "COMPOSITE_RECIPE_REQUIRED", "per-foot surface route refuses a one-number atomic shortcut");
ok(routingV2LaborAuthority("SURFACE_ROUTE_INSIDE_CORNER")?.kind === "EXACT_ATOMIC_OPERATION" && routingV2LaborAuthority("SURFACE_ROUTE_INSIDE_CORNER")?.runtimeUsesAtomicDecision, "an actually matching corner scope is identified and connected through the surface adapter");
ok(routingV2LaborAuthority("NOT_A_COMPONENT") === null, "unknown components fail closed instead of receiving a guessed mapping");

console.log(`\nROUTING V2 LABOR AUTHORITY — ${checks}/${checks} checks passed`);
