import assert from "node:assert/strict";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { framingCrossingCount, evaluateLaborRecipe } from "../lib/laborOperations";
import { platformLaborHours } from "../lib/electrical/platformLaborBaseline";
import { routingV2LaborAuthority } from "../lib/electrical/routingV2LaborAuthority";
import { evaluateDrywallConcealedAtomicLabor } from "../lib/electrical/drywallConcealedAtomicLaborBridge";
import {
  FAN_SWITCHED_RECEPTACLE_CONVERSION_COMPONENT_KEY,
  FAN_SWITCHED_RECEPTACLE_CONVERSION_OPERATION_KEYS,
  FAN_SWITCH_LEG_COMPONENTS,
  fanSwitchLegComponentKey,
} from "../lib/electrical/ceilingFanControl";

const recipe = (key: string) => {
  const found = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((candidate) => candidate.key === key);
  assert.ok(found, `${key} exists`);
  return found;
};

const hours = platformLaborHours();
const distanceFeet = 10;
const crossingCount = framingCrossingCount(distanceFeet, 16);
assert.equal(crossingCount, 8, "10 wall-to-fan feet rounds up to eight 16-inch framing crossings");

const finished = evaluateLaborRecipe(recipe("ELECTRICAL_DRYWALL_CONCEALED_CEILING_FAN"), {
  concealedRouteFeet: distanceFeet,
  drywallOpeningCount: crossingCount,
}, hours);
assert.equal(finished.kind, "READY");
if (finished.kind === "READY") {
  assert.equal(finished.quantities.ELEC_DRILL_TOP_OR_BOTTOM_PLATE, 1, "finished route drills one top plate");
  assert.equal(finished.quantities.ELEC_DRILL_FRAMING_CROSSING, 8, "finished route drills every assumed joist crossing");
  assert.equal(finished.quantities.ELEC_CUT_DRYWALL_ACCESS_OPENING, 10, "finished route has two fixed openings plus one per crossing");
  assert.equal(finished.quantities.ELEC_INSTALL_FAN_RATED_BOX, 1, "finished route installs one fan-rated box");
  assert.equal(finished.quantities.ELEC_INSTALL_NEW_CEILING_FAN, 1, "finished route installs the fan itself");
}

for (const key of [
  "ELECTRICAL_ACCESSIBLE_CONCEALED_CEILING_FAN",
  "ELECTRICAL_SURFACE_CEILING_FAN_SERVICE",
]) {
  const operations = new Set(recipe(key).lines.map((line) => line.operationKey));
  assert.ok(operations.has("ELEC_INSTALL_NEW_CEILING_FAN"), `${key} includes the actual fan installation`);
}

assert.equal(routingV2LaborAuthority("CEILING_FAN_INSTALL_CORE")?.runtimeUsesAtomicDecision, true,
  "fan-install component is connected to contractor atomic labor decisions");
assert.equal(fanSwitchLegComponentKey("under_10"), FAN_SWITCH_LEG_COMPONENTS.under_10.key);
assert.equal(fanSwitchLegComponentKey("11_12"), FAN_SWITCH_LEG_COMPONENTS["11_12"].key);
assert.equal(fanSwitchLegComponentKey("13_14"), FAN_SWITCH_LEG_COMPONENTS["13_14"].key);
assert.equal(FAN_SWITCH_LEG_COMPONENTS.under_10.wireFeet, 8.5, "10-foot ceiling uses 6.5 vertical feet plus two feet of termination allowance");
for (const component of Object.values(FAN_SWITCH_LEG_COMPONENTS)) {
  assert.equal(routingV2LaborAuthority(component.key)?.runtimeUsesAtomicDecision, true,
    `${component.key} uses the atomic switch-leg adapter`);
}
assert.equal(routingV2LaborAuthority("FAN_LIGHT_SPEED_CONTROL_UPGRADE")?.runtimeUsesAtomicDecision, true,
  "fan/light speed control is a material-only upgrade on the same switch labor");
assert.deepEqual(FAN_SWITCHED_RECEPTACLE_CONVERSION_OPERATION_KEYS, ["ELEC_RECONFIGURE_SWITCHED_RECEPTACLE"],
  "switched-outlet fan control adds only the 15-minute receptacle conversion operation");
assert.equal(routingV2LaborAuthority(FAN_SWITCHED_RECEPTACLE_CONVERSION_COMPONENT_KEY)?.runtimeUsesAtomicDecision, true,
  "switched-outlet fan conversion is connected to contractor atomic labor");

const routeComponents = [
  { key: "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS", quantity: 1 },
  { key: "CONCEALED_ROUTE_FT", quantity: 10 },
  { key: "FIXTURE_BOX_ENDPOINT", quantity: 1 },
  { key: "CEILING_FAN_INSTALL_CORE", quantity: 1 },
];
for (const contractorPolicySpacing of [16, 24, null]) {
  const evaluated = evaluateDrywallConcealedAtomicLabor({
    endpoint: "CEILING_FAN",
    components: routeComponents,
    framingSpacingInches: contractorPolicySpacing,
    contractorHours: hours,
  });
  assert.equal(evaluated.kind, "READY");
  if (evaluated.kind === "READY") {
    assert.equal(evaluated.quantities.ELEC_DRILL_FRAMING_CROSSING, 8,
      "fan routes always use the promised 16-inch framing count");
    assert.equal(evaluated.quantities.ELEC_CUT_DRYWALL_ACCESS_OPENING, 10,
      "fan routes always add two fixed openings to the 16-inch framing count");
  }
}

console.log("\n  new-ceiling-fan V2 recipe: PASS\n");
