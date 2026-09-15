import { decideRouteAssistGroupedReuse } from "../lib/visual-assist/route-assist/groupedReuse";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST GROUPED REUSE POLICY\n");

const fresh = decideRouteAssistGroupedReuse(undefined, "14.625");
check(
  "no persisted answer -> use the completed scan",
  fresh.kind === "USE_SCAN" && fresh.value === "14.625",
  JSON.stringify(fresh)
);

const same = decideRouteAssistGroupedReuse("14.625", "14.625");
check(
  "same exact persisted answer -> scan replay is idempotent and may resume",
  same.kind === "USE_SCAN" && same.value === "14.625",
  JSON.stringify(same)
);

const manualOverride = decideRouteAssistGroupedReuse("18", "14.625");
check(
  "different persisted answer -> preserve the customer's newer/manual value",
  manualOverride.kind === "PRESERVE_PERSISTED" &&
    manualOverride.persistedValue === "18" &&
    manualOverride.scanValue === "14.625",
  JSON.stringify(manualOverride)
);

const differentPrecisionIsDifferent = decideRouteAssistGroupedReuse("14.6", "14.625");
check(
  "a rounded manual/persisted value is not treated as identical to the exact scan fact",
  differentPrecisionIsDifferent.kind === "PRESERVE_PERSISTED" &&
    differentPrecisionIsDifferent.persistedValue === "14.6" &&
    differentPrecisionIsDifferent.scanValue === "14.625",
  JSON.stringify(differentPrecisionIsDifferent)
);

const zeroIsReal = decideRouteAssistGroupedReuse("0", "1");
check(
  "persisted zero is a real answer, not absence",
  zeroIsReal.kind === "PRESERVE_PERSISTED" && zeroIsReal.persistedValue === "0",
  JSON.stringify(zeroIsReal)
);

const unavailable = decideRouteAssistGroupedReuse(undefined, null);
check(
  "unavailable scan fact stays manual",
  unavailable.kind === "SCAN_UNAVAILABLE",
  JSON.stringify(unavailable)
);

const unavailableDoesNotErase = decideRouteAssistGroupedReuse("2", null);
check(
  "unavailable scan can never erase an existing answer",
  unavailableDoesNotErase.kind === "SCAN_UNAVAILABLE",
  JSON.stringify(unavailableDoesNotErase)
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
