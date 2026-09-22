import assert from "node:assert/strict";
import { classify, loadPolicies, loadWording } from "./_extractCore";

const wording = loadWording();
const policies = loadPolicies();

const reviewBands = [
  ["hot-tub-spa-electrical/spa_distance/within_25", "label", "About 25 feet or less"],
  ["hot-tub-spa-electrical/spa_distance/over_25_or_unsure", "label", "More than 25 feet, or I am not sure"],
  ["level-2-ev-charger/ev_charger_distance/under_25", "label", "25 feet or less"],
  ["level-2-ev-charger/ev_charger_distance/25_to_50", "label", "About 26 to 50 feet"],
  ["level-2-ev-charger/ev_charger_distance/over_50_or_unsure", "label", "More than 50 feet, or I am not sure"],
  ["new-240v-appliance-circuit/appliance_240v_distance/under_25", "label", "25 feet or less"],
  ["new-240v-appliance-circuit/appliance_240v_distance/25_to_50", "label", "About 26 to 50 feet"],
  ["new-240v-appliance-circuit/appliance_240v_distance/over_50_or_unsure", "label", "More than 50 feet, or I am not sure"],
  ["outdoor-landscape-lighting/landscape_distance/under_50", "label", "About 50 feet or less"],
  ["outdoor-landscape-lighting/landscape_distance/50_to_100", "label", "About 51 to 100 feet"],
  ["outdoor-landscape-lighting/landscape_distance/over_100_or_unsure", "label", "More than 100 feet, or I am not sure"],
] as const;

const finishedWall = [
  ["new-120v-outlet/concealed_access_method", "helpText", "Behind the baseboard includes carefully removing and reinstalling the same reusable trim with basic refastening. Replacement trim, repair of existing damage, nail-hole filling, caulking, staining, priming, painting and touch-up are not included. Through drywall means small access openings; drywall repair, patching, sanding and painting are not included."],
  ["new-120v-outlet/concealed_access_method/drywall_access", "label", "Through drywall — repair not included"],
  ["rv2-fixture-finished-wall-outlet/concealed_access_method", "helpText", "Behind the baseboard includes carefully removing and reinstalling the same reusable trim with basic refastening. Replacement trim, repair of existing damage, nail-hole filling, caulking, staining, priming, painting and touch-up are not included. Through drywall means small access openings; drywall repair, patching, sanding and painting are not included."],
  ["rv2-fixture-finished-wall-outlet/concealed_access_method/drywall_access", "label", "Through drywall — repair not included"],
] as const;

for (const [key, field, source] of [...reviewBands, ...finishedWall]) {
  assert.ok(classify(source), `${key}: source should still trigger fail-closed classification`);
  assert.equal(wording[key]?.[field], source, `${key}: authored canonical ${field} is missing or changed`);
  assert.ok((wording[key]?.reason?.length ?? 0) >= 20, `${key}: authored decision needs a reason`);
}

for (const questionKey of ["spa_distance", "ev_charger_distance", "appliance_240v_distance", "landscape_distance"]) {
  assert.equal(
    policies.questions[questionKey],
    undefined,
    `${questionKey}: approximate homeowner review bands must not become contractor pricing policies`,
  );
}
assert.equal(
  policies.definitions["spa_circuit_run.breakpoints"],
  undefined,
  "stale spa pricing breakpoint policy must stay removed",
);

console.log(`Electrical review extraction manifest: ${reviewBands.length + finishedWall.length}/15 authored refusals covered; approximate review bands remain non-pricing context.`);
