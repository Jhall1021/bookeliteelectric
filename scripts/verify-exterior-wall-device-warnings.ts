import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT,
  EXTERIOR_SWITCH_CONTINGENCY_TEXT,
  EXTERIOR_WALL_CONTINGENCY_TEXT,
  EXTERIOR_WALL_QUESTION_HELP,
} from "../lib/electrical/exteriorWallContingency";

for (const text of [EXTERIOR_WALL_CONTINGENCY_TEXT, EXTERIOR_SWITCH_CONTINGENCY_TEXT]) {
  assert.match(text, /If openings are needed/i);
  assert.match(text, /additional price before proceeding/i);
  assert.match(text, /Drywall repair and painting are not included/i);
  assert.doesNotMatch(text, /nearest reachable interior wall|insulation|low roof clearance|window or door header/i);
  assert.doesNotMatch(text, /\$\d/);
}
assert.equal(EXTERIOR_WALL_QUESTION_HELP, "Exterior walls can require extra wire and small drywall openings.");
assert.match(EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT, /can't always snake wire up or down an exterior wall/i);
assert.match(EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT, /nearest reachable interior wall/i);
assert.match(EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT, /finished drywall \(sheetrock\)/i);
assert.match(EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT, /patching and painting are not included/i);
assert.doesNotMatch(EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT, /\$\d/);

const outlet = fs.readFileSync("prisma/seed-new-outlet-v2.ts", "utf8");
assert.match(outlet, /\[qExterior\.id, "exterior"\]/);
assert.match(outlet, /\[qAtticExterior\.id, "exterior"\]/);
assert.match(outlet, /helpText: EXTERIOR_WALL_QUESTION_HELP/g);
assert.doesNotMatch(outlet, /\[qWindow\.id, "no"\][\s\S]{0,80}\[qExteriorAck\.id, "continue"\]/);

const lighting = fs.readFileSync("prisma/seed-route-complete-extensions.ts", "utf8");
assert.match(lighting, /key: "extension_new_switch_exterior_wall"/);
assert.match(lighting, /key: "extension_sconce_exterior_wall"/);
assert.match(lighting, /nextQuestionId: qSwitchExterior\.id/);
assert.match(lighting, /routeAction: qSconceExterior \|\| accessBeforeControl \? "CONTINUE" : "RESOLVE_ADJUSTED"/);
assert.match(lighting, /target\.slug === "new-wall-sconce"/);
assert.doesNotMatch(lighting, /value: \{ in: \["exterior", "unsure"\] \}/);

const repair = fs.readFileSync("scripts/repair-exterior-wall-device-warnings-2026-10-01.ts", "utf8");
assert.match(repair, /const CONTRACTORS = \["elite-electric", "electrical-onboarding-test"\]/);
assert.match(repair, /const LIGHTING_SLUGS = \[/);
assert.doesNotMatch(repair, /new-ceiling-fan/);
assert.doesNotMatch(repair, /surface-mounted/);
assert.doesNotMatch(repair, /value: \{ in: \["exterior", "unsure"\] \}/);

const publisher = fs.readFileSync("scripts/shorten-exterior-wall-copy-2026-10-02.ts", "utf8");
assert.match(publisher, /const CONTRACTORS = \["elite-electric", "electrical-onboarding-test"\]/);
assert.match(publisher, /value: "unsure"/);
assert.match(publisher, /answerOptionDisclaimer\.deleteMany/);

const exteriorGfci = fs.readFileSync("scripts/activate-exterior-gfci-wall-contingency-2026-10-06.ts", "utf8");
assert.match(exteriorGfci, /priceExteriorWallFinishedIncrement/);
assert.match(exteriorGfci, /questionDisclaimer\.upsert/);
assert.match(exteriorGfci, /answerOptionDisclaimer\.upsert/);
assert.match(exteriorGfci, /templateAnswerOptionDisclaimer\.upsert/);
assert.match(exteriorGfci, /accessClass: "ACCESSIBLE"/);
assert.match(exteriorGfci, /SUPPORTED_VALUES = \["under_10", "10_to_20"\]/);

console.log("Exterior-wall warning scope and copy verified.");
