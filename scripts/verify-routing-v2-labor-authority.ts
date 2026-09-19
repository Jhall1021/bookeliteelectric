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
ok(ROUTING_V2_LABOR_AUTHORITY.every((entry) => entry.runtimeUsesAtomicDecision), "every Routing V2 component now reaches an implemented atomic runtime decision");

const summary = summarizeRoutingV2LaborBridge();
ok(summary.componentCount === 18 && summary.exactButUnwiredCount === 0 && summary.compositeUnwiredCount === 0, "summary reports no remaining Routing V2 labor-authority gap");
ok(summary.runtimeConnectedCount === 18, "all eighteen component types now report atomic runtime adoption");
ok(routingV2LaborAuthority("SURFACE_ROUTE_FT")?.kind === "COMPOSITE_RECIPE_REQUIRED", "per-foot surface route refuses a one-number atomic shortcut");
ok(routingV2LaborAuthority("SURFACE_ROUTE_INSIDE_CORNER")?.kind === "EXACT_ATOMIC_OPERATION" && routingV2LaborAuthority("SURFACE_ROUTE_INSIDE_CORNER")?.runtimeUsesAtomicDecision, "an actually matching corner scope is identified and connected through the surface adapter");
ok(routingV2LaborAuthority("NOT_A_COMPONENT") === null, "unknown components fail closed instead of receiving a guessed mapping");

console.log(`\nROUTING V2 LABOR AUTHORITY — ${checks}/${checks} checks passed`);
