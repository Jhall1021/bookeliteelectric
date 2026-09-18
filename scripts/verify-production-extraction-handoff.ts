/** No database writes: verify the actual post-seed argument builder. */
import assert from "node:assert/strict";
import { catalogPostSeedArgs } from "./init-preview-database";
import { POST_SEED_STEPS } from "./rehearse-fresh-electrical-launch";

const flag = "--i-know-this-writes-to-production";
const before = JSON.stringify(POST_SEED_STEPS);
let extractionCount = 0;
for (const step of POST_SEED_STEPS) {
  if (step.kind !== "run") continue;
  assert.deepEqual(catalogPostSeedArgs(step), step.args ?? []);
  assert.deepEqual(catalogPostSeedArgs(step, false), step.args ?? []);
  if (step.file === "scripts/extract-template-catalog.ts") {
    extractionCount++;
    assert.deepEqual(catalogPostSeedArgs(step, true), [...(step.args ?? []), flag]);
    assert.equal(catalogPostSeedArgs(step).includes(flag), false);
  } else {
    assert.deepEqual(catalogPostSeedArgs(step, true), step.args ?? []);
  }
}
assert.equal(extractionCount, 1);
assert.equal(JSON.stringify(POST_SEED_STEPS), before);
console.log("PASS: Production extraction acknowledgement, Preview defaults, unrelated steps, and shared-step immutability");
