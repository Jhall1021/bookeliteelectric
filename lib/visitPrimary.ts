/**
 * Which service on a visit is the primary one.
 *
 * WHY THIS EXISTS
 *
 * A visit has exactly one primary service. It carries the full standalone
 * price — which already has the service-call minimum baked into it — and
 * everything else on the visit is charged at its While We're There rate,
 * because the van is already outside.
 *
 * That choice used to be `existingCount === 0`: whichever service happened to
 * be added first. So the order a customer clicked in decided what they paid.
 * On two real services today:
 *
 *     ethernet added first, sconce second   $415 + $130 = $545
 *     sconce added first, ethernet second   $255 + $355 = $610
 *
 * Same visit, same work, sixty-five dollars apart. Harmless when people
 * browsed and added one thing; systematic once the service finder can hand
 * over two at once, because then an arbitrary ordering inside a model's JSON
 * output sets the price.
 *
 * THE RULE
 *
 * resolveRoute uses isPrimary for exactly one thing — picking basePrice or
 * whileWeThereBasePrice. Increments from the answer tree are identical either
 * way. So for any two services the whole difference between orderings is:
 *
 *     (A.base - A.wwt) - (B.base - B.wwt)
 *
 * The cheapest arrangement therefore makes primary whichever service has the
 * SMALLEST gap between its standalone and add-on price. Not the largest
 * price, and not the longest job — the smallest gap. Those coincide while
 * every published price matches the model, and would quietly diverge the
 * first time an approved price departs from it.
 *
 * This is a business choice, not an electrical fact: it resolves in the
 * customer's favour rather than Elite's.
 *
 * POLICY[visit.primary_selection]: SMALLEST_STANDALONE_TO_ADDON_GAP
 *
 * ORDER INDEPENDENCE
 *
 * The result is a function of the SET of services on the visit. Ties break on
 * slug so the same set always yields the same answer, and ties are price-
 * identical anyway. scripts/verify-visit-primary.ts checks every permutation
 * of every subset rather than trusting that argument.
 */

/** The minimum a caller must know about a service to place it on a visit. */
export type PrimaryCandidate = {
  /** Stable identity for tie-breaking. */
  slug: string;
  /** Standalone published price. Null means it cannot be the primary. */
  basePrice: number | null;
  /** Add-on published price. Null means it cannot be demoted to an add-on. */
  whileWeThereBasePrice: number | null;
};

export type PrimarySelection<T extends PrimaryCandidate> =
  | { ok: true; primary: T; addOns: T[] }
  | { ok: false; conflict: string };

/**
 * The gap that decides it. Exported so admin tooling can show the same figure
 * rather than recomputing the subtraction somewhere else.
 */
export function primaryGapCents(c: PrimaryCandidate): number | null {
  if (c.basePrice === null || c.whileWeThereBasePrice === null) return null;
  return c.basePrice - c.whileWeThereBasePrice;
}

/**
 * Choose the primary for a set of services.
 *
 * Never throws and never guesses. When no arrangement works it says why, and
 * the caller fails closed the way the rest of the pricing path does.
 */
export function selectPrimary<T extends PrimaryCandidate>(
  candidates: T[]
): PrimarySelection<T> {
  if (candidates.length === 0) {
    return { ok: false, conflict: "No services on the visit" };
  }

  // A service with no published add-on price cannot be anything BUT the
  // primary. If two of them are on one visit, no arrangement is valid — and
  // that's a catalog gap to fix rather than something to price around.
  const undemotable = candidates.filter((c) => c.whileWeThereBasePrice === null);
  if (undemotable.length > 1) {
    return {
      ok: false,
      conflict:
        `${undemotable.map((c) => c.slug).join(", ")} each have no published ` +
        `add-on price, so more than one would have to be the primary`,
    };
  }

  if (undemotable.length === 1) {
    const forced = undemotable[0];
    if (forced.basePrice === null) {
      return {
        ok: false,
        conflict: `${forced.slug} has neither a standalone nor an add-on price`,
      };
    }
    return { ok: true, primary: forced, addOns: candidates.filter((c) => c !== forced) };
  }

  // Everything here can be demoted, so the choice is free: smallest gap wins.
  // A service with no standalone price (quote-only) can't be the primary, but
  // can still ride along as an add-on.
  const eligible = candidates.filter((c) => c.basePrice !== null);
  if (eligible.length === 0) {
    return {
      ok: false,
      conflict:
        "No service on the visit has a published standalone price, so nothing " +
        "can carry the service call",
    };
  }

  let best = eligible[0];
  let bestGap = primaryGapCents(best)!;
  for (const c of eligible.slice(1)) {
    const gap = primaryGapCents(c)!;
    // Strictly less, then slug — so the winner depends on the set and not on
    // the order the set arrived in. Equal gaps cost the customer the same, so
    // the tiebreak is about determinism, not money.
    if (gap < bestGap || (gap === bestGap && c.slug < best.slug)) {
      best = c;
      bestGap = gap;
    }
  }

  return { ok: true, primary: best, addOns: candidates.filter((c) => c !== best) };
}

/**
 * What has to change on an existing visit for the selection to hold.
 *
 * Returns only the lines whose primary flag is wrong, so a caller replays the
 * route for those and leaves everything else untouched. An already-correct
 * visit produces an empty list and costs nothing.
 *
 * Self-healing by design: it reconciles the whole visit rather than assuming
 * the existing primary was chosen correctly. Carts built before this rule
 * existed get fixed the next time anything is added to them.
 */
export type FlagChange<T> = { candidate: T; shouldBePrimary: boolean };

export function reconcilePrimary<T extends PrimaryCandidate & { isPrimary: boolean }>(
  candidates: T[]
): { ok: true; changes: FlagChange<T>[] } | { ok: false; conflict: string } {
  const selection = selectPrimary(candidates);
  if (!selection.ok) return selection;

  const changes: FlagChange<T>[] = [];
  for (const c of candidates) {
    const shouldBePrimary = c === selection.primary;
    if (c.isPrimary !== shouldBePrimary) changes.push({ candidate: c, shouldBePrimary });
  }
  return { ok: true, changes };
}
