import assert from "node:assert/strict";
import { circuitPackageFor } from "../lib/electrical/circuitPackagePricing";
import policies from "../prisma/template/electrical.policies.json";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const base = {
  dedicated_route_access: "unfinished_basement",
  dedicated_distance: "25_to_50",
  dedicated_finish_ack: "accepted",
};

const fridge = circuitPackageFor("dedicated-120v-circuit-outlet", { ...base, dedicated_equipment: "fridge_freezer" });
ok(fridge?.cableRole === "WIRE_14_2" && fridge.materialRoles.includes("BREAKER_SINGLE_POLE_15A"), "refrigerator/freezer selects the 15A recipe");
const configuredBand = circuitPackageFor("dedicated-120v-circuit-outlet", { ...base, dedicated_equipment: "fridge_freezer" }, [30, 60]);
ok(configuredBand?.routeFeet === 60 && configuredBand.description.includes("60 feet"), "contractor's displayed second distance ceiling drives cable and labor takeoff");
ok(circuitPackageFor("dedicated-120v-circuit-outlet", { ...base, dedicated_equipment: "fridge_freezer", dedicated_distance: "under_25" }, [30, 60])?.routeFeet === 30, "contractor's displayed first distance ceiling drives takeoff");

const sump = circuitPackageFor("dedicated-120v-circuit-outlet", { ...base, dedicated_equipment: "sump_pump" });
ok(sump?.cableRole === "WIRE_12_2" && sump.materialRoles.includes("GFCI_INTERIOR_20A"), "sump pump selects the 20A GFCI recipe");

const fireplace = circuitPackageFor("electric-fireplace-circuit", {
  fireplace_connection: "standard_plug", fireplace_amperage: "20a", fireplace_wall: "ordinary_drywall",
  fireplace_route_access: "accessible_attic", fireplace_distance: "under_25",
});
ok(fireplace?.routeFeet === 25 && fireplace.cableRole === "WIRE_12_2", "fireplace selects its observable 20A recipe and conservative distance ceiling");
ok(circuitPackageFor("electric-fireplace-circuit", {
  fireplace_connection: "standard_plug", fireplace_amperage: "20a", fireplace_wall: "ordinary_drywall",
  fireplace_route_access: "accessible_attic", fireplace_distance: "25_to_50",
}, [30, 60])?.routeFeet === 60, "fireplace uses the displayed contractor distance ceiling");

const dryer = circuitPackageFor("new-240v-appliance-circuit", {
  appliance_240v_type: "dryer", appliance_240v_connection: "four_prong_plug", appliance_240v_endpoint: "surface_box",
  appliance_240v_route_access: "drop_ceiling", appliance_240v_distance: "25_to_50",
});
ok(dryer?.materialRoles.includes("RECEPTACLE_14_30") && dryer.cableRole === "WIRE_10_3", "dryer selects the exact 30A four-wire recipe");
ok(circuitPackageFor("new-240v-appliance-circuit", {
  appliance_240v_type: "dryer", appliance_240v_connection: "four_prong_plug", appliance_240v_endpoint: "surface_box",
  appliance_240v_route_access: "drop_ceiling", appliance_240v_distance: "under_25",
}, [30, 60])?.routeFeet === 30, "dryer uses the displayed contractor distance ceiling");
for (const key of ["dedicated_distance", "fireplace_distance", "appliance_240v_distance"] as const) {
  ok(policies.questions[key].policyKey === "panel_circuit_run.breakpoints" &&
    Object.keys(policies.questions[key].patterns).length === 3,
  `${key} extracts as the same contractor policy its calculator reads`);
}

const range = circuitPackageFor("new-240v-appliance-circuit", {
  appliance_240v_type: "range", appliance_240v_connection: "four_prong_plug", appliance_240v_endpoint: "surface_box",
  appliance_240v_route_access: "combination", appliance_240v_distance: "25_to_50",
});
ok(range?.materialRoles.includes("RECEPTACLE_14_50") && range.cableRole === "WIRE_6_3", "range selects the exact 50A four-wire recipe");

ok(circuitPackageFor("electric-fireplace-circuit", {
  fireplace_connection: "standard_plug", fireplace_amperage: "unsure", fireplace_wall: "ordinary_drywall",
  fireplace_route_access: "accessible_attic", fireplace_distance: "under_25",
}) === null, "unknown fireplace rating remains review-only");
ok(circuitPackageFor("new-240v-appliance-circuit", {
  appliance_240v_type: "dryer", appliance_240v_connection: "nonstandard_or_unsure", appliance_240v_endpoint: "surface_box",
  appliance_240v_route_access: "accessible_attic", appliance_240v_distance: "under_25",
}) === null, "nonstandard appliance connection remains review-only");
ok(circuitPackageFor("dedicated-120v-circuit-outlet", { ...base, dedicated_equipment: "fridge_freezer", dedicated_distance: "over_50" }) === null, "routes over 50 feet remain review-only");

const ethernet = circuitPackageFor("new-ethernet-line", {
  "new-ethernet-line_route_access": "accessible",
  "new-ethernet-line_distance": "51_to_75",
});
ok(ethernet?.routeFeet === 75 && ethernet.cableRole === "CABLE_CAT6"
  && ethernet.materialQuantities?.CABLE_CAT6 === 81,
"the 51–75 foot Ethernet band prices its conservative 75-foot route plus six feet of termination slack");
ok(circuitPackageFor("new-coax-line", {
  "new-coax-line_route_access": "accessible",
  "new-coax-line_distance": "over_75_or_unsure",
}) === null, "low-voltage routes over 75 feet or unknown remain review-only");

console.log(`CIRCUIT FAMILY INSTANT PRICING — ${checks}/${checks} checks passed`);
