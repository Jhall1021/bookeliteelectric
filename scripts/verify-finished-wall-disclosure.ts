import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  appendFinishedWallDisclosure,
  FINISHED_WALL_METHOD_DISCLOSURE,
  hasFinishedAccess,
  isFinishedWallDisclosureQuestion,
} from "../lib/electrical/finishedWallDisclosure";

assert.match(FINISHED_WALL_METHOD_DISCLOSURE, /choose the practical method/i);
assert.match(FINISHED_WALL_METHOD_DISCLOSURE, /drywall pieces.*baseboard back and secure/i);
assert.match(FINISHED_WALL_METHOD_DISCLOSURE, /Caulking, spackling.*painting.*not included/i);
assert.equal(hasFinishedAccess({ PRIMARY: "FINISHED" }), true);
assert.equal(hasFinishedAccess({ PRIMARY: "ACCESSIBLE" }), false);
assert.equal(isFinishedWallDisclosureQuestion("concealed_access_method"), true);
assert.equal(isFinishedWallDisclosureQuestion("fixture_finish_ack"), true);
assert.equal(isFinishedWallDisclosureQuestion("fan_finished_route_confirm"), true);
assert.equal(
  appendFinishedWallDisclosure(["Route-specific fact."], true),
  `Route-specific fact. ${FINISHED_WALL_METHOD_DISCLOSURE}`,
);

const root = process.cwd();
const moduleSource = fs.readFileSync(path.join(root, "prisma/_finishedWallModule.ts"), "utf8");
assert.match(moduleSource, /value: "best_practical"/);
assert.doesNotMatch(moduleSource, /label: "Behind the baseboard"/);
assert.doesNotMatch(moduleSource, /label: "Through drywall/);
assert.match(moduleSource, /ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS/);

const operationSource = fs.readFileSync(path.join(root, "lib/electrical/atomicLabor.ts"), "utf8");
assert.match(operationSource, /Cut, protect and resecure one drywall access piece/);
assert.match(operationSource, /put it back and secure it/);

const browserSource = fs.readFileSync(path.join(root, "components/guided-flow/QuestionStep.tsx"), "utf8");
assert.match(browserSource, /option\.accessClassification === "FINISHED"/);
assert.match(browserSource, /isFinishedWallDisclosureQuestion\(question\.key\)/);

console.log("\nFINISHED-WALL DISCLOSURE — shared wording, contractor-selected method, and retained-piece restoration verified\n");
