import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("prisma/seed-video-doorbell-wiring.ts", "utf8");
const recipe = readFileSync("lib/electrical/atomicLabor.ts", "utf8");

assert.ok(seed.includes('value: "no_chime",\n        routeAction: "PHOTO_REVIEW"'));
assert.ok(seed.includes('photosBlockBooking: true'));
assert.ok(seed.includes('requiredPhotoLabels: REVIEW_PHOTOS'));
assert.ok(seed.includes("0 priced routes, 9 to review, 1 reroute"));
assert.ok(!seed.includes('value: "no_chime",\n        routeAction: "RESOLVE_INSTANT"'));
assert.ok(seed.includes('"basement or crawlspace to run the wire through, a standard included "') && seed.includes('"low-voltage wire allowance, and a transformer landed at an existing "'));
assert.ok(!seed.includes('"basement or crawlspace to run the wire through, up to " + INCLUDED_WIRE_FT'));
assert.ok(recipe.includes('m("ELEC_DOORBELL_LOW_VOLTAGE_ROUTE", "routeFeet")'));
assert.ok(recipe.includes('"platePenetrationRequired"') && recipe.includes('"newTransformerRequired"') && recipe.includes('"commissioningIncluded"'));

console.log("new doorbell route authority: homeowner-visible scope reviews; hidden route and technical facts cannot instant-price");
