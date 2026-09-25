import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const setup = readFileSync("app/dashboard/setup/page.tsx", "utf8");
const launch = readFileSync("app/dashboard/setup/LaunchPanel.tsx", "utf8");

assert.match(setup, /href="\/dashboard\/setup\?stage=launch#launch-blockers"/);
assert.match(setup, /href="\/dashboard\/setup\?stage=launch#review-items"/);
assert.match(setup, /id="launch-blockers"/);
assert.match(setup, /id="review-items"/);
assert.match(setup, /findingSummary\(f\)/);
assert.match(launch, /See exactly what is missing/);
assert.match(launch, /View missing items/);

console.log("SETUP READINESS NAVIGATION — 7/7 checks passed");
