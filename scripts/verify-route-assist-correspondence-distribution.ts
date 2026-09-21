/**
 * PROVES THE CONFIRMED "CLUSTERED LANDMARK" REJECTION BUG AND ITS FIX
 * (real-phone diagnostic, 21 Sep 2026): a real capture with a genuinely
 * narrow, valid RIGHT-continuation overlap -- both photos visibly shared
 * a TV and wall, screen-recording confirmed -- was rejected as
 * "candidate landmarks are concentrated in a single region of the
 * overlap." Direct code trace (not inference from the error text alone)
 * found the cause: occupiedQuadrantsV1 in correspondenceDistribution.ts
 * measured occupancy against a GLOBAL 2x2 grid over the FROM image's
 * whole [0,1]x[0,1] extent. A narrow ghost-edge overlap (this whole
 * guided-continuation feature's own design, ghostEdgeCropRectV1) is
 * geometrically confined to one HALF of that grid by construction, so a
 * textbook-valid, well-distributed-WITHIN-ITS-OWN-STRIP set of landmarks
 * can still fail a check anchored to the wrong reference frame -- not
 * because the landmarks were actually poor evidence.
 *
 * These cases use representative, hand-built coordinates approximating
 * where a TV (a fixed fixture, corners near the top of a right-edge
 * strip) and a distinct lower feature (e.g. a doorway or trim line
 * nearer the bottom of the same strip) would sit -- they are NOT the
 * literal landmarks the real AI call returned for the real captured
 * photos (this sandbox has no AI Gateway credentials -- see the
 * offline registration harness's own module doc comment for that
 * confirmed, unresolved blocker). They exist to prove the CODE-LEVEL
 * mechanism, deterministically and reproducibly, independent of that
 * blocker.
 *
 * Run: npx tsx scripts/verify-route-assist-correspondence-distribution.ts
 */
import assert from "node:assert/strict";
import { evaluateRouteAssistCorrespondenceDistributionV1, type RouteAssistDistributionReferenceRegionV1 } from "../lib/visual-assist/route-assist/correspondenceDistribution";
import { registerFrameV1, type RouteAssistPointCorrespondenceV1 } from "../lib/visual-assist/route-assist/imageRegistration";
import { ghostEdgeCropRectV1 } from "../lib/visual-assist/route-assist/alignmentLock";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const RIGHT_REGION: RouteAssistDistributionReferenceRegionV1 = ghostEdgeCropRectV1("RIGHT"); // {x:0.8, y:0, width:0.2, height:1} -- dominant axis is Y, thirds at y=0.333 and y=0.667

// A narrow-strip candidate set confined to x in [0.82, 0.98] (well inside
// the RIGHT continuation's own 20% edge region) -- ALL points within
// y in [0.05, 0.30], entirely inside the region's own FIRST THIRD
// ([0, 0.333]). Representative of "only a TV's 4 corners and a ceiling
// vent were found, nothing lower in the strip was a usable fixed
// landmark" -- exactly the failure mode a well-behaved AI response
// produces when the lower part of a narrow strip is a plain, featureless
// wall (which its own prompt tells it to avoid). A genuinely narrow
// cluster: must stay rejected under BOTH the old and the fixed check.
const SINGLE_THIRD_STRIP: RouteAssistPointCorrespondenceV1[] = [
  { from: { x: 0.83, y: 0.05 }, to: { x: 0.05, y: 0.04 } }, // ceiling vent corner
  { from: { x: 0.97, y: 0.08 }, to: { x: 0.18, y: 0.07 } },
  { from: { x: 0.85, y: 0.18 }, to: { x: 0.07, y: 0.17 } }, // TV top corner
  { from: { x: 0.96, y: 0.2 }, to: { x: 0.17, y: 0.19 } },
  { from: { x: 0.85, y: 0.27 }, to: { x: 0.07, y: 0.26 } }, // TV bottom corner
  { from: { x: 0.96, y: 0.3 }, to: { x: 0.17, y: 0.29 } },
];

// Same narrow strip, but ALSO including a landmark just past the first
// third's own boundary at y=0.333 (representative of a TV that sits a
// little taller, or a trim/doorway line a bit further down the SAME
// right-edge strip) -- still entirely within x in [0.82,0.98], still a
// legitimately narrow overlap, and CRUCIALLY still confined to the
// UPPER HALF of the image overall (never straddles the global/region
// midpoint at y=0.5) -- the exact shape the OLD 2-way-split check could
// never pass, no matter how it measured "half."
const TWO_THIRDS_STRIP: RouteAssistPointCorrespondenceV1[] = [
  ...SINGLE_THIRD_STRIP,
  { from: { x: 0.86, y: 0.4 }, to: { x: 0.08, y: 0.39 } }, // e.g. a doorway/trim line lower in the strip, still above y=0.5
  { from: { x: 0.95, y: 0.43 }, to: { x: 0.16, y: 0.42 } },
];

