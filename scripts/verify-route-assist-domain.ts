/**
 * Proves the Route Assist domain — lib/visual-assist/route-assist/* — with
 * no database, no API key, no network. Mirrors
 * scripts/verify-visual-assist-domain.ts's proof style: everything here is
 * pure data in, pure data out.
 *
 * Run: npx tsx scripts/verify-route-assist-domain.ts
 */

import {
  applyConfirmation,
  buildRouteAssistResult,
  accessOpeningRangeIsValid,
  confirmationInvariantHolds,
  contractorSummary,
  homeownerSummaryLines,
  isRouteAssistIncomplete,
  registryViolations,
  summaryLanguageViolations,
} from "../lib/visual-assist/route-assist";
import type { RouteAssistCaptureInput, RoutePoint, RouteSegment } from "../lib/visual-assist/route-assist/types";
import { ROUTE_ASSIST_DESTINATION_TYPES, ROUTE_ASSIST_MODES } from "../lib/visual-assist/route-assist/taxonomy";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok — ${name}`);
  } else {
    failures++;
    console.error(`  FAIL — ${name}${detail ? `: ${detail}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n${title}`);
}

const IMAGE = "img_1";
function point(p: Partial<RoutePoint> & Pick<RoutePoint, "id" | "x" | "y" | "kind">): RoutePoint {
  return { imageId: IMAGE, surface: null, obstacle: null, ...p };
}
function segment(s: Partial<RouteSegment> & Pick<RouteSegment, "id" | "fromPointId" | "toPointId">): RouteSegment {
  return { surface: null, estimatedLengthFt: null, transitionAtEnd: null, ...s };
}
function artifacts() {
  return { imageIds: [IMAGE], overlayImageIds: [] };
}

// ---------------------------------------------------------------------------
section("1. Taxonomy exhaustiveness");
// ---------------------------------------------------------------------------
check("modes are exactly SURFACE / CONCEALED / UNSURE", JSON.stringify(ROUTE_ASSIST_MODES) === JSON.stringify(["SURFACE", "CONCEALED", "UNSURE"]));
check(
  "destination types cover the brief's §2 list",
  ["RECEPTACLE", "SWITCH", "WALL_LIGHT", "CEILING_LIGHT", "SURFACE_BOX", "OTHER"].every((v) =>
    (ROUTE_ASSIST_DESTINATION_TYPES as readonly string[]).includes(v)
  )
);

// ---------------------------------------------------------------------------
section("2. Invariants — walk the real registry");
// ---------------------------------------------------------------------------
const violations = registryViolations();
check("zero forbidden-token violations across taxonomy + result fields", violations.length === 0, violations.join("; "));

// ---------------------------------------------------------------------------
section("Proof A — surface receptacle: 5ft vertical, inside corner, 12ft horizontal");
// ---------------------------------------------------------------------------
{
  const points: RoutePoint[] = [
    point({ id: "S", x: 0.2, y: 0.8, kind: "SOURCE" }),
    point({ id: "W1", x: 0.2, y: 0.3, kind: "WAYPOINT" }),
    point({ id: "D", x: 0.8, y: 0.3, kind: "DESTINATION" }),
  ];
  const segments: RouteSegment[] = [
    segment({ id: "s1", fromPointId: "S", toPointId: "W1", surface: "WALL", estimatedLengthFt: 5 }),
    segment({ id: "s2", fromPointId: "W1", toPointId: "D", surface: "WALL", estimatedLengthFt: 12 }),
  ];
  const input: RouteAssistCaptureInput = {
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points,
    segments,
    drywallAccessAllowed: null,
    captureArtifacts: artifacts(),
  };
  const outcome = buildRouteAssistResult(input);
  check("produces a result, not an incompleteness", !isRouteAssistIncomplete(outcome));
  if (!isRouteAssistIncomplete(outcome)) {
    check("destination is RECEPTACLE", outcome.destinationType === "RECEPTACLE");
    check("mode is SURFACE", outcome.mode === "SURFACE");
    check("exactly one corner", outcome.insideCornersCount + outcome.outsideCornersCount === 1);
    check("one vertical run", outcome.verticalTransitionsCount === 1);
    check("total length is 17 ft (5 + 12)", outcome.estimatedTotalRouteLengthFt === 17);
    const confirmed = applyConfirmation(outcome, "ACCEPTED");
    check("confirmed route needs no review (surface mode)", confirmed.needsContractorReview === false);
    check("confirmation invariant holds", confirmationInvariantHolds(confirmed));
    const homeownerText = homeownerSummaryLines(confirmed).join(" ");
    const contractorText = contractorSummary(confirmed);
    check("homeowner summary language is clean", summaryLanguageViolations(homeownerText).length === 0);
    check("contractor summary language is clean", summaryLanguageViolations(contractorText).length === 0);
    check("contractor summary says review not required", contractorText.includes("Review:\n  Not required"));
  }
}

