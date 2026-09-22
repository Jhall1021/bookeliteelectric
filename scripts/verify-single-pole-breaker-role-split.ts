import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const materials = readFileSync("prisma/seed-materials.ts", "utf8");
const baselines = readFileSync("scripts/seed-material-baselines.ts", "utf8");
const dedicatedPackage = readFileSync("lib/electrical/dedicatedCircuitReviewPackage.ts", "utf8");
const derivedFixture = readFileSync("scripts/_derivedStorefrontFixture.ts", "utf8");
const launchRehearsal = readFileSync("scripts/rehearse-fresh-electrical-launch-phase2.ts", "utf8");

assert.ok(materials.includes('key: "BREAKER_SINGLE_POLE_15A"') && materials.includes('key: "BREAKER_SINGLE_POLE_20A"'));
assert.ok(materials.includes('["BREAKER_SINGLE_POLE_15A", 1], ["RECEPTACLE_STANDARD", 1]'));
assert.ok(dedicatedPackage.includes('breakerRole: "BREAKER_SINGLE_POLE_15A"'));
assert.ok(dedicatedPackage.includes('breakerRole: "BREAKER_SINGLE_POLE_20A"'));
assert.ok(derivedFixture.includes('["BREAKER_SINGLE_POLE_15A", 800, 1, "each"]'));
assert.ok(launchRehearsal.includes('{ roleKey: "BREAKER_SINGLE_POLE_15A", packagePriceCents: 800'));
assert.ok(baselines.includes('key: "BREAKER_SINGLE_POLE_20A"'));
assert.ok(baselines.includes("intentionally unavailable to the separate 15A role"));
assert.equal(baselines.includes('key: "BREAKER_SINGLE_POLE",'), false, "20A evidence must not attach to an amperage-ambiguous role");

console.log("single-pole breaker role split: 15A dedicated pricing and sourced 20A evidence can no longer cross configurations");
