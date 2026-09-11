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
 *
 * INTEGER DOMAIN ONLY. Adjacency is `prev.hi + 1`, which is what makes "no gap"
 * meaningful — between 20 and 21 there is nothing. That reasoning does not hold
 * for decimals, so this validator, like the resolver, is integer-only by
 * contract rather than by accident.
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

// ---------------------------------------------------------------------------
// RUNTIME SELECTION — the same rule, on both sides of the wire
// ---------------------------------------------------------------------------
//
// This lives here rather than in routeResolver.ts because routeResolver imports
// PrismaClient, and a "use client" component that imported it would pull the
// database client into the browser bundle. So the homeowner's walk could not
// share the rule, and it did not: QuestionStep took options[0] for every NUMBER
// question, which meant a 45 ft answer continued down the 1-20 branch on the
// client while resolveRoute sent the same answer to review.
//
// The function below was already pure and generic. Nothing about it changed in
// moving it; what changed is that both sides can now reach it. One rule, two
// callers -- the same reason the material recompute lives in one place.

/**
 * ROUTING V2 — choose a NUMBER question's option by the VALUE of the answer.
 *
 * Two modes, and which one applies is a fact about the authored options rather
 * than a flag anyone has to remember to set:
 *
 *   no option carries a predicate  -> legacy behaviour, options[0], untouched.
 *                                     Every NUMBER question written before this
 *                                     existed keeps working exactly as it did.
 *   any option carries one         -> numeric routing. EXACTLY ONE option must
 *                                     contain the validated answer.
 *
 * ORDER MUST NEVER DECIDE. A gap and an overlap are both authoring defects, and
 * both fail closed. "First match wins" would let a range overlap resolve
 * silently by accident of `order`, which is not a fact about the physical world
 * and would make two identically-authored trees behave differently.
 *
 * Entirely generic. This function knows nothing about feet, walls, eligibility
 * or price; it validates a number against the question's authored range and
 * returns the one authored range containing it.
 *
 * INTEGER ROUTING, DELIBERATELY AND ONLY.
 *
 * The predicates are `Int?`, coverage is proven across the authored INTEGER
 * domain, and Routing V2 measures in whole units. So a decimal is REFUSED, not
 * rounded and not truncated: `18.5` against a 1-20 / 21-300 envelope has no
 * defensible answer, and silently making it 18 or 19 would decide a customer's
 * eligibility by a rounding rule nobody authored.
 *
 * This is a limit of the primitive, stated so nobody later reaches for it to
 * route a decimal-valued measurement and assumes semantics that were never
 * built. A decimal domain would need its own coverage model — adjacency is not
 * `prev.hi + 1` when values between them exist — and that is a different
 * feature, not a looser regex here.
 */
export type NumericOptionChoice<T> =
  | { kind: "option"; option: T }
  | { kind: "invalid"; reason: string }
  | { kind: "broken"; reason: string };

export function selectNumericOption<
  T extends { value: string; numberAtLeast: number | null; numberAtMost: number | null }
>(
  question: { key: string; numberMin: number | null; numberMax: number | null; options: readonly T[] },
  raw: string
): NumericOptionChoice<T> {
  const routing = question.options.filter(
    (o) => o.numberAtLeast !== null || o.numberAtMost !== null
  );
  if (routing.length === 0) {
    const first = question.options[0];
    if (!first) return { kind: "broken", reason: `"${question.key}" has no answer options` };
    return { kind: "option", option: first };
  }

  // In numeric-routing mode the question's own range is what "valid" means, so
  // it has to exist before any option can be judged against it.
  if (question.numberMin === null || question.numberMax === null) {
    return { kind: "broken", reason:
      `"${question.key}" routes on its number but declares no numberMin/numberMax` };
  }
  const unbounded = question.options.filter(
    (o) => o.numberAtLeast === null && o.numberAtMost === null
  );
  if (unbounded.length > 0) {
    return { kind: "broken", reason:
      `"${question.key}" mixes numeric routing with option(s) carrying no range: ` +
      unbounded.map((o) => o.value).join(", ") };
  }

  const text = String(raw ?? "").trim();
  // Whole numbers only — see INTEGER ROUTING above. A decimal is refused rather
  // than rounded, because rounding would silently pick a range for the customer.
  if (!/^\d+$/.test(text)) {
    return { kind: "invalid", reason: `"${question.key}" is "${text}", which is not a whole number` };
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n)) {
    return { kind: "invalid", reason: `"${question.key}" is "${text}", which is not a usable whole number` };
  }
  if (n < question.numberMin || n > question.numberMax) {
    return { kind: "invalid", reason:
      `"${question.key}" is ${n}, outside its authored range ${question.numberMin}\u2013${question.numberMax}` };
  }

  const matches = routing.filter(
    (o) => (o.numberAtLeast === null || n >= o.numberAtLeast) &&
           (o.numberAtMost === null || n <= o.numberAtMost)
  );
  if (matches.length === 0) {
    return { kind: "broken", reason:
      `"${question.key}" has no authored range containing ${n} \u2014 a gap in the tree` };
  }
  if (matches.length > 1) {
    return { kind: "broken", reason:
      `"${question.key}" has ${matches.length} ranges containing ${n} (${matches.map((m) => m.value).join(", ")}) ` +
      `\u2014 an overlap; option order must not decide this` };
  }
  return { kind: "option", option: matches[0] };
}
