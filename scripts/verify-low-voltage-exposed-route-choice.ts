import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { ServiceFlowDTO } from "../lib/flow-types";
import { lowVoltagePackage } from "../lib/electrical/circuitPackagePricing";
import { ensureLowVoltageExposedRouteOption } from "../lib/electrical/lowVoltageExposedRoute";
import { flowNeedsServerPricing } from "../lib/guidedFlowPricing";

const emptyFlow = (slug: "new-coax-line" | "new-ethernet-line") => ({
  slug,
  questions: [
    { id: "access", key: `${slug}_route_access`, options: [{ id: "unsure", value: "unsure" }] },
    { id: "exposed-feet", key: `${slug}_exposed_route_feet`, options: [] },
  ],
} as unknown as ServiceFlowDTO);

for (const slug of ["new-coax-line", "new-ethernet-line"] as const) {
  const repaired = ensureLowVoltageExposedRouteOption(emptyFlow(slug));
  const exposed = repaired.questions[0].options.find((option) => option.value === "exposed_baseboard");
  assert.equal(exposed?.routeAction, "CONTINUE");
  assert.equal(exposed?.nextQuestionId, "exposed-feet");
  assert.ok(exposed?.disclaimer?.includes("cable will remain visible"));

  const visible = lowVoltagePackage(slug, {
    [`${slug}_route_access`]: "exposed_baseboard",
    [`${slug}_exposed_route_feet`]: "20",
  });
  const accessible = lowVoltagePackage(slug, {
    [`${slug}_route_access`]: "accessible",
    [`${slug}_distance`]: "20",
  });
  assert.equal(visible?.facts.exposedLowVoltageRoute, true);
  assert.equal(visible?.facts.lowVoltageClipCount, 12);
  assert.equal(accessible?.facts.accessibleRoute, true);
  assert.equal(accessible?.facts.exposedLowVoltageRoute, false);
  assert.equal(flowNeedsServerPricing("LEGACY_PUBLISHED", {
    [`${slug}_route_access`]: "exposed_baseboard",
  }), true, `${slug} exposed route must use its measured server price even on an older installed service`);
}

const repair = readFileSync("scripts/restore-low-voltage-exposed-route-2026-10-16.ts", "utf8");
assert.ok(repair.includes('CONTRACTOR_SLUGS = ["elite-electric"]'));
assert.ok(repair.includes('SERVICE_SLUGS = ["new-coax-line", "new-ethernet-line"]'));
assert.ok(repair.includes('value: "exposed_baseboard"'));
assert.ok(repair.includes('data: { order: 4 }'));
assert.ok(repair.includes("decideDerivedPricingApproval"));
assert.ok(repair.includes("activateService"));
assert.ok(repair.includes('contractorCategory: { active: true, canonicalCategory: { slug: "tv-media" } }'));
assert.ok(!repair.includes("where: { active: true, slug:"), "the repair must include currently hidden services");
assert.ok(!repair.includes("templateAnswerOption"), "the Elite repair must not mutate shared catalog templates");
for (const operationKey of [
  "ELEC_ROUTE_LAYOUT_SETUP",
  "ELEC_UTP_CABLE_ACCESSIBLE",
  "ELEC_COAX_CABLE_ACCESSIBLE",
  "ELEC_LOW_VOLTAGE_CABLE_EXPOSED",
  "ELEC_FASTEN_EXPOSED_LOW_VOLTAGE_CABLE",
  "ELEC_TERMINATE_RJ45_END",
  "ELEC_TERMINATE_COAX_END",
  "ELEC_TEST_DATA_CABLE",
]) assert.ok(repair.includes(`\"${operationKey}\"`), `${operationKey} must be ready before exposed-route approval`);

const resolver = readFileSync("lib/electrical/resolveWithDerivedPricing.ts", "utf8");
assert.ok(resolver.includes("exposedLowVoltageCompatibility"));
assert.ok(resolver.includes('pricingMethod: "DERIVED_RESOLVED_SCOPE"'));

const storefront = readFileSync("lib/storefrontPriceEvaluation.ts", "utf8");
assert.ok(storefront.includes("exposedLowVoltageRoute"));
assert.ok(storefront.includes("|| exposedLowVoltageRoute"));

const visitPlanning = readFileSync("lib/visitLinePlanning.ts", "utf8");
assert.ok(visitPlanning.includes("exposedLowVoltageCompatibility"));
assert.ok(visitPlanning.includes("hasDerived"));

console.log("low-voltage exposed route: coax and Ethernet retain their visible-baseboard choice and separate pricing facts");
