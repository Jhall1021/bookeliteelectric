import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST HOMEOWNER DEMO SOURCE CONTRACT\n");

const source = readFileSync("app/dev-fixtures/route-assist-demo/page.tsx", "utf8");

check(
  "demo is isolated outside the tenant/storefront database tree",
  source.includes("RouteAssistDemoPage") &&
    source.includes("Demo") &&
    source.includes("no pricing, materials, booking, or production data is changed"),
);
check(
  "homeowner places A and B rather than receiving pre-placed endpoints",
  source.includes("handleRoomTap") &&
    source.includes("Tap the existing outlet to place A") &&
    source.includes("Now tap where you want the new outlet to place B"),
);
check(
  "placed A/B coordinates become the canonical scan input graph",
  source.includes('id: "source", x: route[0].x, y: route[0].y') &&
    source.includes('id: "destination", x: route[5].x, y: route[5].y') &&
    source.includes("useMemo<RouteAssistScanProviderInputV1 | null>"),
);
check(
  "doorway bypass graph goes up, across the header, and back down",
  source.includes('id: "door-left-bottom"') &&
    source.includes('id: "door-left-top"') &&
    source.includes('id: "door-right-top"') &&
    source.includes('id: "door-right-bottom"') &&
    source.includes("DOOR_HEADER_Y"),
);
check(
  "doorway bypass has five route legs and four explicit flat turns",
  source.includes('id: "leg-5"') &&
    source.includes('pointId: "door-left-bottom"') &&
    source.includes('pointId: "door-left-top"') &&
    source.includes('pointId: "door-right-top"') &&
    source.includes('pointId: "door-right-bottom"') &&
    source.includes('value: "FLAT"'),
);
check(
  "demo uses the shared provider-to-review pipeline",
  source.includes("prepareRouteAssistScanReviewV1(DEMO_PROVIDER, scanInput)"),
);
check(
  "demo visibly traces the doorway bypass route",
  source.includes("<polyline") &&
    source.includes("bypassPoints(source, destination)") &&
    source.includes("Route Assist traced this path"),
);
check(
  "demo uses the reusable human review panel",
  source.includes("<RouteAssistScanReview") &&
    source.includes("review={prepared.review}") &&
    source.includes("onApply={applyReview}"),
);
check(
  "demo applies only IDs plus the displayed review fingerprint",
  source.includes("selection.acceptedReviewItemIds") &&
    source.includes("selection.reviewFingerprint") &&
    source.includes("applyRouteAssistScanReviewSelectionV1"),
);
check(
  "demo uses the canonical Route Assist result builder after review",
  source.includes("buildRouteAssistResult({"),
);
check(
  "demo requires an explicit second route confirmation",
  source.includes('applyConfirmation(draft, "ACCEPTED")') &&
    source.includes("Confirm route"),
);
check(
  "demo uses the existing electrical adapter after confirmation",
  source.includes("adaptRouteAssistResult(confirmed).mapped"),
);
check(
  "demo never imports pricing or MaterialTakeoff",
  !source.includes("MaterialTakeoff") &&
    !source.includes("resolveWithDerivedPricing") &&
    !source.includes("routeResolver"),
);
check(
  "demo preserves exact physical footage in its visible result",
  source.includes("draft.estimatedTotalRouteLengthFt") &&
    source.includes("mapped.routeLengthFt"),
);
check(
  "homeowner can reset and rescan before final confirmation",
  source.includes("resetPoints") && source.includes("Rescan") && source.includes("Try another route"),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
