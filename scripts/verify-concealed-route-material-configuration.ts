import { strict as assert } from "node:assert";
import {
  computeConcealedRouteMaterialTakeoff,
  CONCEALED_BRANCH_CABLE_CHOICES,
} from "../lib/electrical/concealedRouteMaterialConfiguration";
import { ROUTING_V2_POLICY_DEFINITIONS } from "../prisma/seed-routing-v2-policies";

let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
  console.log(`  ✓ ${message}`);
};

const selections = [
  { role: "WIRE_12_2", packageQuantity: 250, packageUnit: "ft", packagePriceCents: 18000 },
  { role: "BOX_OLD_WORK", packageQuantity: 1, packageUnit: "each", packagePriceCents: 300 },
  { role: "RECEPTACLE_STANDARD", packageQuantity: 1, packageUnit: "each", packagePriceCents: 200 },
  { role: "SWITCH_STANDARD", packageQuantity: 1, packageUnit: "each", packagePriceCents: 200 },
  { role: "WALL_PLATE", packageQuantity: 1, packageUnit: "each", packagePriceCents: 100 },
  { role: "CONSUMABLES_SMALL", packageQuantity: 1, packageUnit: "each", packagePriceCents: 300 },
  { role: "NM_CABLE_SUPPORT", packageQuantity: 100, packageUnit: "each", packagePriceCents: 800 },
];
const config = {
  cableRole: "WIRE_12_2" as const,
  slackPerTerminationFt: 2,
  backToBackCableAllowanceFt: 6,
  supportSpacingFt: 4.5,
  supportAtEachTermination: true,
};

const accessible = computeConcealedRouteMaterialTakeoff({
  components: [
    { key: "ELEC_ROUTE_ACCESSIBLE_CONCEALED", quantity: 1 },
    { key: "CONCEALED_ROUTE_FT", quantity: 31 },
    { key: "OUTLET_EXTENSION_CORE", quantity: 1 },
  ],
  endpoint: "OUTLET",
  configuration: config,
  selections,
});
ok(accessible.purchaseComplete, "measured accessible route resolves when contractor cable rules and products are established");
ok(accessible.physicalRequirements.some((requirement) => requirement.role === "WIRE_12_2" && requirement.quantity === 35), "31 measured feet plus two 2-foot termination allowances produces 35 cable-feet");
ok(accessible.physicalRequirements.some((requirement) => requirement.role === "NM_CABLE_SUPPORT" && requirement.quantity === 8), "31 feet at 4.5-foot spacing plus two declared terminal supports produces eight supports");
ok(["BOX_OLD_WORK", "RECEPTACLE_STANDARD", "WALL_PLATE", "CONSUMABLES_SMALL"].every((role) => accessible.physicalRequirements.some((requirement) => requirement.role === role && requirement.quantity === 1)), "concealed outlet endpoint lists every physical endpoint material");

const backToBack = computeConcealedRouteMaterialTakeoff({
  components: [{ key: "ELEC_ROUTE_BACK_TO_BACK", quantity: 1 }, { key: "SWITCH_ENDPOINT_CORE", quantity: 1 }],
  endpoint: "SWITCH",
  configuration: { ...config, slackPerTerminationFt: null },
  selections,
});
ok(backToBack.purchaseComplete, "back-to-back route resolves from the contractor allowance without inventing route footage");
ok(backToBack.purchaseComplete, "back-to-back route does not depend on the separate measured-route slack policy");
ok(backToBack.physicalRequirements.some((requirement) => requirement.role === "WIRE_12_2" && requirement.quantity === 6), "back-to-back cable quantity is exactly the declared allowance");
ok(backToBack.physicalRequirements.some((requirement) => requirement.role === "SWITCH_STANDARD") && !backToBack.physicalRequirements.some((requirement) => requirement.role === "RECEPTACLE_STANDARD"), "switch endpoint uses switch materials rather than outlet materials");

const baseboard = computeConcealedRouteMaterialTakeoff({
  components: [
    { key: "ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS", quantity: 1 },
    { key: "CONCEALED_ROUTE_FT", quantity: 18 },
    { key: "RESTORE_BASEBOARD_ACCESS", quantity: 18 },
    { key: "OUTLET_EXTENSION_CORE", quantity: 1 },
  ],
  endpoint: "OUTLET",
  configuration: config,
  selections,
});
ok(baseboard.purchaseComplete && baseboard.physicalRequirements.some((requirement) => requirement.role === "WIRE_12_2" && requirement.quantity === 22), "baseboard route reuses measured concealed cable takeoff without inventing restoration material");

