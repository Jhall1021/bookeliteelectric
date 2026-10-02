import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EXTERIOR_WALL_INCREMENT_FEET,
  exteriorWallIncrementLabor,
} from "../lib/electrical/exteriorWallIncrementPricing";

assert.equal(EXTERIOR_WALL_INCREMENT_FEET, 3);

const prepared = exteriorWallIncrementLabor({
  hoursByOperation: {
    ELEC_FISH_CABLE_CONCEALED: 1 / 60,
    ELEC_DRILL_FRAMING_CROSSING: 0.5 / 60,
    ELEC_CUT_DRYWALL_ACCESS_OPENING: 5 / 60,
  },
  framingSpacingInches: 16,
});
assert.ok(prepared);
assert.equal(prepared.crossingCount, 3, "three feet at 16-inch framing crosses three framing intervals");
assert.ok(Math.abs(prepared.laborHours - 0.325) < 1e-9, "increment uses the three existing labor codes exactly");

const widerFraming = exteriorWallIncrementLabor({
  hoursByOperation: {
    ELEC_FISH_CABLE_CONCEALED: 1 / 60,
    ELEC_DRILL_FRAMING_CROSSING: 0.5 / 60,
    ELEC_CUT_DRYWALL_ACCESS_OPENING: 5 / 60,
  },
  framingSpacingInches: 24,
});
assert.equal(widerFraming?.crossingCount, 2, "the contractor's framing-spacing policy changes the real quantity");
assert.equal(exteriorWallIncrementLabor({
  hoursByOperation: { ELEC_FISH_CABLE_CONCEALED: 1 / 60 },
  framingSpacingInches: 16,
}), null, "missing labor decisions never become a guessed price");

const source = fs.readFileSync("app/api/services/[slug]/route.ts", "utf8");
assert.match(source, /priceExteriorWallFinishedIncrement/);
assert.match(source, /each 3-foot section—(?:or )?portion of one/i);
assert.match(source, /formatCents\(exteriorWallIncrement\.cents\)/);
assert.doesNotMatch(source, /each 3-foot section[^`]*\$\d/);
assert.doesNotMatch(source, /Based on your contractor's current labor and material settings/);

console.log("Exterior-wall 3-foot increment uses established labor, framing and cable inputs.");
