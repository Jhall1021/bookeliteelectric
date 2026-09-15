/**
 * Canonical numeric questions, shared by the browser and server.
 * Existing questions default to whole numbers. Measured quantities explicitly
 * opt into decimals; neither this module nor its callers round an answer.
 * Bounds still belong to the authored question, not a service or camera.
 */
export const NUMERIC_UNKNOWN = "__unknown__";

export type RangeOption = {
  value: string;
  numberAtLeast: number | null;
  numberAtMost: number | null;
  numberAtLeastExclusive?: boolean;
  routeAction?: string;
  photosBlockBooking?: boolean;
};
export type NumericQuestion = {
  key: string;
  numberMin: number | null;
  numberMax: number | null;
  numberAllowsDecimal?: boolean;
};
export type RangeProblem = { kind: string; detail: string };
export type NumericOptionChoice<T> =
  | { kind: "option"; option: T }
  | { kind: "invalid"; reason: string }
  | { kind: "broken"; reason: string };

/** Unknown is an explicit authored review option, never zero or an estimate. */
export function isNumericUnknownOption(option: RangeOption): boolean {
  return option.value === NUMERIC_UNKNOWN;
}

export function validateNumericAnswer(q: NumericQuestion, raw: string):
  | { kind: "number"; value: number }
  | { kind: "invalid" | "broken"; reason: string } {
  if (q.numberMin == null || q.numberMax == null ||
      !Number.isSafeInteger(q.numberMin) || !Number.isSafeInteger(q.numberMax) ||
      q.numberMin > q.numberMax) {
    return { kind: "broken", reason: `"${q.key}" has no valid authored range` };
  }
  const text = String(raw ?? "").trim();
  // Plain decimal notation only. No ranges, units, exponents, hex, Infinity,
  // signs or approximate text may silently become an exact physical quantity.
  const valid = q.numberAllowsDecimal ? /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) : /^\d+$/.test(text);
  const n = Number(text);
  if (!valid || !Number.isFinite(n) || n > Number.MAX_SAFE_INTEGER ||
      (!q.numberAllowsDecimal && !Number.isSafeInteger(n))) {
    return { kind: "invalid", reason: q.numberAllowsDecimal
      ? "Enter a number, such as 14.625, or choose I'm not sure."
      : "Enter a whole number, or choose I'm not sure." };
  }
  if (q.numberAllowsDecimal) {
    const [whole, fraction = ""] = text.split(".");
    const normalized = (whole.replace(/^0+/, "") || "0") + (fraction.replace(/0+$/, "") ? "." + fraction.replace(/0+$/, "") : "");
    if (String(n) !== normalized) {
      return { kind: "invalid", reason: "This measurement has more precision than we can preserve. Choose I'm not sure rather than rounding it." };
    }
  }
  if (n < q.numberMin || n > q.numberMax) {
    return { kind: "invalid", reason: `Enter a number from ${q.numberMin} to ${q.numberMax}, or choose I'm not sure.` };
  }
  return { kind: "number", value: n };
}

/**
 * Inclusive upper edges plus explicit open lower edges cover decimal domains
 * without gaps: [1,20], (20,300]. Integer domains retain [1,20], [21,300].
 * Option order never resolves a gap or overlap.
 */
