import { reconcileGuidedFlowAnswerConflict } from "../lib/guidedFlowAnswerConflict";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nGUIDED FLOW ANSWER CONFLICT RECONCILIATION\n");

const unrelated = reconcileGuidedFlowAnswerConflict(
  { a: "1" },
  { a: "1", b: "2" },
  { a: "1", c: "3" }
);
check(
  "safe local edit is added without erasing another device's unrelated answer",
  unrelated.merged.a === "1" && unrelated.merged.b === "2" && unrelated.merged.c === "3",
  JSON.stringify(unrelated)
);
check("safe local edit remains to persist", unrelated.hasLocalChangesToPersist);
check("unrelated changes create no conflict", unrelated.conflicts.length === 0);

const sameValue = reconcileGuidedFlowAnswerConflict(
  { a: "1" },
  { a: "2" },
  { a: "2", c: "3" }
);
check(
  "same value already landed elsewhere needs no retry",
  sameValue.merged.a === "2" && sameValue.merged.c === "3" && !sameValue.hasLocalChangesToPersist,
  JSON.stringify(sameValue)
);
check("same-value convergence is not a conflict", sameValue.conflicts.length === 0);

const conflict = reconcileGuidedFlowAnswerConflict(
  { route: "14.6", other: "keep" },
  { route: "18", other: "keep" },
  { route: "16", other: "keep", phoneOnly: "yes" }
);
check(
  "same-key divergence preserves the current server/customer value",
  conflict.merged.route === "16" && conflict.merged.phoneOnly === "yes",
  JSON.stringify(conflict)
);
check(
  "same-key divergence is surfaced explicitly",
  conflict.conflicts.length === 1 &&
    conflict.conflicts[0].key === "route" &&
    conflict.conflicts[0].baseValue === "14.6" &&
    conflict.conflicts[0].attemptedValue === "18" &&
    conflict.conflicts[0].currentValue === "16",
  JSON.stringify(conflict.conflicts)
);
check("conflicting local value is not marked safe to retry", !conflict.hasLocalChangesToPersist);

const localDelete = reconcileGuidedFlowAnswerConflict(
  { a: "1", removeMe: "old" },
  { a: "1" },
  { a: "1", removeMe: "old", phoneOnly: "yes" }
);
check(
  "a local deletion is safe when the server still carries the base value",
  !("removeMe" in localDelete.merged) && localDelete.merged.phoneOnly === "yes",
  JSON.stringify(localDelete)
);
check("safe deletion remains to persist", localDelete.hasLocalChangesToPersist);

const deleteConflict = reconcileGuidedFlowAnswerConflict(
  { removeMe: "old" },
  {},
  { removeMe: "new" }
);
check(
  "a stale deletion cannot erase a newer value",
  deleteConflict.merged.removeMe === "new" && deleteConflict.conflicts.length === 1,
  JSON.stringify(deleteConflict)
);

const serverDeleteVsLocalEdit = reconcileGuidedFlowAnswerConflict(
  { a: "old" },
  { a: "mine" },
  {}
);
check(
  "a server-side deletion versus a local edit is a real same-key conflict",
  !("a" in serverDeleteVsLocalEdit.merged) && serverDeleteVsLocalEdit.conflicts.length === 1,
  JSON.stringify(serverDeleteVsLocalEdit)
);

const untouched = reconcileGuidedFlowAnswerConflict(
  { a: "1" },
  { a: "1" },
  { a: "2", c: "3" }
);
check(
  "server changes survive when this client did not edit that key",
  untouched.merged.a === "2" && untouched.merged.c === "3" && untouched.conflicts.length === 0,
  JSON.stringify(untouched)
);
check("no local edit means no retry", !untouched.hasLocalChangesToPersist);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