// ---------------------------------------------------------------------------
section("Proof B — surface switch: horizontal raceway, doorway bypass");
// ---------------------------------------------------------------------------
{
  const points: RoutePoint[] = [
    point({ id: "S", x: 0.1, y: 0.5, kind: "SOURCE" }),
    point({ id: "W1", x: 0.5, y: 0.5, kind: "WAYPOINT", obstacle: "DOORWAY" }),
    point({ id: "D", x: 0.9, y: 0.5, kind: "DESTINATION" }),
  ];
  const segments: RouteSegment[] = [
    segment({ id: "s1", fromPointId: "S", toPointId: "W1", surface: "WALL", estimatedLengthFt: 6 }),
    segment({ id: "s2", fromPointId: "W1", toPointId: "D", surface: "WALL", estimatedLengthFt: 6 }),
  ];
  const outcome = buildRouteAssistResult({
    mode: "SURFACE",
    destinationType: "SWITCH",
    points,
    segments,
    drywallAccessAllowed: null,
    captureArtifacts: artifacts(),
  });
  check("produces a result, not an incompleteness", !isRouteAssistIncomplete(outcome));
  if (!isRouteAssistIncomplete(outcome)) {
    check("destination is SWITCH", outcome.destinationType === "SWITCH");
    check("one doorway bypass identified", outcome.doorwayBypassesCount === 1);
    check("doorway point isn't double-counted as a corner", outcome.insideCornersCount + outcome.outsideCornersCount === 0);
    check("mode is SURFACE", outcome.mode === "SURFACE");
  }
}

// ---------------------------------------------------------------------------
section("Proof C — surface ceiling fixture: vertical rise, wall-to-ceiling, ceiling run");
// ---------------------------------------------------------------------------
{
  const points: RoutePoint[] = [
    point({ id: "S", x: 0.2, y: 0.9, kind: "SOURCE" }),
    point({ id: "W1", x: 0.2, y: 0.3, kind: "WAYPOINT" }),
    point({ id: "D", x: 0.7, y: 0.3, kind: "DESTINATION" }),
  ];
  const segments: RouteSegment[] = [
    segment({ id: "s1", fromPointId: "S", toPointId: "W1", surface: "WALL", estimatedLengthFt: 8, transitionAtEnd: true }),
    segment({ id: "s2", fromPointId: "W1", toPointId: "D", surface: "CEILING", estimatedLengthFt: 6 }),
  ];
  const outcome = buildRouteAssistResult({
    mode: "SURFACE",
    destinationType: "CEILING_LIGHT",
    points,
    segments,
    drywallAccessAllowed: null,
    captureArtifacts: artifacts(),
  });
  check("produces a result, not an incompleteness", !isRouteAssistIncomplete(outcome));
  if (!isRouteAssistIncomplete(outcome)) {
    check("destination is CEILING_LIGHT", outcome.destinationType === "CEILING_LIGHT");
    check("one wall-to-ceiling transition", outcome.wallToCeilingTransitionsCount === 1);
    check("one vertical run before the transition", outcome.verticalTransitionsCount === 1);
    check("this is a multi-segment route (2 segments)", outcome.segments.length === 2);
    check("no wall-to-floor transition invented", outcome.wallToFloorTransitionsCount === 0);
  }
}

