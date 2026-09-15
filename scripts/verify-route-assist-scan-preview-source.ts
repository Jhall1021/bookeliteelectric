import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST ROOM-SCAN PREVIEW SOURCE CONTRACT\n");

const source = readFileSync("app/[site]/dev-fixtures/route-assist-scan/page.tsx", "utf8");

check(
  "preview uses the provider-to-review pipeline",
  source.includes("prepareRouteAssistScanReviewV1(FAKE_WORLD_PROVIDER, INPUT)"),
);
check(
  "preview applies only explicit review selections",
  source.includes("applyRouteAssistScanReviewSelectionV1") &&
    source.includes("selected,"),
);
check(
  "review selection is bound to the exact values the customer reviewed",
  source.includes("prepared.review.fingerprint") &&
    /applyRouteAssistScanReviewSelectionV1\([\s\S]{0,260}selected,[\s\S]{0,120}prepared\.review\.fingerprint/.test(source),
  "an old checkbox selection must not apply values from a later re-scan that reused the same route IDs",
);
check(
  "review checkboxes begin from an empty selection",
  source.includes('useState<string[]>([])') && source.includes("setSelected([])"),
);
check(
  "non-mappable evidence is disabled rather than silently accepted",
  source.includes("disabled={!item.canApplyToRouteGraph}"),
);
check(
  "provider confidence is displayed as evidence only",
  source.includes("provider confidence") && source.includes("item.confidence"),
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
  "preview explicitly shows the precision-gate distinction",
  source.includes("Scan review total") && source.includes("Current RouteAssistResult total"),
);
check(
  "fixture copy declares that production pricing/materials are untouched",
  source.includes("Nothing below changes pricing, materials, or production data."),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
