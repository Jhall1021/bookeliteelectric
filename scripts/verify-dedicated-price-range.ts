import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEDICATED_PRICE_RANGE_KEY,
  DEDICATED_PRICE_RANGE_VALUE,
  dedicatedCircuitPriceRangeAnswers,
  requestsDedicatedCircuitPriceRange,
} from "../lib/electrical/dedicatedCircuitPriceRange";
import {
  STAIR_WALK_ROUTE_ANSWER_KEYS,
  stairWalkScreens,
  stairWalkToDedicatedAnswers,
  type SwAnswers,
} from "../lib/electrical/stairWalk";
import { routeSectionsAnswerKey } from "../lib/electrical/mixedRouteSections";
import { stairWalkDiagramModel } from "../lib/electrical/stairWalkDiagram";
import { stairWalkToDedicatedCategoryAnswers } from "../lib/electrical/dedicatedCategoryStairWalk";

const measured: SwAnswers = {
  panelPlace: "inside",
  fullFlights: "0",
  halfFlights: "0",
  distanceMethod: "steps",
  distanceSteps: "12",
  finishAck: "accepted",
};
const mode = { routeOnly: true, priceRange: true } as const;
const screens = stairWalkScreens(measured, mode);
assert.deepEqual(screens.map((screen) => screen.id), ["panel", "walk", "stairs", "measure", "confirm"]);
assert.ok(STAIR_WALK_ROUTE_ANSWER_KEYS.includes(DEDICATED_PRICE_RANGE_KEY));
assert.deepEqual(screens.find((screen) => screen.id === "measure")?.fields.map((field) => field.kind), ["distance"]);
assert.equal(screens.some((screen) => ["space", "foundation", "wall"].includes(screen.id)), false);
assert.equal(stairWalkDiagramModel(measured, mode).routeLabel, "Measure this horizontal section");

const mapped = stairWalkToDedicatedAnswers(measured, mode);
assert.equal(mapped.kind, "PRICE_INPUTS");
if (mapped.kind !== "PRICE_INPUTS") throw new Error("expected mapped range inputs");
assert.equal(mapped.answers.dedicated_distance, "30");
assert.equal(
  stairWalkToDedicatedCategoryAnswers(measured, "dedicated-120v-circuit-outlet", mode).kind,
  "PRICE_INPUTS",
);

const endpoints = dedicatedCircuitPriceRangeAnswers({
  ...mapped.answers,
  [DEDICATED_PRICE_RANGE_KEY]: DEDICATED_PRICE_RANGE_VALUE,
  dedicated_distance_doorway: "2",
  [routeSectionsAnswerKey("dedicated_distance")]: "[]",
});
assert.equal(endpoints.low.dedicated_route_access, "accessible");
assert.equal(endpoints.high.dedicated_route_access, "finished");
assert.equal(endpoints.low.dedicated_distance, endpoints.high.dedicated_distance);
assert.equal(endpoints.low.dedicated_distance_doorway, undefined);
assert.equal(endpoints.high[routeSectionsAnswerKey("dedicated_distance")], undefined);
assert.equal(requestsDedicatedCircuitPriceRange(endpoints.high), true);

const engine = readFileSync("components/guided-flow/GuidedFlowEngine.tsx", "utf8");
const card = readFileSync("components/guided-flow/PriceRangeConfirmationCard.tsx", "utf8");
const rangeRoute = readFileSync("app/api/price-range-evaluation/route.ts", "utf8");
const cart = readFileSync("app/[site]/my-visit/page.tsx", "utf8");
assert.match(engine, /\/api\/price-range-evaluation/);
assert.match(engine, /kind: "resolved_range"/);
assert.match(card, /accessible unfinished attic, basement, or crawlspace/i);
assert.match(card, /finished walls and ceilings/i);
assert.match(card, /confirm the route and final price before starting work/i);
assert.match(rangeRoute, /Promise\.all/);
assert.match(rangeRoute, /evaluateStorefrontPrice/);
assert.match(cart, /Estimated maximum/);

console.log("Dedicated circuit price range: shortened intake, server-priced endpoints, disclosure, and maximum cart label verified");
