import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { indexedElectricalLaborFamilies } from "../lib/electrical/laborCoverageFamilies";
import { buildElectricalStandardScenarios } from "../lib/electrical/standardLaborScenarios";
import { evaluateLaborRecipe } from "../lib/laborOperations";

let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };

const scenarios = buildElectricalStandardScenarios();
const priceable = [...indexedElectricalLaborFamilies()].filter(([, family]) => family.status === "ATOMIC_STARTED").map(([slug]) => slug).sort();
check(scenarios.length === priceable.length, "every priceable Electrical service is classified exactly once");
check(new Set(scenarios.map((item) => item.serviceSlug)).size === priceable.length, "classifications contain no duplicate service");
check(scenarios.map((item) => item.serviceSlug).sort().every((slug, index) => slug === priceable[index]), "classification set equals the priceable service set");
check(scenarios.every((item) => item.canPublish === false), "classification has no publish authority");

const bySlug = new Map(scenarios.map((scenario) => [scenario.serviceSlug, scenario]));
check(bySlug.get("replace-standard-outlet")?.kind === "STANDARD", "fixed outlet replacement has a standard scope");
check(bySlug.get("electrical-troubleshooting")?.kind === "STANDARD", "bounded initial troubleshooting visit has a standard scope");
check(bySlug.get("home-electrical-safety-inspection")?.kind === "STANDARD", "bounded residential safety inspection has a standard scope");
check(bySlug.get("new-120v-outlet")?.kind === "NO_STANDARD", "new outlet refuses to invent route geometry");
const newOutlet = bySlug.get("new-120v-outlet");
check(newOutlet?.kind === "NO_STANDARD" && newOutlet.missingFacts.includes("perpendicularFramingFeet"), "new outlet identifies missing framing distance");
check(bySlug.get("hot-tub-spa-electrical")?.kind === "NO_STANDARD", "hot-tub package refuses unconfirmed equipment, route and bonding scope");

const partialDoorbellFacts = buildElectricalStandardScenarios(undefined, {
  "new-video-doorbell-wiring": {
    routeFeet: 25,
    platePenetrationRequired: true,
    newTransformerRequired: true,
  },
});
const partialDoorbell = partialDoorbellFacts.find((scenario) => scenario.serviceSlug === "new-video-doorbell-wiring");
check(
  partialDoorbell?.kind === "NO_STANDARD"
    && partialDoorbell.missingFacts.includes("commissioningIncluded")
    && !partialDoorbell.missingFacts.includes("routeFeet")
    && !partialDoorbell.missingFacts.includes("platePenetrationRequired")
    && !partialDoorbell.missingFacts.includes("newTransformerRequired"),
  "partial facts report only the doorbell scope decision that is still missing",
);

const panel = bySlug.get("electrical-panel-replacement");
check(panel?.kind === "STANDARD" && panel.facts.singlePoleCircuitCount === 17 && panel.facts.doublePoleCircuitCount === 3, "panel standard uses its defined circuit counts");
const service = bySlug.get("200a-service-upgrade");
check(service?.kind === "STANDARD" && service.facts.serviceEntranceFeet === 20 && service.facts.overheadServiceConductorFeet === 30 && service.facts.groundingElectrodeCount === 2 && service.facts.groundingClampTerminationCount === 3 && service.facts.groundingElectrodeConductorFeet === 25 && service.facts.difficultGroundingConditions === false, "service upgrade uses its defined feeder, overhead mast conductors and decomposed ordinary grounding quantities");
const generator = bySlug.get("generator-inlet-interlock");
check(generator?.kind === "STANDARD" && generator.facts.feederRouteFeet === 10, "generator package uses its defined 10-foot feeder");
const undercabinet = bySlug.get("under-cabinet-led-lighting");
check(undercabinet?.kind === "STANDARD" && undercabinet.facts.lightingFeet === 12 && undercabinet.facts.driverCount === 1, "under-cabinet package uses its defined physical package");

const hours = Object.fromEntries(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, 1]));
for (const scenario of scenarios) {
  if (scenario.kind !== "STANDARD") continue;
  const recipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === scenario.recipeKey)!;
  check(evaluateLaborRecipe(recipe, scenario.facts, hours).kind === "READY", `${scenario.serviceSlug} standard is physically complete`);
}

console.log(`ELECTRICAL STANDARD LABOR SCENARIOS — ${checks}/${checks} checks passed`);
