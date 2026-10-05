import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { outletEndpointMaterialRole } from "../lib/electrical/outletLoad";

assert.equal(outletEndpointMaterialRole({ outlet_load_type: "bidet" }), "GFCI_INTERIOR");
assert.equal(outletEndpointMaterialRole({ outlet_load_type: "everyday" }), undefined);

const outletSeed = readFileSync("prisma/seed-outlet-power-source.ts", "utf8");
assert.match(outletSeed, /label: "A bidet seat or smart toilet"/);
assert.match(outletSeed, /value: "bidet"[\s\S]*nextQuestionId: entry\.id/);
assert.match(outletSeed, /Includes the required GFCI-protected bathroom outlet/);
assert.match(outletSeed, /value: "dedicated_equipment"/);
assert.doesNotMatch(outletSeed, /value: "(?:motor_appliance|heating_appliance|shop_equipment)"/);

const dedicatedSeed = readFileSync("prisma/seed-dedicated-circuit.ts", "utf8");
assert.doesNotMatch(dedicatedSeed, /label: "Bidet or smart toilet"/);

const provisioning = readFileSync("lib/templateProvisioning.ts", "utf8");
assert.match(provisioning, /slug !== "bidet-smart-toilet-outlet"/);

const runtimeRoles = readFileSync("lib/electrical/preparedRuntimeMaterialRoles.ts", "utf8");
assert.match(runtimeRoles, /slug === "new-120v-outlet"[\s\S]*\["GFCI_INTERIOR"\]/);

const repair = readFileSync("scripts/merge-bidet-into-new-outlet-2026-10-01.ts", "utf8");
assert.match(repair, /active: false, offered: false/);
assert.match(repair, /outlet_load_type/);
assert.match(repair, /dedicated_equipment/);

console.log("Bidet/smart-toilet scope lives inside New 120V Outlet with a GFCI endpoint and no dedicated-circuit listing.");
