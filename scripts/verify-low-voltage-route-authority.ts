import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("prisma/seed-low-voltage-and-sconces.ts", "utf8");
const reviewRoute = readFileSync("app/api/admin/quotes/[quoteId]/labor-scope/route.ts", "utf8");
const registry = readFileSync("lib/electrical/laborScopeFactRegistry.ts", "utf8");
const policies = JSON.parse(readFileSync("prisma/template/electrical.policies.json", "utf8")) as {
  questions: Record<string, { policyKey: string; patterns: Record<string, string> }>;
};

assert.ok(seed.includes('label: "25 feet or less"') && seed.includes('value: "under_25"'));
assert.ok(seed.includes('label: "26 to 50 feet"') && seed.includes('value: "26_to_50"'));
assert.ok(seed.includes('label: "51 to 75 feet"') && seed.includes('value: "51_to_75"'));
assert.ok(seed.includes('label: "More than 75 feet, or I\'m not sure"') && seed.includes('value: "over_75_or_unsure"'));
assert.ok(seed.includes("No tape measure or hidden cable-path measurement is needed."));
const lowVoltageOptions = seed.slice(seed.indexOf("const distanceOptions = isLowVoltage"), seed.indexOf("]\n    : [", seed.indexOf("const distanceOptions = isLowVoltage")));
assert.equal((lowVoltageOptions.match(/routeAction: "RESOLVE_ADJUSTED"/g) ?? []).length, 3);
assert.equal((lowVoltageOptions.match(/routeAction: "PHOTO_REVIEW"/g) ?? []).length, 1);
assert.equal((lowVoltageOptions.match(/photosBlockBooking: true/g) ?? []).length, 1);
for (const key of ["new-coax-line_distance", "new-ethernet-line_distance"]) {
  const binding = policies.questions[key];
  assert.equal(binding.policyKey, "data_cable_run.breakpoints");
  assert.equal(binding.patterns.under_25, "{b1} feet or less");
  assert.equal(binding.patterns["26_to_50"], "{b1+1} to {b2} feet");
  assert.equal(binding.patterns["51_to_75"], "{b2+1} to {b3} feet");
  assert.equal(binding.patterns.over_75_or_unsure, "More than {b3} feet, or I am not sure");
}
assert.ok(reviewRoute.includes('source: "CONTRACTOR_MEASUREMENT"'));
assert.ok(!reviewRoute.includes("RouteAssist") && !reviewRoute.includes("ROUTE_ASSIST"));
assert.ok(registry.includes('fact("accessibleRouteFeet"') && registry.includes('["CONTRACTOR_MEASUREMENT"]'));

console.log("low-voltage route authority: three bounded accessible bands are priceable; over 75 feet or unknown routes require review");
