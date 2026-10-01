import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EXTERIOR_SWITCH_CONTINGENCY_TEXT,
  EXTERIOR_WALL_CONTINGENCY_TEXT,
} from "../lib/electrical/exteriorWallContingency";

for (const text of [EXTERIOR_WALL_CONTINGENCY_TEXT, EXTERIOR_SWITCH_CONTINGENCY_TEXT]) {
  assert.match(text, /nearest reachable interior wall/i);
  assert.match(text, /inaccessible finished-wall route/i);
  assert.match(text, /updated price before proceeding/i);
  assert.match(text, /patching and painting are not included/i);
  assert.doesNotMatch(text, /\$\d/);
}

const outlet = fs.readFileSync("prisma/seed-new-outlet-v2.ts", "utf8");
assert.match(outlet, /\[qExterior\.id, "exterior"\]/);
assert.match(outlet, /\[qAtticExterior\.id, "exterior"\]/);
assert.doesNotMatch(outlet, /\[qWindow\.id, "no"\][\s\S]{0,80}\[qExteriorAck\.id, "continue"\]/);

const lighting = fs.readFileSync("prisma/seed-route-complete-extensions.ts", "utf8");
assert.match(lighting, /key: "extension_new_switch_exterior_wall"/);
assert.match(lighting, /key: "extension_sconce_exterior_wall"/);
assert.match(lighting, /nextQuestionId: qSwitchExterior\.id/);
assert.match(lighting, /routeAction: qSconceExterior \? "CONTINUE" : "RESOLVE_ADJUSTED"/);
assert.match(lighting, /target\.slug === "new-wall-sconce"/);

const repair = fs.readFileSync("scripts/repair-exterior-wall-device-warnings-2026-10-01.ts", "utf8");
assert.match(repair, /const CONTRACTORS = \["elite-electric", "electrical-onboarding-test"\]/);
assert.match(repair, /const LIGHTING_SLUGS = \[/);
assert.doesNotMatch(repair, /new-ceiling-fan/);
assert.doesNotMatch(repair, /surface-mounted/);

console.log("Exterior-wall warning scope and copy verified.");
