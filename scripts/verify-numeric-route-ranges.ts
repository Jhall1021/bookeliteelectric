/**
 * ROUTING V2 — numeric routing: the selector and the authored ranges.
 *
 * Pure. Two things are proven, and the second is the one that matters most:
 *
 *   1. selectNumericOption picks the one range containing the answer, and fails
 *      closed on a gap or an overlap rather than repairing it.
 *   2. ORDER DOES NOT DECIDE. The same options shuffled give the same answer.
 *      "First match wins" would make an overlap resolve by accident of `order`,
 *      which is not a fact about the physical world.
 */
import { selectNumericOption } from "../lib/routeResolver";
import { validateNumericRanges, type RangeOption } from "../lib/numericRouteRanges";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const opt = (value: string, lo: number | null, hi: number | null): RangeOption =>
  ({ value, numberAtLeast: lo, numberAtMost: hi });
const Q = (options: RangeOption[], min: number | null = 1, max: number | null = 300) =>
  ({ key: "concealed_route_feet", numberMin: min, numberMax: max, options });

/** The envelope the concealed module will author: 1-20 eligible, 21-300 review. */
const ENVELOPE = [opt("within", 1, 20), opt("beyond", 21, 300)];

console.log("\nROUTING V2 — NUMERIC ROUTING\n");

console.log("  A  LEGACY NUMBER QUESTIONS ARE UNTOUCHED\n");
{
  const legacy = Q([opt("__number__", null, null)]);
  for (const n of ["1", "27", "300"]) {
    const r = selectNumericOption(legacy, n);
    ok(r.kind === "option" && r.option.value === "__number__",
      `A  a question with no ranges takes its single option at ${n} ft`, JSON.stringify(r));
  }
  ok(validateNumericRanges(legacy).length === 0,
    "A  and the static validator ignores it entirely — not a numeric-routing question");
}

console.log("\n  B  THE ENVELOPE IS ROUTING, NOT VALIDATION\n");
for (const [n, want] of [["1", "within"], ["18", "within"], ["20", "within"],
                         ["21", "beyond"], ["24", "beyond"], ["300", "beyond"]] as const) {
  const r = selectNumericOption(Q(ENVELOPE), n);
  ok(r.kind === "option" && r.option.value === want,
    `B  ${n} ft selects "${want}"`, JSON.stringify(r));
}
{
  // The distinction the whole feature exists for.
  const r24 = selectNumericOption(Q(ENVELOPE), "24");
  ok(r24.kind === "option",
    "B  24 ft is a VALID measurement, not a rejected one — it simply routes elsewhere",
    JSON.stringify(r24));
  const r301 = selectNumericOption(Q(ENVELOPE), "301");
  ok(r301.kind === "invalid",
    "B  whereas 301 is invalid against the QUESTION's range — a different failure", JSON.stringify(r301));
}

console.log("\n  C  ORDER MUST NOT DECIDE\n");
{
  const forward = selectNumericOption(Q(ENVELOPE), "18");
  const reversed = selectNumericOption(Q([...ENVELOPE].reverse()), "18");
  ok(forward.kind === "option" && reversed.kind === "option" &&
     forward.option.value === reversed.option.value,
    "C  reversing option order gives the identical result",
    `${JSON.stringify(forward)} vs ${JSON.stringify(reversed)}`);
  const fwdProblems = validateNumericRanges(Q(ENVELOPE));
  const revProblems = validateNumericRanges(Q([...ENVELOPE].reverse()));
  ok(fwdProblems.length === 0 && revProblems.length === 0,
    "C  and the static validator is order-independent too",
    `${JSON.stringify(fwdProblems)} / ${JSON.stringify(revProblems)}`);
}

console.log("\n  D  A DEFECTIVE TREE FAILS CLOSED, IT IS NOT REPAIRED\n");
{
  const overlap = Q([opt("a", 1, 25), opt("b", 20, 300)]);
  const r = selectNumericOption(overlap, "22");
  ok(r.kind === "broken", "D  an overlap is BROKEN at runtime, not resolved by order", JSON.stringify(r));
  ok(validateNumericRanges(overlap).some((p) => p.kind === "OVERLAP"),
    "D  and the static validator names it", JSON.stringify(validateNumericRanges(overlap)));

  const gap = Q([opt("a", 1, 20), opt("b", 25, 300)]);
  const g = selectNumericOption(gap, "22");
  ok(g.kind === "broken", "D  a gap is BROKEN — no range contains the answer", JSON.stringify(g));
  ok(validateNumericRanges(gap).some((p) => p.kind === "GAP"),
    "D  and the static validator names the uncovered span", JSON.stringify(validateNumericRanges(gap)));

  const mixed = Q([opt("a", 1, 20), opt("plain", null, null)]);
  ok(selectNumericOption(mixed, "5").kind === "broken",
    "D  mixing a routing range with a rangeless option is BROKEN");
  ok(validateNumericRanges(mixed).some((p) => p.kind === "MIXED_OPTIONS"),
    "D  and the static validator names that too");

  const noRange = Q(ENVELOPE, null, null);
  ok(selectNumericOption(noRange, "5").kind === "broken",
    "D  routing on a question with no authored numberMin/numberMax is BROKEN");

  const outside = Q([opt("a", 1, 20), opt("b", 21, 500)]);
  ok(validateNumericRanges(outside).some((p) => p.kind === "OUT_OF_BOUNDS"),
    "D  a range reaching past the question's own bounds is named",
    JSON.stringify(validateNumericRanges(outside)));
}

console.log("\n  E  COVERAGE IS COMPLETE OVER THE INTEGER DOMAIN\n");
{
  const q = Q(ENVELOPE);
  const chosen = new Map<string, number>();
  for (let n = 1; n <= 300; n++) {
    const r = selectNumericOption(q, String(n));
    if (r.kind !== "option") { chosen.set(`UNRESOLVED@${n}`, 1); break; }
    chosen.set(r.option.value, (chosen.get(r.option.value) ?? 0) + 1);
  }
  ok(chosen.get("within") === 20 && chosen.get("beyond") === 280,
    "E  every integer 1-300 resolves, exactly once, to exactly one range",
    JSON.stringify([...chosen]));
}

console.log(`\n  ${pass} passed, ${fail} failed.\n`);
if (fail) process.exit(1);
