import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("prisma/seed-low-voltage-and-sconces.ts", "utf8");
const reviewRoute = readFileSync("app/api/admin/quotes/[quoteId]/labor-scope/route.ts", "utf8");
const registry = readFileSync("lib/electrical/laborScopeFactRegistry.ts", "utf8");
const policies = JSON.parse(readFileSync("prisma/template/electrical.policies.json", "utf8")) as {
  questions: Record<string, { policyKey: string; patterns: Record<string, string> }>;
};

assert.ok(seed.includes('label: "About 50 feet or less"') && seed.includes('value: "standard"'));
assert.ok(seed.includes('label: "More than about 50 feet"') && seed.includes('value: "long"'));
assert.ok(seed.includes('label: "I\'m not sure"') && seed.includes('value: "unsure"'));
assert.ok(seed.includes("No tape measure or hidden cable-path measurement is needed."));
const lowVoltageOptions = seed.slice(seed.indexOf("const distanceOptions = isLowVoltage"), seed.indexOf("]\n    : [", seed.indexOf("const distanceOptions = isLowVoltage")));
assert.equal((lowVoltageOptions.match(/routeAction: "PHOTO_REVIEW"/g) ?? []).length, 3);
assert.equal((lowVoltageOptions.match(/photosBlockBooking: true/g) ?? []).length, 3);
assert.ok(!lowVoltageOptions.includes("RESOLVE_ADJUSTED"));
for (const key of ["new-coax-line_distance", "new-ethernet-line_distance"]) {
  const binding = policies.questions[key];
  assert.equal(binding.policyKey, "data_cable_run.breakpoints");
  assert.equal(binding.patterns.standard, "About {b1} feet or less");
  assert.equal(binding.patterns.long, "More than about {b1} feet");
}
assert.ok(reviewRoute.includes('source: "CONTRACTOR_MEASUREMENT"'));
assert.ok(!reviewRoute.includes("RouteAssist") && !reviewRoute.includes("ROUTE_ASSIST"));
assert.ok(registry.includes('fact("accessibleRouteFeet"') && registry.includes('["CONTRACTOR_MEASUREMENT"]'));

console.log("low-voltage route authority: homeowner distance bands always review; accessible measurements remain contractor-only");
