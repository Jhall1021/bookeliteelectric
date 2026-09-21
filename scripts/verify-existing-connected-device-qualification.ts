import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); };
const seed = readFileSync("prisma/seed-questions.ts", "utf8");
const height = readFileSync("prisma/seed-height-access.ts", "utf8");

ok(seed.includes('"video-doorbell-existing-wiring"') && seed.includes('"floodlight-camera-existing"'), "both existing-point connected services receive qualification trees");
ok(seed.includes('key: "existing_point_condition"') && seed.includes('value: "works_normally"') && seed.includes('routeAction: "RESOLVE_INSTANT"'), "only an observable working existing point reaches the clean-swap price");
ok(seed.includes('value: "not_working"') && seed.includes('value: "unsure"') && (seed.match(/routeAction: "REROUTE_TROUBLESHOOTING"/g)?.length ?? 0) >= 2, "faults and uncertainty route to troubleshooting rather than guessed remediation");
ok(height.includes('"floodlight-camera-existing"'), "existing-fixture camera still receives the shared height and ladder-access guard");
ok(!seed.includes("newTransformerRequired"), "the homeowner tree does not diagnose transformer remediation");

console.log(`\nEXISTING CONNECTED-DEVICE QUALIFICATION — ${checks}/${checks} checks passed`);
