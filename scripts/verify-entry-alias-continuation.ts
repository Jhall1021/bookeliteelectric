import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isSingleChoiceEntryAlias } from "../lib/entryAlias";

const reroute = { routeAction: "REROUTE_SERVICE", rerouteServiceId: "canonical-service" };
assert.equal(isSingleChoiceEntryAlias({ questions: [{ options: [reroute] }] }), true);
assert.equal(isSingleChoiceEntryAlias({ questions: [{ options: [reroute, reroute] }] }), false);
assert.equal(isSingleChoiceEntryAlias({ questions: [{ options: [{ ...reroute, routeAction: "PHOTO_REVIEW" }] }] }), false);
assert.equal(isSingleChoiceEntryAlias({ questions: [{ options: [{ ...reroute, rerouteServiceId: null }] }] }), false);
assert.equal(isSingleChoiceEntryAlias({ questions: [] }), false);

const engine = readFileSync("components/guided-flow/GuidedFlowEngine.tsx", "utf8");
const notice = readFileSync("components/guided-flow/RerouteNotice.tsx", "utf8");
assert.match(engine, /autoContinue=\{isSingleChoiceEntryAlias\(flow\)\}/);
assert.match(engine, /matchedHandoff[\s\S]*Object\.keys\(carried\)\.length > 0[\s\S]*startQuestions\(\)/);
assert.match(notice, /autoContinue \|\| INTERNAL_RECIPE_ONLY_SERVICE_SLUGS/);

console.log("Entry aliases continue seamlessly into carried destination questions without a wrong-service restart");