const missingCable = computeConcealedRouteMaterialTakeoff({
  components: [{ key: "ELEC_ROUTE_ACCESSIBLE_CONCEALED", quantity: 1 }, { key: "CONCEALED_ROUTE_FT", quantity: 10 }, { key: "OUTLET_EXTENSION_CORE", quantity: 1 }],
  endpoint: "OUTLET",
  configuration: { ...config, cableRole: null },
  selections,
});
ok(!missingCable.purchaseComplete && missingCable.unresolvedRequirements.some((gap) => gap.code === "CONCEALED_CABLE_SPECIFICATION_NOT_ESTABLISHED"), "missing cable choice fails closed with an actionable reason");

const missingAllowance = computeConcealedRouteMaterialTakeoff({
  components: [{ key: "ELEC_ROUTE_BACK_TO_BACK", quantity: 1 }, { key: "OUTLET_EXTENSION_CORE", quantity: 1 }],
  endpoint: "OUTLET",
  configuration: { ...config, backToBackCableAllowanceFt: null },
  selections,
});
ok(!missingAllowance.purchaseComplete && missingAllowance.unresolvedRequirements.some((gap) => gap.code === "BACK_TO_BACK_CABLE_ALLOWANCE_NOT_ESTABLISHED"), "missing back-to-back allowance refuses rather than assuming a hidden cable length");

const missingLength = computeConcealedRouteMaterialTakeoff({
  components: [{ key: "ELEC_ROUTE_ACCESSIBLE_CONCEALED", quantity: 1 }, { key: "OUTLET_EXTENSION_CORE", quantity: 1 }],
  endpoint: "OUTLET",
  configuration: config,
  selections,
});
ok(!missingLength.purchaseComplete && missingLength.unresolvedRequirements.some((gap) => gap.code === "CONCEALED_ROUTE_LENGTH_NOT_ESTABLISHED"), "accessible route without measured footage refuses instead of collapsing to its slack allowance");

const missingSupportRule = computeConcealedRouteMaterialTakeoff({
  components: [{ key: "ELEC_ROUTE_ACCESSIBLE_CONCEALED", quantity: 1 }, { key: "CONCEALED_ROUTE_FT", quantity: 10 }, { key: "OUTLET_EXTENSION_CORE", quantity: 1 }],
  endpoint: "OUTLET",
  configuration: { ...config, supportSpacingFt: null },
  selections,
});
ok(!missingSupportRule.purchaseComplete && missingSupportRule.unresolvedRequirements.some((gap) => gap.code === "SUPPORT_SPACING_NOT_ESTABLISHED"), "accessible route refuses when its cable-support spacing is undeclared");

const cablePolicy = ROUTING_V2_POLICY_DEFINITIONS.find((definition) => definition.key === "concealed_branch.cable_role");
ok(JSON.stringify(cablePolicy?.choices) === JSON.stringify(CONCEALED_BRANCH_CABLE_CHOICES), "template policy offers only canonical concealed cable roles");
ok(cablePolicy?.serviceKeys.includes("rv2-fixture-accessible-outlet") && !cablePolicy.serviceKeys.includes("surface-mounted-outlet"), "concealed policies attach only to services that can consume concealed cable");
const surfacePolicy = ROUTING_V2_POLICY_DEFINITIONS.find((definition) => definition.key === "surface_outlet.branch_conductor_spec");
ok(surfacePolicy?.serviceKeys.includes("surface-mounted-outlet") && !surfacePolicy.serviceKeys.includes("rv2-fixture-accessible-outlet"), "surface policies do not leak into concealed-only fixtures");
ok(ROUTING_V2_POLICY_DEFINITIONS.some((definition) => definition.key === "concealed_branch.cable_slack_per_termination"), "template provisions the concealed-route slack declaration");
ok(ROUTING_V2_POLICY_DEFINITIONS.some((definition) => definition.key === "concealed_branch.back_to_back_cable_allowance"), "template provisions the explicit back-to-back allowance");
ok(ROUTING_V2_POLICY_DEFINITIONS.some((definition) => definition.key === "concealed_branch.cable_support_spacing"), "template provisions accessible cable-support spacing");
ok(ROUTING_V2_POLICY_DEFINITIONS.some((definition) => definition.key === "concealed_branch.support_at_each_termination"), "template provisions the termination-support rule separately");

console.log(`\nCONCEALED ROUTE MATERIAL CONFIGURATION — ${checks}/${checks} checks passed`);
