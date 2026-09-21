import assert from "node:assert/strict";
import fs from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";

const seed = fs.readFileSync("prisma/seed-appliance-services.ts", "utf8");
assert.ok(seed.includes('"soundbar_concealment"'));
assert.ok(seed.includes('{ questionId: q4.id, label: "Yes", value: "yes", routeAction: "CONTINUE", nextQuestionId: q5.id'));
assert.ok(seed.includes('value: "visible_ok", routeAction: "RESOLVE_INSTANT"'));
assert.ok(seed.includes('value: "conceal_in_wall", routeAction: "PHOTO_REVIEW", photosBlockBooking: true'));
assert.ok(seed.includes('value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true'));
assert.ok(seed.includes("in-wall concealment requires review"));

const decisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => ({
  operationKey: operation.key, hoursPerUnit: 0.25, source: "DIRECT" as const,
}));
const projection = projectElectricalServiceLabor("soundbar-installation", decisions);
assert.equal(projection.kind, "READY_FOR_APPROVAL");
if (projection.kind !== "READY_FOR_APPROVAL") throw new Error("soundbar projection not ready");
assert.deepEqual(projection.projection.lines.map((line) => line.operationKey), ["ELEC_MOUNT_SOUNDBAR"]);
assert.equal(projection.suggestedHours, 0.25);
assert.equal(projection.canPublish, false);

console.log("soundbar bounded package: visible cable prices atomic mount labor; concealment fails to review");
