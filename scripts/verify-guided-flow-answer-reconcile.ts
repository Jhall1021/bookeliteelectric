import { reconcileGuidedFlowAnswers } from "../lib/guidedFlowAnswerReconcile";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nGUIDED FLOW ANSWER THREE-WAY RECONCILIATION\n");

const disjoint = reconcileGuidedFlowAnswers(
  { route_feet: "14.6" },
  { route_feet: "14.6", inside: "2" },
  { route_feet: "14.6", outside: "1" },
);
check(
  "disjoint device edits merge safely",
  disjoint.kind === "MERGED" &&
    disjoint.answers.route_feet === "14.6" &&
    disjoint.answers.inside === "2" &&
    disjoint.answers.outside === "1",
  JSON.stringify(disjoint)
);

const sameEdit = reconcileGuidedFlowAnswers(
  { route_feet: "14.6" },
  { route_feet: "18" },
  { route_feet: "18" },
);
check(
  "same edit on both devices is not a conflict",
  sameEdit.kind === "MERGED" && sameEdit.answers.route_feet === "18",
  JSON.stringify(sameEdit)
);

const localOnly = reconcileGuidedFlowAnswers(
  { route_feet: "14.6" },
  { route_feet: "18" },
  { route_feet: "14.6" },
);
check(
  "local edit survives when remote left the key unchanged",
  localOnly.kind === "MERGED" && localOnly.answers.route_feet === "18",
  JSON.stringify(localOnly)
);

const remoteOnly = reconcileGuidedFlowAnswers(
  { route_feet: "14.6" },
  { route_feet: "14.6" },
  { route_feet: "22" },
);
check(
  "remote edit wins when local left the key unchanged",
  remoteOnly.kind === "MERGED" && remoteOnly.answers.route_feet === "22",
  JSON.stringify(remoteOnly)
);

const conflict = reconcileGuidedFlowAnswers(
  { route_feet: "14.6", inside: "2" },
  { route_feet: "18", inside: "2", flat: "1" },
  { route_feet: "22", inside: "3" },
);
check(
  "different edits to the same key produce an explicit conflict",
  conflict.kind === "CONFLICT" &&
    conflict.conflictKeys.includes("route_feet") &&
    conflict.answers.route_feet === "22",
  JSON.stringify(conflict)
);
check(
  "non-conflicting local edits are retained in the conflict snapshot",
  conflict.kind === "CONFLICT" && conflict.answers.flat === "1",
  JSON.stringify(conflict)
);
check(
  "remote same-key changes remain canonical in a conflict snapshot",
  conflict.kind === "CONFLICT" && conflict.answers.inside === "3",
  JSON.stringify(conflict)
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
