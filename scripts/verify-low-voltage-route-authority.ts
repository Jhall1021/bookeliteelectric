import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("prisma/seed-low-voltage-and-sconces.ts", "utf8");
const reviewRoute = readFileSync("app/api/admin/quotes/[quoteId]/labor-scope/route.ts", "utf8");
const registry = readFileSync("lib/electrical/laborScopeFactRegistry.ts", "utf8");

assert.ok(seed.includes('routeAction: isLowVoltage ? "PHOTO_REVIEW" : "RESOLVE_ADJUSTED"'));
assert.ok(seed.includes("photosBlockBooking: isLowVoltage"));
assert.ok(seed.includes("requiredPhotoLabels: isLowVoltage ? REVIEW_PHOTOS : SOURCE_PHOTOS"));
assert.ok(seed.includes('value: "long",\n        routeAction: "PHOTO_REVIEW"'));
assert.ok(seed.includes('value: "unsure",\n        routeAction: "PHOTO_REVIEW"'));
assert.ok(reviewRoute.includes('source: "CONTRACTOR_MEASUREMENT"'));
assert.ok(!reviewRoute.includes("RouteAssist") && !reviewRoute.includes("ROUTE_ASSIST"));
assert.ok(registry.includes('fact("accessibleRouteFeet"') && registry.includes('["CONTRACTOR_MEASUREMENT"]'));

console.log("low-voltage route authority: homeowner distance bands always review; accessible measurements remain contractor-only");
