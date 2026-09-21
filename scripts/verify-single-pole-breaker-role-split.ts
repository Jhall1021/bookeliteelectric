import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const materials = readFileSync("prisma/seed-materials.ts", "utf8");
const baselines = readFileSync("scripts/seed-material-baselines.ts", "utf8");
const dedicatedRoute = readFileSync("app/api/admin/quotes/[quoteId]/dedicated-circuit-scope/route.ts", "utf8");

assert.ok(materials.includes('key: "BREAKER_SINGLE_POLE_15A"') && materials.includes('key: "BREAKER_SINGLE_POLE_20A"'));
assert.ok(materials.includes('["BREAKER_SINGLE_POLE_15A", 1], ["RECEPTACLE_STANDARD", 1]'));
assert.ok(dedicatedRoute.includes('"BREAKER_SINGLE_POLE_15A"'));
assert.ok(baselines.includes('key: "BREAKER_SINGLE_POLE_20A"'));
assert.ok(baselines.includes("intentionally unavailable to the separate 15A role"));
assert.equal(baselines.includes('key: "BREAKER_SINGLE_POLE",'), false, "20A evidence must not attach to an amperage-ambiguous role");

console.log("single-pole breaker role split: 15A dedicated pricing and sourced 20A evidence can no longer cross configurations");
