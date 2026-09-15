import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST HOMEOWNER DEMO SOURCE CONTRACT\n");

const source = readFileSync("app/[site]/dev-fixtures/route-assist-demo/page.tsx", "utf8");

check(
  "demo is explicitly isolated as a dev fixture",
  source.includes("dev-fixtures/route-assist-demo") === false &&
    source.includes("Demo") &&
    source.includes("no pricing, materials, booking, or production data is changed"),
);
check(
  "demo uses the shared provider-to-review pipeline",
  source.includes("prepareRouteAssistScanReviewV1(DEMO_PROVIDER, INPUT)"),
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
  "homeowner can rescan before final confirmation",
  source.includes('setStep("SETUP")') && source.includes("Rescan"),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