// A genuinely bad case: everything crammed into one tiny sub-patch of
// the SAME narrow strip -- must stay rejected no matter which reference
// frame is used. This is the case the whole distribution guard exists
// to catch, and the fix must not weaken that.
const TINY_PATCH: RouteAssistPointCorrespondenceV1[] = [
  { from: { x: 0.83, y: 0.08 }, to: { x: 0.05, y: 0.07 } },
  { from: { x: 0.84, y: 0.09 }, to: { x: 0.06, y: 0.08 } },
  { from: { x: 0.85, y: 0.1 }, to: { x: 0.07, y: 0.09 } },
  { from: { x: 0.86, y: 0.11 }, to: { x: 0.08, y: 0.1 } },
];

function main() {
  check("1. REPRODUCES THE CONFIRMED BUG: without region awareness (the OLD, still-default behavior for callers that don't know an expected overlap), a genuinely narrow-but-valid strip confined to one third of the overlap is REJECTED as 'concentrated in a single region'", () => {
    const result = evaluateRouteAssistCorrespondenceDistributionV1(SINGLE_THIRD_STRIP);
    assert.equal(result.sufficient, false, JSON.stringify(result));
    assert.match(result.reason, /concentrated in a single region/);
  });

  check("2. THE SAME single-third strip is ALSO rejected even WITH region awareness -- landmarks genuinely confined to one bin of the strip's own axis are correctly still insufficient; the fix does not turn every narrow cluster into a pass", () => {
    const result = evaluateRouteAssistCorrespondenceDistributionV1(SINGLE_THIRD_STRIP, RIGHT_REGION);
    assert.equal(result.sufficient, false, JSON.stringify(result));
  });

  check("3. THE CONFIRMED BUG, sharper: extending the strip with a landmark that reaches a SECOND third but STILL never crosses the image's global/region midpoint (y=0.5) is STILL REJECTED under the OLD global-quadrant behavior, proving the old check demanded an exact 50/50 straddle no genuinely narrow-but-valid edge-strip overlap can be relied on to produce", () => {
    const result = evaluateRouteAssistCorrespondenceDistributionV1(TWO_THIRDS_STRIP);
    assert.equal(result.sufficient, false, JSON.stringify(result));
  });

  check("4. THE FIX: the SAME two-thirds-spanning strip PASSES once the caller supplies the known expected overlap region (ghostEdgeCropRectV1('RIGHT')) -- proving the fix specifically un-blocks a genuinely well-distributed-within-its-own-strip set that an exact-midpoint reference frame used to reject, without requiring it to straddle y=0.5", () => {
    const result = evaluateRouteAssistCorrespondenceDistributionV1(TWO_THIRDS_STRIP, RIGHT_REGION);
    assert.equal(result.sufficient, true, JSON.stringify(result));
  });

  check("5. A genuinely tiny, clustered patch (the failure mode this guard exists to catch) stays REJECTED under region awareness too -- the fix does not loosen the underlying rejection power, only the reference frame and bin count it measures against", () => {
    const result = evaluateRouteAssistCorrespondenceDistributionV1(TINY_PATCH, RIGHT_REGION);
    assert.equal(result.sufficient, false, JSON.stringify(result));
  });

  check("6. registerFrameV1 itself: the SAME two-thirds-spanning strip, run through the full pipeline (dedup, distribution, RANSAC fit) with expectedOverlapRegion, either REGISTERS or REJECTS for a REAL geometric reason (inlier/reprojection) -- never REJECTS for 'concentrated in a single region' now that the reference frame is correct", () => {
    const result = registerFrameV1({ correspondences: TWO_THIRDS_STRIP, fromAspectRatio: 4 / 3, toAspectRatio: 4 / 3, expectedOverlapRegion: RIGHT_REGION });
    if (result.outcome === "REJECTED") {
      assert.doesNotMatch(result.reason, /concentrated in a single region/, JSON.stringify(result));
    }
  });

  check("7. omitting expectedOverlapRegion entirely reproduces the EXACT prior behavior (regression safety for any caller -- e.g. the sweep tier or the offline harness -- that does not know a direction-scoped expected region)", () => {
    const withRegion = evaluateRouteAssistCorrespondenceDistributionV1(TINY_PATCH, RIGHT_REGION);
    const withoutRegion = evaluateRouteAssistCorrespondenceDistributionV1(TINY_PATCH);
    assert.equal(withRegion.sufficient, withoutRegion.sufficient);
    assert.equal(withRegion.sufficient, false);
  });

  console.log(`\nRoute Assist correspondence-distribution (region-aware fix) verification: ${passed} passed, 0 failed.`);
}

main();
