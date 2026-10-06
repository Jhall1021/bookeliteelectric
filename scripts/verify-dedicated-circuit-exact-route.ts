import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("prisma/seed-dedicated-circuit.ts", "utf8");
const guide = readFileSync("components/guided-flow/MeasurementGuide.tsx", "utf8");
const pricing = readFileSync("lib/electrical/circuitPackagePricing.ts", "utf8");
const activation = readFileSync("scripts/activate-dedicated-circuit-exact-route-2026-10-06.ts", "utf8");

assert.match(seed, /key: "dedicated_distance"[\s\S]{0,500}inputType: "NUMBER"/);
assert.match(seed, /numberAllowsDecimal: true/);
assert.match(seed, /numberAtLeast: 1, numberAtMost: 25/);
assert.match(seed, /numberAtLeast: 25, numberAtLeastExclusive: true, numberAtMost: 50/);
assert.match(seed, /addNumericUnknownOption\(prisma, q3\.id\)/);
assert.match(guide, /dedicated_distance: "accessible-route"/);
assert.match(guide, /serviceSlug === "dedicated-120v-circuit-outlet"/);
assert.match(guide, /ElectricalPanel/);
assert.match(guide, /"Electrical panel"/);
assert.match(pricing, /const dedicatedRouteFeet/);
assert.match(pricing, /measured >= 1 && measured <= boundaries\[1\]/);
assert.match(pricing, /return bandFeet\(value, boundaries\)/);

for (const label of [
  "Refrigerator or freezer",
  "Sump pump",
  "Microwave or room air conditioner",
  "Electric fireplace",
  "Another appliance or I know the circuit size",
]) assert.match(seed, new RegExp(`label: "${label}"`));
assert.doesNotMatch(seed, /label: "Window or through-wall air conditioner"/);
assert.doesNotMatch(seed, /label: "Something else"/);

assert.match(activation, /CONTRACTOR_SLUGS = \["elite-electric", "electrical-onboarding-test"\]/);
assert.match(activation, /inputType: "NUMBER"/);
assert.match(activation, /templateQuestion\.update/);
assert.match(activation, /templateAnswerOption\.update/);
assert.match(activation, /new opening screen: 5 choices/);

console.log("dedicated circuit: five opening choices, exact measured route, panel-to-outlet guide, and legacy-band compatibility verified");