export function validateNumericRanges(q: NumericQuestion & { options: readonly RangeOption[] }): RangeProblem[] {
  const problems: RangeProblem[] = [];
  const unknown = q.options.filter(isNumericUnknownOption);
  if (unknown.length > 1 || unknown.some(o => o.routeAction !== "PHOTO_REVIEW" || o.photosBlockBooking !== true ||
      o.numberAtLeast != null || o.numberAtMost != null || o.numberAtLeastExclusive)) {
    problems.push({ kind: "INVALID_UNKNOWN", detail: `"${q.key}" must have at most one unbounded unknown review option` });
  }
  const options = q.options.filter(o => !isNumericUnknownOption(o));
  const routing = options.filter(o => o.numberAtLeast != null || o.numberAtMost != null || o.numberAtLeastExclusive);
  if (!routing.length) {
    if (unknown.length && options.length !== 1) {
      problems.push({ kind: "MIXED_OPTIONS", detail: `"${q.key}" needs one numeric option beside its unknown option` });
    }
    return problems;
  }
  if (q.numberMin == null || q.numberMax == null) {
    return [...problems, { kind: "NO_QUESTION_RANGE", detail: `"${q.key}" routes on its number but declares no numberMin/numberMax` }];
  }
  if (!Number.isSafeInteger(q.numberMin) || !Number.isSafeInteger(q.numberMax) || q.numberMin > q.numberMax) {
    problems.push({ kind: "INVERTED", detail: `"${q.key}" has an invalid question domain` });
  }
  if (routing.length !== options.length) {
    problems.push({ kind: "MIXED_OPTIONS", detail: `"${q.key}" mixes numeric ranges with unranged options` });
  }
  const spans = routing.map(o => ({
    value: o.value, lo: o.numberAtLeast ?? q.numberMin!, hi: o.numberAtMost ?? q.numberMax!,
    open: o.numberAtLeastExclusive === true,
  }));
  for (const [i,s] of spans.entries()) {
    if (!Number.isSafeInteger(s.lo) || !Number.isSafeInteger(s.hi) || s.lo > s.hi || (s.open && s.lo === s.hi)) {
      problems.push({ kind: "INVERTED", detail: `"${q.key}" option ${s.value} has an empty or invalid range` });
    }
    if (s.lo < q.numberMin || s.hi > q.numberMax || (s.open && routing[i].numberAtLeast == null)) {
      problems.push({ kind: "OUT_OF_BOUNDS", detail: `"${q.key}" option ${s.value} has an invalid edge` });
    }
  }
  const sorted = spans.sort((a,b) => a.lo - b.lo || Number(a.open) - Number(b.open) || a.hi - b.hi);
  for (let i=1; i<sorted.length; i++) {
    const prev=sorted[i-1], cur=sorted[i];
    const low = cur.lo + (!q.numberAllowsDecimal && cur.open ? 1 : 0);
    const overlaps = q.numberAllowsDecimal
      ? cur.lo < prev.hi || (cur.lo === prev.hi && !cur.open)
      : low <= prev.hi;
    const gap = q.numberAllowsDecimal ? cur.lo > prev.hi : low > prev.hi + 1;
    if (overlaps) problems.push({kind:"OVERLAP", detail:`"${q.key}" options ${prev.value} and ${cur.value} overlap`});
    if (gap) problems.push({kind:"GAP", detail:`"${q.key}" has a gap between ${prev.value} and ${cur.value}`});
  }
  if (sorted.length && (sorted[0].lo > q.numberMin || (sorted[0].lo === q.numberMin && sorted[0].open))) {
    problems.push({kind:"GAP", detail:`"${q.key}" does not cover its lower bound`});
  }
  if (sorted.length && sorted[sorted.length-1].hi < q.numberMax) {
    problems.push({kind:"GAP", detail:`"${q.key}" does not cover its upper bound`});
  }
  return problems;
}

export function selectNumericOption<T extends RangeOption>(
  question: NumericQuestion & { options: readonly T[] }, raw: string
): NumericOptionChoice<T> {
  const problems = validateNumericRanges(question);
  if (problems.length) return {kind:"broken", reason:problems.map(p=>p.detail).join("; ")};
  if (raw === NUMERIC_UNKNOWN) {
    const option = question.options.find(isNumericUnknownOption);
    return option ? {kind:"option",option} : {kind:"invalid",reason:"This question has no unknown option"};
  }
  const options = question.options.filter(o => !isNumericUnknownOption(o));
  const routing = options.some(o => o.numberAtLeast != null || o.numberAtMost != null);
  // Preserve unbounded legacy dimensions such as "8 x 8". Bounded NUMBER
  // questions, including the single-option footage/count questions, validate
  // before navigation so the browser cannot accept what the server refuses.
  if (!routing && question.numberMin == null && question.numberMax == null && !question.numberAllowsDecimal) {
    return options[0] ? {kind:"option",option:options[0]} : {kind:"broken",reason:`"${question.key}" has no answer options`};
  }
  const parsed = validateNumericAnswer(question, raw);
  if (parsed.kind !== "number") return parsed;
  if (!routing) {
    return options.length === 1 ? {kind:"option",option:options[0]} : {kind:"broken",reason:`"${question.key}" needs one numeric option`};
  }
  const matches = options.filter(o =>
    (o.numberAtLeast == null || (o.numberAtLeastExclusive ? parsed.value > o.numberAtLeast : parsed.value >= o.numberAtLeast)) &&
    (o.numberAtMost == null || parsed.value <= o.numberAtMost));
  if (matches.length !== 1) return {kind:"broken",reason:`"${question.key}" has ${matches.length} ranges containing ${parsed.value}`};
  return {kind:"option",option:matches[0]};
}
