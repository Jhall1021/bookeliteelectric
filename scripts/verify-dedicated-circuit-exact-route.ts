import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("prisma/seed-dedicated-circuit.ts", "utf8");
const guide = readFileSync("components/guided-flow/MeasurementGuide.tsx", "utf8");
const homeProfile = readFileSync("components/guided-flow/DedicatedCircuitHomeProfile.tsx", "utf8");
const distanceModel = readFileSync("components/guided-flow/DedicatedCircuitDistanceModel.tsx", "utf8");
const questionStep = readFileSync("components/guided-flow/QuestionStep.tsx", "utf8");
const pricing = readFileSync("lib/electrical/circuitPackagePricing.ts", "utf8");
const activation = readFileSync("scripts/activate-dedicated-circuit-exact-route-2026-10-06.ts", "utf8");

assert.match(seed, /key: "dedicated_distance"[\s\S]{0,500}inputType: "NUMBER"/);
assert.match(seed, /numberAllowsDecimal: true/);
assert.match(seed, /numberAtLeast: 1, numberAtMost: 25/);
assert.match(seed, /numberAtLeast: 25, numberAtLeastExclusive: true, numberAtMost: 100/);
assert.match(seed, /addNumericUnknownOption\(prisma, q3\.id\)/);
assert.match(guide, /dedicated_distance: "accessible-route"/);
assert.match(guide, /serviceSlug === "dedicated-120v-circuit-outlet"/);
assert.match(guide, /ElectricalPanel/);
assert.match(guide, /"Electrical panel"/);
assert.match(pricing, /const dedicatedRouteFeet/);
assert.match(pricing, /measured >= 1 && measured <= DEDICATED_CIRCUIT_MAX_AUTO_PRICE_FEET/);
assert.match(pricing, /return bandFeet\(value, boundaries\)/);
assert.match(seed, /key: "dedicated_route_access"[\s\S]{0,300}order: 1/);
assert.match(seed, /value: DEDICATED_ROUTE_ACCESS_VALUES\.accessible[\s\S]{0,180}nextQuestionId: q1\.id/);
assert.match(homeProfile, /Is your home one or two stories\?/);
assert.match(homeProfile, /Which floor will the new dedicated outlet be on\?/);
assert.match(homeProfile, /Where is your electrical panel\?/);
assert.match(homeProfile, /What size is the garage\?/);
assert.match(homeProfile, /One-car garage/);
assert.match(homeProfile, /Two-car garage/);
assert.match(homeProfile, /Three-car garage/);
assert.doesNotMatch(homeProfile, /Finished drywall with no access above/);
assert.match(distanceModel, /garageAllowance/);
assert.match(distanceModel, /far side of the garage/);
assert.match(distanceModel, /EXTERIOR PANEL/);
assert.match(distanceModel, /Will the new outlet be on an exterior-facing wall\?/);
assert.match(distanceModel, /EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT/);
assert.match(questionStep, /<DedicatedCircuitHomeProfile options=\{question\.options\} onAnswer=\{onAnswer\} \/>/);
assert.match(questionStep, /<DedicatedCircuitDistanceModel/);

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

console.log("dedicated circuit: home profile first, tailored house route, exact measurement, exterior-wall warning, equipment choices, and legacy-band compatibility verified");
