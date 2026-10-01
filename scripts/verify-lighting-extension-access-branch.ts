import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lightingExtensionRouteTransitions } from "../prisma/seed-route-complete-extensions";

const transitions = lightingExtensionRouteTransitions({
  surface: "extension_route_surface",
  clear: "extension_route_clear",
});

assert.deepEqual(
  Object.keys(transitions),
  ["finished", "surface"],
  "finished-construction routing still owns the finish and obstruction questions",
);

assert.deepEqual(
  [transitions.finished, transitions.surface],
  ["extension_route_surface", "extension_route_clear"],
  "only a finished-construction route must ask about finish and visible obstructions before resolving",
);

const seed = readFileSync("prisma/seed-route-complete-extensions.ts", "utf8");
assert.match(seed, /const accessBeforeControl = target\.slug === "new-ceiling-light"/);
assert.match(seed, /entryAfterExisting = qSupply\?\.id \?\? \(accessBeforeControl \? qHeight\.id : qControl\.id\)/);
assert.match(seed, /qSconceExterior\?\.id \?\? \(accessBeforeControl \? qControl\.id : null\)/);
assert.match(seed, /questionId: qClear\.id[\s\S]{0,300}accessBeforeControl \? qControl\.id : null/);
assert.match(seed, /questionId: qExistingSwitchFeet\.id[\s\S]{0,300}accessBeforeControl \? "RESOLVE_ADJUSTED" : "CONTINUE"/);
assert.match(seed, /questionId: qExistingFixtureFeet\.id[\s\S]{0,300}accessBeforeControl \? "RESOLVE_ADJUSTED" : "CONTINUE"/);
assert.match(seed, /questionId: qSwitchExterior\.id[\s\S]{0,300}accessBeforeControl \? "RESOLVE_ADJUSTED" : "CONTINUE"/);

console.log("lighting extension routing: new ceiling light establishes access before source and measurement; accessible skips finished-surface questions");
