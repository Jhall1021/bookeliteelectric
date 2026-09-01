/**
 * Sales tax, as a rate the contractor entered times a subtotal.
 *
 * DELIBERATELY NOT A TAX ENGINE. Price2Book does not determine jurisdiction,
 * nexus, taxability or recognition timing, does not call Stripe Tax, and
 * creates no tax transaction. It applies one configured percentage to the
 * pre-tax subtotal so the homeowner sees a truthful total before they book,
 * and records what was applied. Final billing and filing belong to the
 * contractor, who is already merchant of record.
 *
 * That boundary is the whole design. Everything below is arithmetic.
 *
 * WHY PARTS PER MILLION
 *
 * 6.625% needs three decimal places of percent. Basis points give two
 * (6.625% is 662.5bp, not an integer) and a float gives rounding nobody can
 * predict at the cent. ppm holds it exactly: 6.625% is 66_250, and every
 * calculation below is integer arithmetic.
 */

export type TaxSettings = {
  salesTaxEnabled: boolean;
  salesTaxRatePpm: number | null;
};

export type TaxBreakdown = {
  /** What the contractor's approved prices add up to. Never moves. */
  subtotalCents: number;
  /** The rate applied, snapshotted so a later change cannot rewrite history. */
  ratePpm: number | null;
  /** Zero when tax is off or the rate is zero. Never null once evaluated. */
  taxCents: number;
  /** What the homeowner agreed to pay in total. */
  totalWithTaxCents: number;
};

const PPM = 1_000_000;

/** 66_250 -> "6.625%", trimming the zeros nobody reads. */
export function formatRate(ratePpm: number): string {
  const percent = ratePpm / 10_000;
  return `${percent.toFixed(3).replace(/\.?0+$/, "")}%`;
}

/** A rate a contractor could plausibly mean. Rejects the typo, not the edge. */
export function validateRatePpm(ratePpm: number): string | null {
  if (!Number.isInteger(ratePpm) || ratePpm < 0) {
    return "Enter a tax rate as a percentage, like 6.625.";
  }
  // 25% is above every US combined rate and well below a mistyped 6625.
  if (ratePpm > 250_000) {
    return "That rate looks too high — enter a percentage, like 6.625 rather than 6625.";
  }
  return null;
}

/**
 * The whole calculation.
 *
 * Rounds half away from zero at the cent, which is what a person doing this on
 * paper does and what an invoice will say. `Math.round` alone rounds .5 toward
 * +Infinity, which is the same thing for the non-negative amounts this ever
 * sees; it is written out so nobody has to work that out again.
 */
export function applySalesTax(subtotalCents: number, settings: TaxSettings): TaxBreakdown {
  const rate = settings.salesTaxEnabled ? settings.salesTaxRatePpm ?? 0 : 0;
  const taxCents = rate > 0 ? Math.round((subtotalCents * rate) / PPM) : 0;
  return {
    subtotalCents,
    // The rate is recorded whenever tax was EVALUATED, including when it is
    // zero — "we applied 0%" and "we never looked" are different facts, and
    // the booking snapshot has to be able to tell them apart.
    ratePpm: settings.salesTaxEnabled ? settings.salesTaxRatePpm ?? 0 : 0,
    taxCents,
    totalWithTaxCents: subtotalCents + taxCents,
  };
}
