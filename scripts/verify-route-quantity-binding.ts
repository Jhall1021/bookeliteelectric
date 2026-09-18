/**
 * ROUTING V2 — what a NUMBER answer is allowed to mean as a component quantity.
 *
 * The rule this file exists to hold: a binding that cannot be resolved REFUSES.
 * It never falls back to the authored static quantity. That fallback is the
 * whole hazard — a 31-foot route priced as one foot is not an error anyone
 * sees, it is a wrong price that looks right.
 *
 * Pure: no database. The resolution is a function of (binding, answers,
 * questions), and keeping it testable without a database is what lets it run in
 * verify:fast on every build.
 */
import { resolveBoundQuantity, type BoundQuestion } from "../lib/routeResolver";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/** Questions the walk CONSUMED. Bounds are authored per question, not global. */
const NUM: BoundQuestion[] = [
  { key: "route_feet",          inputType: "NUMBER",        numberMin: 1, numberMax: 300 },
  { key: "inside_corner_count", inputType: "NUMBER",        numberMin: 0, numberMax: 20  },
  { key: "wall_surface",        inputType: "SINGLE_SELECT", numberMin: null, numberMax: null },
  { key: "unbounded_count",     inputType: "NUMBER",        numberMin: null, numberMax: null },
];

const q = (binding: { quantity: number; quantityAnswerKey: string | null },
           answers: Record<string, string>) =>
  resolveBoundQuantity(binding, answers, NUM, "SURFACE_ROUTE_FT");

console.log("\nROUTING V2 — NUMBER ANSWER AS COMPONENT QUANTITY\n");

console.log("  A  A NULL BINDING IS THE BEHAVIOUR THAT ALREADY EXISTED");
{
  const r = q({ quantity: 1, quantityAnswerKey: null }, {});
  ok(r.kind === "quantity" && r.value === 1, "A  a null binding uses the authored quantity", JSON.stringify(r));
  const r5 = q({ quantity: 5, quantityAnswerKey: null }, { route_feet: "99" });
  ok(r5.kind === "quantity" && r5.value === 5,
    "A  and ignores answers entirely — an existing row cannot change meaning", JSON.stringify(r5));
}

console.log("\n  B  A BOUND QUANTITY IS THE HOMEOWNER'S NUMBER, NOT A BAND");
for (const [feet, want] of [["8", 8], ["18", 18], ["27", 27], ["50", 50], ["40", 40]] as const) {
  const r = q({ quantity: 1, quantityAnswerKey: "route_feet" }, { route_feet: feet });
  ok(r.kind === "quantity" && r.value === want,
    `B  ${feet} ft is a quantity of ${want}`, JSON.stringify(r));
}
{
  // The point of the whole exercise: distance changes QUANTITY, not class.
  const a = q({ quantity: 1, quantityAnswerKey: "route_feet" }, { route_feet: "18" });
  const b = q({ quantity: 1, quantityAnswerKey: "route_feet" }, { route_feet: "50" });
  ok(a.kind === "quantity" && b.kind === "quantity" && a.value === 18 && b.value === 50,
    "B  18 ft and 50 ft differ only in quantity — neither is refused for its length");
}

console.log("\n  C  ZERO IS ABSENCE, NOT A ZERO-QUANTITY LINE");
{
  const r = q({ quantity: 1, quantityAnswerKey: "inside_corner_count" }, { inside_corner_count: "0" });
  ok(r.kind === "omit",
    "C  zero corners omits the component rather than emitting × 0", JSON.stringify(r));
  const r2 = q({ quantity: 1, quantityAnswerKey: "inside_corner_count" }, { inside_corner_count: "2" });
  ok(r2.kind === "quantity" && r2.value === 2, "C  two corners is a quantity of 2", JSON.stringify(r2));
}

console.log("\n  D  AN UNRESOLVABLE BINDING REFUSES — IT NEVER FALLS BACK TO STATIC");
for (const [label, answers] of [
  ["missing answer", {}],
  ["empty answer", { route_feet: "" }],
  ["negative", { route_feet: "-5" }],
  ["decimal", { route_feet: "27.5" }],
  ["not a number", { route_feet: "about thirty" }],
  ["beyond the supported limit", { route_feet: "301" }],
] as const) {
  const r = q({ quantity: 7, quantityAnswerKey: "route_feet" }, answers as Record<string, string>);
  ok(r.kind === "invalid", `D  ${label} is refused`, JSON.stringify(r));
  ok(!(r.kind === "quantity" && r.value === 7),
    `D  ${label} does NOT silently become the authored quantity 7`, JSON.stringify(r));
}

console.log("\n  E  A BINDING THE TREE CANNOT SUPPORT IS A TREE DEFECT, NOT A BAD ANSWER");
{
  const missing = q({ quantity: 1, quantityAnswerKey: "no_such_question" }, { route_feet: "27" });
  ok(missing.kind === "broken",
    "E  binding to a question that does not exist is BROKEN, not INVALID", JSON.stringify(missing));
  const wrongType = resolveBoundQuantity(
    { quantity: 1, quantityAnswerKey: "wall_surface" }, { wall_surface: "drywall" }, NUM, "X");
  ok(wrongType.kind === "broken",
    "E  binding to a non-NUMBER question is BROKEN — a customer cannot fix it", JSON.stringify(wrongType));
}

