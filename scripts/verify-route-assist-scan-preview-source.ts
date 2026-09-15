import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST ROOM-SCAN PREVIEW SOURCE CONTRACT\n");

const source = readFileSync("app/[site]/dev-fixtures/route-assist-scan/page.tsx", "utf8");
const review = readFileSync("components/route-assist/RouteAssistScanReview.tsx", "utf8");

check(
  "preview uses the provider-to-review pipeline",
  source.includes("prepareRouteAssistScanReviewV1(FAKE_WORLD_PROVIDER, INPUT)"),
);
check(
  "preview renders the reusable Route Assist scan review panel",
  source.includes("<RouteAssistScanReview") &&
    source.includes("review={prepared.review}") &&
    source.includes("onApply={applySelectedFacts}"),
);
check(
  "preview applies only explicit review IDs from the reusable panel",
  source.includes("selection.acceptedReviewItemIds") &&
    source.includes("applyRouteAssistScanReviewSelectionV1"),
);
check(
  "review selection is bound to the exact values the customer reviewed",
  source.includes("selection.reviewFingerprint") &&
    /applyRouteAssistScanReviewSelectionV1\([\s\S]{0,300}selection\.acceptedReviewItemIds,[\s\S]{0,100}selection\.reviewFingerprint/.test(source),
  "the UI may send IDs and the displayed-review fingerprint only; canonical values are rebuilt in the domain layer",
);
check(
  "reusable review checkboxes begin from an empty selection",
  review.includes('useState<string[]>([])'),
);
check(
  "a changed scan-review fingerprint clears all old checkbox approvals",
  /useEffect\(\(\)\s*=>\s*\{\s*setSelected\(\[\]\);\s*\},\s*\[review\.fingerprint\]\)/.test(review),
  "a re-scan must never visually carry approvals from an older review forward",
);
check(
  "non-mappable evidence is disabled rather than silently accepted",
  review.includes("disabled={disabled || !item.canApplyToRouteGraph}"),
);
check(
  "provider confidence is displayed as evidence only",
  review.includes("provider confidence") && review.includes("item.confidence"),
);
check(
  "review panel emits IDs plus fingerprint, not provider values",
  review.includes("acceptedReviewItemIds: [...selected]") &&
    review.includes("reviewFingerprint: review.fingerprint") &&
    !/onApply\([\s\S]{0,120}\bvalue\b/.test(review),
);
check(
  "preview uses the normal Route Assist result builder after graph acceptance",
  source.includes("buildRouteAssistResult({"),
);
check(
  "preview requires a separate route confirmation step",
  source.includes('applyConfirmation(draftResult, "ACCEPTED")') &&
    source.includes("Confirm this preview route"),
);
check(
  "confirmed preview uses the existing electrical Routing V2 adapter",
  source.includes("adaptRouteAssistResult(confirmedResult).mapped"),
);
check(
  "preview states that Route Assist preserves exact physical measurement",
  source.includes("Route Assist preserves the accepted physical measurement exactly") &&
    source.includes("RouteAssistResult total"),
);
check(
  "fixture copy declares that production pricing/materials are untouched",
  source.includes("Nothing below changes pricing, materials, or production data."),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
