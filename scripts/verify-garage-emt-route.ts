import assert from "node:assert/strict";
import { loadGarageEmtTakeoff, GARAGE_EMT_ROLES } from "../lib/electrical/loadGarageEmtTakeoff";
import { evaluateGarageEmtAtomicLabor, garageEmtOperationKeys } from "../lib/electrical/garageEmtAtomicLaborBridge";

const roles = Object.values(GARAGE_EMT_ROLES);
const unit = (role: string) => role === GARAGE_EMT_ROLES.conduit || role.startsWith("CONDUCTOR_") ? "ft" : "each";
const db = {
  contractorMaterial: {
    findMany: async () => roles.map((role) => ({
      unitCostCents: 100,
      packageQuantity: 1,
      packageUnit: unit(role),
      packagePriceCents: 100,
      nameOverride: role,
      canonicalMaterial: { key: role, unit: unit(role) },
    })),
  },
};
const components = [
  { key: "ELEC_ROUTE_GARAGE_EMT", quantity: 1 },
  { key: "GARAGE_EMT_ROUTE_FT", quantity: 20 },
  { key: "GARAGE_EMT_BEND", quantity: 2 },
  { key: "GARAGE_EMT_DEVICE_BOX_OUTLET", quantity: 1 },
];
async function main() {
const takeoff = await loadGarageEmtTakeoff(db as never, "contractor", components);
const qty = (role: string) => takeoff.physicalRequirements.filter((item) => item.role === role).reduce((sum, item) => sum + item.quantity, 0);
assert.equal(takeoff.purchaseComplete, true);
assert.equal(qty(GARAGE_EMT_ROLES.conduit), 20, "EMT is charged by the measured foot");
assert.equal(qty(GARAGE_EMT_ROLES.coupling), 1, "two 10-foot sticks require one coupling, not a box");
assert.equal(qty(GARAGE_EMT_ROLES.connector), 2, "one connector is used at each termination");
assert.equal(qty(GARAGE_EMT_ROLES.strap), 3, "20 feet uses end supports plus one intermediate support");
assert.equal(qty(GARAGE_EMT_ROLES.line), 24, "each conductor includes two feet of makeup at each end");
assert.equal(qty(GARAGE_EMT_ROLES.neutral), 24);
assert.equal(qty(GARAGE_EMT_ROLES.ground), 24);
assert.equal(qty(GARAGE_EMT_ROLES.box), 1);
assert.equal(qty(GARAGE_EMT_ROLES.cover), 1);
assert.equal(qty(GARAGE_EMT_ROLES.receptacle), 1);

const labor = evaluateGarageEmtAtomicLabor({
  components,
  takeoff,
  contractorHours: Object.fromEntries(garageEmtOperationKeys().map((key) => [key, 1])),
});
assert.equal(labor.kind, "READY");
if (labor.kind === "READY") {
  assert.equal(labor.facts.emtRouteFeet, 20);
  assert.equal(labor.facts.emtCouplingCount, 1);
  assert.equal(labor.facts.emtConnectorCount, 2);
  assert.equal(labor.facts.emtStrapCount, 3);
  assert.equal(labor.facts.emtBendCount, 2);
  assert.equal(labor.facts.conductorFeet, 72);
}
console.log("garage EMT route: material quantities and atomic labor facts verified");
}

main().catch((error) => { console.error(error); process.exit(1); });