// ---------------------------------------------------------------------------
section("Proof D — concealed: different wall, one doorway, drywall cuts allowed");
// ---------------------------------------------------------------------------
{
  const points: RoutePoint[] = [
    point({ id: "S", x: 0.1, y: 0.5, kind: "SOURCE" }),
    point({ id: "W1", x: 0.5, y: 0.5, kind: "WAYPOINT", obstacle: "DOORWAY" }),
    point({ id: "D", x: 0.9, y: 0.2, kind: "DESTINATION" }),
  ];
  const segments: RouteSegment[] = [
    segment({ id: "s1", fromPointId: "S", toPointId: "W1", surface: "WALL", estimatedLengthFt: 10, transitionAtEnd: true }),
    segment({ id: "s2", fromPointId: "W1", toPointId: "D", surface: "WALL", estimatedLengthFt: 8 }),
  ];
  const outcome = buildRouteAssistResult({
    mode: "CONCEALED",
    destinationType: "RECEPTACLE",
    points,
    segments,
    drywallAccessAllowed: true,
    captureArtifacts: artifacts(),
  });
  check("produces a result, not an incompleteness", !isRouteAssistIncomplete(outcome));
  if (!isRouteAssistIncomplete(outcome)) {
    check("mode is CONCEALED", outcome.mode === "CONCEALED");
    check("different wall (sameWall === false)", outcome.sameWall === false);
    check("one doorway between locations", outcome.doorwayBypassesCount === 1);
    check("complexity is a real, non-null classification", outcome.concealedRouteComplexity !== null);
    check("access-opening range is a valid range, not an exact count", accessOpeningRangeIsValid(outcome));
    check(
      "min is strictly less than max",
      outcome.suggestedAccessOpeningsMin != null &&
        outcome.suggestedAccessOpeningsMax != null &&
        outcome.suggestedAccessOpeningsMax > outcome.suggestedAccessOpeningsMin
    );

    const confirmed = applyConfirmation(outcome, "ACCEPTED");
    const homeownerText = homeownerSummaryLines(confirmed).join(" ");
    const contractorText = contractorSummary(confirmed);
    check("no summary claims to know the hidden wire path", summaryLanguageViolations(homeownerText).length === 0);
    check("no summary claims to know the hidden wire path (contractor)", summaryLanguageViolations(contractorText).length === 0);
    check(
      "homeowner summary never states an exact hole count (says 'complexity', not a number of holes)",
      !homeownerText.toLowerCase().includes(" holes")
    );
  }
}

// ---------------------------------------------------------------------------
section("Uncertainty handling — §22");
// ---------------------------------------------------------------------------
{
  const sourceOnly: RoutePoint[] = [point({ id: "S", x: 0.1, y: 0.5, kind: "SOURCE" })];
  const outcome = buildRouteAssistResult({
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points: sourceOnly,
    segments: [],
    drywallAccessAllowed: null,
    captureArtifacts: artifacts(),
  });
  check("missing destination produces RouteAssistIncomplete", isRouteAssistIncomplete(outcome));
  if (isRouteAssistIncomplete(outcome)) {
    check("reason is DESTINATION_NOT_CLEAR", outcome.reason === "DESTINATION_NOT_CLEAR");
    check("recovery is RETAKE_PHOTO, never a guessed result", outcome.recovery === "RETAKE_PHOTO");
  }

  // A branched graph (two segments leaving the source) is not a single line.
  const branchedPoints: RoutePoint[] = [
    point({ id: "S", x: 0.1, y: 0.5, kind: "SOURCE" }),
    point({ id: "D1", x: 0.5, y: 0.5, kind: "DESTINATION" }),
    point({ id: "D2", x: 0.5, y: 0.9, kind: "WAYPOINT" }),
  ];
  const branchedSegments: RouteSegment[] = [
    segment({ id: "s1", fromPointId: "S", toPointId: "D1" }),
    segment({ id: "s2", fromPointId: "S", toPointId: "D2" }),
  ];
  const branchedOutcome = buildRouteAssistResult({
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points: branchedPoints,
    segments: branchedSegments,
    drywallAccessAllowed: null,
    captureArtifacts: artifacts(),
  });
  check(
    "a branching route refuses rather than picking one branch",
    isRouteAssistIncomplete(branchedOutcome) && branchedOutcome.reason === "MULTIPLE_POSSIBLE_ROUTES"
  );
}

// ---------------------------------------------------------------------------
section("Confirmation flow — §11");
// ---------------------------------------------------------------------------
{
  const points: RoutePoint[] = [
    point({ id: "S", x: 0.1, y: 0.5, kind: "SOURCE" }),
    point({ id: "D", x: 0.9, y: 0.5, kind: "DESTINATION" }),
  ];
  const segments: RouteSegment[] = [segment({ id: "s1", fromPointId: "S", toPointId: "D", surface: "WALL", estimatedLengthFt: 8 })];
  const outcome = buildRouteAssistResult({
    mode: "SURFACE",
    destinationType: "RECEPTACLE",
    points,
    segments,
    drywallAccessAllowed: null,
    captureArtifacts: artifacts(),
  });
  if (!isRouteAssistIncomplete(outcome)) {
    check("fresh result is unconfirmed and needs review", outcome.customerConfirmedRoute === false && outcome.needsContractorReview === true);
    const adjusted = applyConfirmation(outcome, "ADJUSTED");
    check("ADJUSTED never confirms", adjusted.customerConfirmedRoute === false && adjusted.needsContractorReview === true);
    const retake = applyConfirmation(outcome, "RETAKE");
    check("RETAKE never confirms", retake.customerConfirmedRoute === false && retake.needsContractorReview === true);
    const accepted = applyConfirmation(outcome, "ACCEPTED");
    check("ACCEPTED confirms", accepted.customerConfirmedRoute === true);
    check("confirmation invariant holds for every decision", [adjusted, retake, accepted].every(confirmationInvariantHolds));
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
