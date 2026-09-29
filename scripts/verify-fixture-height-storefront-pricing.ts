import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flowNeedsServerPricing } from "../lib/guidedFlowPricing";
import { resolveRoute } from "../lib/routeResolver";

const belowId = "below";
const service = {
  id: "fixture",
  slug: "replace-interior-light-fixture",
  contractorId: "contractor",
  tradeKey: "electrical",
  pricingMethod: "LEGACY_PUBLISHED",
  basePrice: 28_000,
  whileWeThereBasePrice: 8_000,
  fieldLaborHours: 0.5,
  materialCostCents: 0,
  materialCostResolved: true,
  estimatedMinutes: 30,
  requiresTechCount: 1,
  laborCrewType: "ELECTRICIAN",
  ownComponents: new Map(),
  ownMaterialCosts: new Map(),
  capabilities: {},
  troubleshootingServiceId: null,
  troubleshootingProblem: null,
  disclaimer: null,
  questions: [
    {
      id: "height", key: "fixture_height", prompt: "height", inputType: "SINGLE_SELECT",
      numberMin: null, numberMax: null, numberAllowsDecimal: false,
      options: [
        { id: "base", value: "under_10", label: "10 feet or under", routeAction: "CONTINUE", nextQuestionId: belowId, order: 1 },
        { id: "twelve", value: "11_12", label: "11 to 12 feet", routeAction: "CONTINUE", nextQuestionId: belowId, order: 2 },
        { id: "fourteen", value: "13_14", label: "13 to 14 feet", routeAction: "CONTINUE", nextQuestionId: belowId, order: 3 },
      ],
    },
    {
      id: belowId, key: "work_area_below", prompt: "below", inputType: "SINGLE_SELECT",
      numberMin: null, numberMax: null, numberAllowsDecimal: false,
      options: [
        { id: "level", value: "level_floor", label: "A normal level floor", routeAction: "RESOLVE_INSTANT", nextQuestionId: null, order: 1 },
      ],
    },
  ].map((question) => ({
    ...question,
    options: question.options.map((option) => ({
      ...option,
      priceModifierCents: 0, approvedComponentPriceCents: null,
      referencedServiceId: null, referencedService: null,
      requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [],
      overrideEstimatedMinutes: null, overrideTechCount: null, overrideFieldLaborHours: null,
      addFieldLaborHours: null, addMaterialCostCents: null, addScheduleMinutes: null,
      accessClassification: null, accessSlot: "PRIMARY", accessFinishedDisclaimer: null,
      disclaimer: null, components: [], conditionalDisclaimers: [], photoGroups: [],
      requiresCapabilityKey: null, numberAtLeast: null, numberAtMost: null,
      numberAtLeastExclusive: false,
    })),
  })),
} as never;

const settings = {
  crewHourRateCents: 25_000, electricianHourRateCents: 14_500,
  fixtureHeight12Percent: 15, fixtureHeight14Percent: 30,
  primaryMinimumCents: 25_000, roundingIncrementCents: 500,
  defaultPermitAdminCents: 0,
};

const price = (height: string, primary: boolean) => {
  const result = resolveRoute(service, {
    fixture_height: height,
    work_area_below: "level_floor",
  }, primary, settings);
  assert.equal(result.status, "PRICED");
  return result.status === "PRICED" ? result.priceCents : -1;
};

assert.deepEqual(
  [price("under_10", false), price("11_12", false), price("13_14", false)],
  [8_000, 9_087, 10_175],
  "same-visit price applies the contractor's 12- and 14-foot labor adjustments",
);
assert.deepEqual(
  [price("under_10", true), price("11_12", true), price("13_14", true)],
  [28_000, 29_087, 30_175],
  "standalone price applies the same height adjustments",
);
assert.equal(flowNeedsServerPricing("LEGACY_PUBLISHED", { fixture_height: "11_12" }), true);
assert.equal(flowNeedsServerPricing("LEGACY_PUBLISHED", { another_answer: "yes" }), false);

const engine = readFileSync("components/guided-flow/GuidedFlowEngine.tsx", "utf8");
const evaluator = readFileSync("lib/storefrontPriceEvaluation.ts", "utf8");
assert.ok(engine.includes("flowNeedsServerPricing(flow!.pricingMethod, ans)"));
assert.ok(engine.includes('siteFetch("/api/price-evaluation"'));
assert.ok(evaluator.includes('question.key === "fixture_height"'));

console.log("FIXTURE HEIGHT STOREFRONT — visible legacy prices use the server and differ at 10, 12, and 14 feet");
