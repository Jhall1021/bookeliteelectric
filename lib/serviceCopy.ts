/**
 * Customer-facing copy that points at other services this contractor may not
 * offer.
 *
 * Catalog descriptions are written for the whole trade, so they cross-refer:
 * "Swapping out an existing outlet… This does NOT add a new outlet anywhere
 * new; see 'New 120V Outlet' for that." That sentence is helpful to a
 * contractor who installs new outlets and a dead end for one who does not.
 * BrightPath offers three services and its outlet page sent homeowners to a
 * fourth that does not exist on its storefront.
 *
 * A GENERAL RULE, not a list of slugs. The reference is resolved against
 * whatever that contractor actually has live, so the same sentence survives
 * on one storefront and disappears from another, and a contractor who later
 * launches the referenced service gets the sentence back with no edit.
 *
 * NEVER SUBSTITUTED. An unavailable reference is removed, not redirected to
 * something similar — "see X for that" pointing at a service that does not do
 * that is worse than saying nothing.
 */

/** A quoted name inside a sentence: `see "New 120V Outlet" for that`. */
const QUOTED = /["“”']([^"“”']{3,80})["“”']/g;

/**
 * Remove clauses that refer to a service the homeowner cannot reach.
 *
 * `isAvailable` answers for a NAME, and answers false only for names it
 * recognizes as services this contractor does not currently offer. A quoted
 * phrase that is not a service name at all — a product, a brand, a figure of
 * speech — is left completely alone, because copy is full of quotation marks
 * that have nothing to do with the catalog.
 */
export function resolveServiceReferences(
  text: string | null,
  isAvailable: (name: string) => boolean | null
): string | null {
  if (!text) return text;

  // Sentence, then clause. The reference usually sits in its own clause after
  // a semicolon or dash, and dropping the whole sentence would take the
  // useful half with it — "This does NOT add a new outlet anywhere new" is
  // exactly what a homeowner needs to read.
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];

  for (const sentence of sentences) {
    const clauses = sentence.split(/(?<=[;—])\s+|(?<=\s)—\s+/);
    const keptClauses = clauses.filter((clause) => {
      for (const m of clause.matchAll(QUOTED)) {
        if (isAvailable(m[1]) === false) return false;
      }
      return true;
    });

    if (keptClauses.length === clauses.length) {
      kept.push(sentence);
      continue;
    }
    // Everything referential went: drop the sentence rather than leave a
    // fragment ending in a semicolon.
    if (keptClauses.length === 0) continue;

    const rebuilt = keptClauses.join(" ").trim()
      // A clause kept its trailing semicolon or dash from the split; with what
      // followed removed, that punctuation now dangles.
      .replace(/[;—,]\s*$/, "")
      .trim();
    if (!rebuilt) continue;
    kept.push(/[.!?]$/.test(rebuilt) ? rebuilt : `${rebuilt}.`);
  }

  const out = kept.join(" ").trim();
  return out.length ? out : null;
}

/**
 * Build the availability question from a contractor's catalog.
 *
 * Returns null for an unrecognized name — "not a service" and "a service that
 * is unavailable" must not collapse into one answer, or every quoted phrase in
 * the catalog would start disappearing.
 */
export function serviceAvailabilityLookup(
  services: readonly { name: string; active: boolean }[]
): (name: string) => boolean | null {
  const byName = new Map<string, boolean>();
  for (const s of services) byName.set(s.name.trim().toLowerCase(), s.active);
  return (name: string) => byName.get(name.trim().toLowerCase()) ?? null;
}