console.log("\n  F  THE LIMIT IS A SANITY BOUND, NOT A PRICING TIER");
{
  const at = q({ quantity: 1, quantityAnswerKey: "route_feet" }, { route_feet: "300" });
  ok(at.kind === "quantity" && at.value === 300,
    "F  300 ft is accepted — the authored bound is inclusive", JSON.stringify(at));
  const lo = q({ quantity: 1, quantityAnswerKey: "route_feet" }, { route_feet: "1" });
  ok(lo.kind === "quantity" && lo.value === 1, "F  1 ft is accepted — so is the minimum", JSON.stringify(lo));

  // The bound is the QUESTION's, not the resolver's. A different question with a
  // different authored range is judged by its own.
  const c20 = q({ quantity: 1, quantityAnswerKey: "inside_corner_count" }, { inside_corner_count: "20" });
  const c21 = q({ quantity: 1, quantityAnswerKey: "inside_corner_count" }, { inside_corner_count: "21" });
  ok(c20.kind === "quantity" && c21.kind === "invalid",
    "F  a different question uses ITS OWN range (corners 0-20), not a global ceiling",
    `${JSON.stringify(c20)} / ${JSON.stringify(c21)}`);
  // 301 ft is refused while 301 of something else could be fine — proof the
  // ceiling is not compiled into the resolver.
  const wide: BoundQuestion[] = [{ key: "wide", inputType: "NUMBER", numberMin: 1, numberMax: 5000 }];
  const big = resolveBoundQuantity({ quantity: 1, quantityAnswerKey: "wide" }, { wide: "4000" }, wide, "X");
  ok(big.kind === "quantity" && big.value === 4000,
    "F  and a question authored 1-5000 accepts 4000 — no electrical assumption survives", JSON.stringify(big));

  const unbounded = q({ quantity: 1, quantityAnswerKey: "unbounded_count" }, { unbounded_count: "5" });
  ok(unbounded.kind === "broken",
    "F  a NUMBER question with NO authored range cannot be bound at all", JSON.stringify(unbounded));
}

console.log("\n  G  REACHABILITY IS STRUCTURAL — SERVICE-WIDE EXISTENCE IS NOT ENOUGH");
{
  // Every case below binds to a question that EXISTS and is a valid, bounded
  // NUMBER — it simply was not consumed on this path. The answer map even
  // carries a plausible value, which is exactly how a stale answer from an
  // abandoned branch would look.
  const notWalked: BoundQuestion[] = [
    { key: "route_feet", inputType: "NUMBER", numberMin: 1, numberMax: 300 },
  ];
  for (const [label, key] of [
    ["a NUMBER question on an unrelated branch", "other_branch_feet"],
    ["a NUMBER question reachable only AFTER this terminal", "later_feet"],
    ["a valid NUMBER question this path never visited", "never_visited_feet"],
  ] as const) {
    const r = resolveBoundQuantity(
      { quantity: 9, quantityAnswerKey: key },
      // The answer is present and perfectly well-formed. Only reachability fails.
      { route_feet: "27", other_branch_feet: "31", later_feet: "31", never_visited_feet: "31" },
      notWalked,
      "SURFACE_ROUTE_FT"
    );
    ok(r.kind === "broken", `G  ${label} is BROKEN, not priced`, JSON.stringify(r));
    ok(!(r.kind === "quantity"), `G  ${label} never yields a quantity`, JSON.stringify(r));
  }
  const walked = resolveBoundQuantity(
    { quantity: 9, quantityAnswerKey: "route_feet" }, { route_feet: "27" }, notWalked, "SURFACE_ROUTE_FT");
  ok(walked.kind === "quantity" && walked.value === 27,
    "G  and the question this path DID consume resolves normally", JSON.stringify(walked));
}

console.log("\n  H  THE WIRING, NOT ONLY THE FUNCTION");
{
  // Section G proves resolveBoundQuantity refuses an unreachable binding when it
  // is HANDED the walked path. It cannot prove resolveRoute hands it that list —
  // passing `service.questions` instead would restore service-wide existence and
  // every G assertion would still pass. So the wiring is asserted directly.
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const src = readFileSync("lib/routeResolver.ts", "utf8");
  ok(/const visitedKeys = new Set\(consumed\.map/.test(src),
    "H  resolveRoute derives the visited set from `consumed`, the walked path");
  ok(/visitedQuestions = service\.questions\.filter\(\(x\) => visitedKeys\.has\(x\.key\)\)/.test(src),
    "H  and filters the service's questions down to it");
  ok(/resolveBoundQuantity\([\s\S]{0,200}?visitedQuestions,/.test(src),
    "H  and passes THAT to resolveBoundQuantity — not the full question list");
  ok(!/resolveBoundQuantity\([\s\S]{0,200}?service\.questions,/.test(src),
    "H  service-wide existence is never what a binding is checked against");
}

console.log(`\n  ${pass} passed, ${fail} failed.\n`);
if (fail) process.exit(1);
