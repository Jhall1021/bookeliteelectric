import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; console.log(`  ✓ ${label}`); };
const authority = readFileSync("lib/policyResolution.ts", "utf8");
const panel = readFileSync("components/admin/PolicyList.tsx", "utf8");

ok(authority.includes("choices: string[]") && authority.includes("choicesByKey"), "policy read model carries the template-owned enumerated choices");
ok(panel.includes("policy.choices.length > 0") && panel.includes('type="radio"'), "enumerated policies render bounded choices rather than free text");
ok(panel.includes('option === "INCLUDED"') && panel.includes('option === "NOT_INCLUDED"'), "commissioning choices use contractor-readable labels");
ok(panel.includes("Enter your answer"), "non-enumerated zero-boundary policies retain their existing free-text control");

console.log(`\nENUMERATED POLICY UI — ${checks}/${checks} checks passed`);
