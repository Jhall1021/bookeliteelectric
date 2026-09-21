import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("prisma/seed-questions.ts", "utf8");
const start = seed.indexOf("export async function seedGarageDoorOpenerOutlet()");
const end = seed.indexOf("export async function seedGarage240vOutlet()", start);
assert.ok(start >= 0 && end > start);
const block = seed.slice(start, end);

assert.ok(block.includes('serviceSlugKey(prisma, "garage-door-opener-outlet")'));
assert.ok(block.includes('serviceSlugKey(prisma, "garage-door-opener-outlet-ev")'));
assert.ok(block.includes('key: "garage_opener_scope_review"'));
assert.ok(block.includes('routeAction: "PHOTO_REVIEW"'));
assert.ok(block.includes("photosBlockBooking: true"));
assert.ok(block.includes("required garage protection"));
assert.ok(block.includes('key: "garage_opener_entry"'));
assert.ok(block.includes('routeAction: "REROUTE_SERVICE"'));
assert.ok(block.includes("rerouteServiceId: canonical.id"));
assert.equal(block.includes('routeAction: "RESOLVE_INSTANT"'), false);
assert.equal(block.includes('routeAction: "RESOLVE_ADJUSTED"'), false);
assert.equal(block.includes("priceModifierCents"), false);

console.log("garage opener review contract: one canonical review flow, one category entry reroute, and no under-specified instant price");
