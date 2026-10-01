import assert from "node:assert/strict";
import fs from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";

const seed = fs.readFileSync("prisma/seed-appliance-services.ts", "utf8");
assert.ok(seed.includes('"soundbar_concealment"'));
assert.ok(seed.includes('{ questionId: q4.id, label: "Yes", value: "yes", routeAction: "CONTINUE", nextQuestionId: q5.id'));
assert.ok(seed.includes('value: "visible_ok", routeAction: "RESOLVE_INSTANT"'));
assert.ok(seed.includes('value: "conceal_in_wall"'));
assert.ok(seed.includes('routeAction: "RESOLVE_ADJUSTED"'));
assert.ok(seed.includes('value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true'));
assert.ok(seed.includes('const concealmentFeet = 6'));
assert.ok(seed.includes('const drywallOpeningCount = 2'));
assert.ok(seed.includes('key: "LOW_VOLTAGE_RING"'));
assert.ok(seed.includes("Drywall patching, sanding, primer and paint are not included"));

const decisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => ({
  operationKey: operation.key, hoursPerUnit: 0.25, source: "DIRECT" as const,
}));
const projection = projectElectricalServiceLabor("soundbar-installation", decisions);
assert.equal(projection.kind, "READY_FOR_APPROVAL");
if (projection.kind !== "READY_FOR_APPROVAL") throw new Error("soundbar projection not ready");
assert.deepEqual(projection.projection.lines.map((line) => line.operationKey), ["ELEC_MOUNT_SOUNDBAR"]);
assert.equal(projection.suggestedHours, 0.25);
assert.equal(projection.canPublish, false);

const concealed = projectElectricalServiceLabor("soundbar-installation", decisions, {
  concealmentIncluded: true,
  concealedCableFeet: 6,
});
assert.equal(concealed.kind, "READY_FOR_APPROVAL");
if (concealed.kind !== "READY_FOR_APPROVAL") throw new Error("concealed soundbar projection not ready");
assert.deepEqual(concealed.projection.lines.map((line) => [line.operationKey, line.quantity]), [
  ["ELEC_MOUNT_SOUNDBAR", 1],
  ["ELEC_FISH_CABLE_CONCEALED", 6],
  ["ELEC_CUT_DRYWALL_ACCESS_OPENING", 2],
]);
assert.equal(concealed.suggestedHours, 2.25);

console.log("soundbar bounded package: concealed branch adds six feet of fishing, two openings and one low-voltage ring");
