/**
 * Rendering and validating contractor breakpoint policies — ADR-014.
 *
 * The template holds the SHAPE of a band set and the contractor holds the
 * numbers. "How far is the run?" is a question every electrician asks; where
 * the price steps is that electrician's decision. See
 * docs/decisions/TEMPLATE-CLASSIFICATION-RULES.md.
 *
 * The band set is validated as a WHOLE. Per-option numbers would let someone
 * configure "up to 20 feet" next to "10 to 15 feet" and only find out from a
 * confused customer.
 */

/** `{b1}` is the first boundary; `{b1+1}` is one past it, for "26 to 50". */
const HOLE = /\{b(\d+)([+-]\d+)?\}/g;

export class UnresolvedPolicyError extends Error {
  constructor(readonly key: string, readonly pattern: string) {
    super(`Policy "${key}" is unresolved; cannot render "${pattern}".`);
    this.name = "UnresolvedPolicyError";
  }
}

/**
 * Fill a label pattern from a contractor's boundaries.
 *
 * Throws rather than returning the raw pattern. A pattern that reached a
 * customer would read "Up to {b1} feet", and the failure mode of silently
 * returning it is that nobody notices until someone is mid-booking.
 */
export function renderBandLabel(pattern: string, key: string, boundaries: readonly number[]): string {
  if (!boundaries.length) throw new UnresolvedPolicyError(key, pattern);
  const out = pattern.replace(HOLE, (_m, n: string, delta?: string) => {
    const b = boundaries[Number(n) - 1];
    if (b === undefined) throw new UnresolvedPolicyError(key, pattern);
    return String(b + (delta ? Number(delta) : 0));
  });
  if (HOLE.test(out)) throw new UnresolvedPolicyError(key, pattern);
  return out;
}

/** True when the pattern needs a contractor decision before it can be shown. */
export function hasHoles(pattern: string): boolean {
  HOLE.lastIndex = 0;
  return HOLE.test(pattern);
}

/** Which boundary indexes a pattern reads, 1-based. */
export function boundariesUsed(pattern: string): number[] {
  return [...pattern.matchAll(HOLE)].map((m) => Number(m[1]));
}

export type BoundaryProblem = { code: string; message: string };

/**
 * A band set is valid only as a set: the right count, all positive, and
 * strictly ascending. Equal neighbours would produce an empty band that no
 * answer could ever be true of.
 */
export function validateBoundaries(
  boundaries: readonly number[], boundaryCount: number,
): BoundaryProblem[] {
  const problems: BoundaryProblem[] = [];
  if (boundaries.length !== boundaryCount)
    problems.push({ code: "count", message: `expected ${boundaryCount} boundary value(s), got ${boundaries.length}` });
  boundaries.forEach((b, i) => {
    if (!Number.isInteger(b) || b <= 0)
      problems.push({ code: "positive", message: `boundary ${i + 1} must be a positive whole number, got ${b}` });
  });
  for (let i = 1; i < boundaries.length; i++)
    if (boundaries[i] <= boundaries[i - 1])
      problems.push({
        code: "ascending",
        message: `boundary ${i + 1} (${boundaries[i]}) must be greater than boundary ${i} (${boundaries[i - 1]})`,
      });
  return problems;
}
