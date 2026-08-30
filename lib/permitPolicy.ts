/**
 * Permits are not in the price, and the customer is told so in one sentence.
 *
 * ELITE'S DEFAULT, 29 August 2026: permit fees are excluded from every
 * published Price2Book price unless a service explicitly says otherwise.
 *
 * The reason is that a permit fee is not work Elite controls. It is set by a
 * jurisdiction, varies between towns for identical work, and changes without
 * anyone here being told. Folding an estimate of it into labour or material
 * would make the base price wrong in two directions at once: too high where the
 * fee is small or waived, too low where it is not, and untraceable in both
 * because the number would be hiding inside a figure that claims to describe
 * the job.
 *
 * So the base price stays tied to the work, and the fee is named separately.
 *
 * ONE SENTENCE, USED VERBATIM.
 *
 * Not a template, not a per-service rewording. A customer comparing two
 * services should meet the same words, and a sentence that exists in six
 * slightly different versions is six things to keep in step. Exported so there
 * is one copy, and checked by scripts/verify-permit-policy.ts so a seventh
 * cannot appear.
 */

/** The exact wording where a permit is NOT in the price. Never paraphrase. */
export const PERMIT_DISCLAIMER =
  "Permit fees, if required, are not included and will be added separately.";

/**
 * The exact wording where a permit IS in the price.
 *
 * A service cannot carry both sentences, and the verifier refuses if one does.
 * They are opposite promises, and a disclaimer that made both would be worse
 * than saying nothing.
 */
export const PERMIT_INCLUDED_DISCLAIMER =
  "The electrical permit for this work is included in the price shown.";

/** Loose enough to catch a paraphrase, so the verifier can object to one. */
export const MENTIONS_PERMIT = /\bpermit/i;

/**
 * Services allowed to carry a non-zero permit allowance.
 *
 * Empty, deliberately. Elite includes no permit in any published price today.
 * An entry here is a decision that a specific service DOES include one, and it
 * needs the disclaimer to say so rather than the default sentence.
 */
export const PERMIT_INCLUDED_SLUGS: string[] = [
  // Empty, and that is Elite's settled position as of 29 Aug 2026: no service
  // carries a permit fee in its price. A $250 allowance was tried on
  // electrical-panel-replacement and withdrawn the same day — the base price
  // should describe the work Elite controls, and a jurisdiction's fee is not
  // that.
  //
  // The mechanism stays because the policy explicitly allows an exception
  // ("unless a service explicitly says otherwise"), and the verifier proves it
  // works: a slug added here must carry a real allowance, must say the permit
  // is included, and must not also carry the excluded sentence.
];
