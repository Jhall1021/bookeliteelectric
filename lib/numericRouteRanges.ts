/**
 * ROUTING V2 — static validation of a NUMBER question's authored ranges.
 *
 * The resolver fails closed at runtime on a gap or an overlap, but a customer
 * discovering an authoring defect by being refused a price is a poor way to
 * find out. This proves the ranges are sound before anyone walks the tree.
 *
 * Over the INTEGER DOMAIN numberMin..numberMax, the option ranges must:
 *   - stay inside the question's own range
 *   - not overlap
 *   - leave no gap
 *   - cover the domain completely
 *   - and give the same answer whatever order the options are in
 *
 * Generic: no knowledge of what the numbers measure.
 */
export type RangeOption = {
  value: string;
  numberAtLeast: number | null;
  numberAtMost: number | null;
};

export type RangeProblem = { kind: string; detail: string };

export function validateNumericRanges(q: {
  key: string;
  numberMin: number | null;
  numberMax: number | null;
  options: readonly RangeOption[];
}): RangeProblem[] {
  const routing = q.options.filter((o) => o.numberAtLeast !== null || o.numberAtMost !== null);
  if (routing.length === 0) return [];   // not a numeric-routing question

  const problems: RangeProblem[] = [];
  if (q.numberMin === null || q.numberMax === null) {
    problems.push({ kind: "NO_QUESTION_RANGE",
      detail: `"${q.key}" routes on its number but declares no numberMin/numberMax` });
    return problems;
  }
  const bare = q.options.filter((o) => o.numberAtLeast === null && o.numberAtMost === null);
  if (bare.length > 0) {
    problems.push({ kind: "MIXED_OPTIONS",
      detail: `"${q.key}" has routing ranges AND option(s) with none: ${bare.map((o) => o.value).join(", ")}` });
  }

  // Normalise open ends to the question's domain so every range is comparable.
  const spans = routing.map((o) => ({
    value: o.value,
    lo: o.numberAtLeast ?? q.numberMin!,
    hi: o.numberAtMost ?? q.numberMax!,
  }));
  for (const s of spans) {
    if (s.lo > s.hi) {
      problems.push({ kind: "INVERTED", detail: `"${q.key}" option ${s.value} has ${s.lo} > ${s.hi}` });
    }
    if (s.lo < q.numberMin || s.hi > q.numberMax) {
      problems.push({ kind: "OUT_OF_BOUNDS",
        detail: `"${q.key}" option ${s.value} spans ${s.lo}-${s.hi}, outside the question's ${q.numberMin}-${q.numberMax}` });
    }
  }

  // Overlap and coverage, decided by SORTING rather than by authored order —
  // the whole point is that `order` must not affect the outcome.
  const sorted = [...spans].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if (cur.lo <= prev.hi) {
      problems.push({ kind: "OVERLAP",
        detail: `"${q.key}" options ${prev.value} (${prev.lo}-${prev.hi}) and ${cur.value} (${cur.lo}-${cur.hi}) overlap` });
    } else if (cur.lo > prev.hi + 1) {
      problems.push({ kind: "GAP",
        detail: `"${q.key}" has no range covering ${prev.hi + 1}-${cur.lo - 1}` });
    }
  }
  if (sorted.length > 0) {
    if (sorted[0].lo > q.numberMin) {
      problems.push({ kind: "GAP",
        detail: `"${q.key}" has no range covering ${q.numberMin}-${sorted[0].lo - 1}` });
    }
    const last = sorted[sorted.length - 1];
    if (last.hi < q.numberMax) {
      problems.push({ kind: "GAP",
        detail: `"${q.key}" has no range covering ${last.hi + 1}-${q.numberMax}` });
    }
  }
  return problems;
}
