/**
 * What the storefront can promise, given how the contractor prices — ADR-016.
 *
 * Phase 3 created six places pricing language is presented. Every one of them
 * inherited copy written for a flat-rate business: "Skip the Estimate. Know
 * Your Price", "Upfront flat-rate pricing", "Your price". For a contractor
 * billing time and materials those sentences are not merely off-brand, they
 * are a promise nobody can keep.
 *
 * So the copy lives HERE, keyed by strategy, and the theme components take it
 * as data. A theme decides what a headline LOOKS like; it must never decide
 * what the headline CLAIMS.
 *
 *   FLAT_RATE           scope -> approved fixed price
 *   TIME_AND_MATERIALS  scope -> estimated duration + materials -> a range
 *
 * This is the seam, not the engine. Actual T&M calculation and configuration
 * land with Services/Pricing and Guided Pricing. Price2Book does not do time
 * tracking or invoicing either way — the FSM owns actual hours, actual
 * materials, and the final invoice.
 */
import type { PricingStrategy } from "@prisma/client";

export type PricingCopy = {
  strategy: PricingStrategy;
  /** Hero headline and subhead. */
  headline: string;
  subhead: string;
  /** The differentiator that names the pricing promise. */
  pricingDifferentiator: string;
  /** Primary call to action on a page — the hero, the service-area footer. */
  primaryCta: string;
  /**
   * The header's compact call to action. Deliberately separate: the header has
   * less room, and collapsing the two changed Elite's chrome from "Book
   * Service" to "Book Your Service" while nothing reported it. Neither wording
   * depends on the pricing model, but both are CTAs and belong in one place.
   */
  headerCta: string;
  /** Leads a service's starting figure: "From $280" / "Estimated from $280". */
  priceLead: string;
  /** Shown where no figure can be produced yet. */
  noPriceLabel: string;
  /**
   * Labels the resolved figure at the end of the guided flow.
   *
   * Under TIME_AND_MATERIALS this must describe **what the range actually
   * covers**. V1 quotes labor only and discloses materials separately, so
   * calling it an "estimated total" would name a number that is not the total
   * — the homeowner would read a figure and believe it was the whole bill.
   * Asserted mechanically; see FORBIDDEN_TOTAL_LABELS below.
   */
  resolvedPriceLabel: string;
  /** The action that commits: booking a price, or authorising work. */
  commitCta: string;
  /**
   * Non-null ONLY where the displayed figure is an estimate. Rendered wherever
   * a price is shown, so the qualification travels with the number instead of
   * living in terms nobody reads.
   */
  estimateNotice: string | null;
  /**
   * Said wherever an estimate omits materials from its range. Null under
   * FLAT_RATE, where the price already includes them.
   */
  materialsNotice: string | null;
  /** The storefront's meta description. Claims what the model can keep. */
  metaDescription: string;
  /** Section heading for the pricing explainer. */
  pricingSectionTitle: string;
  pricingSectionBody: string;
  /** The same-visit callout. The saving is real under both models; what it is
   *  a saving ON is not the same sentence. */
  sameVisitBody: string;

  // --- the guided flow, where a figure is actually produced ---------------
  /** Headline over the resolved figure at the end of the tree. */
  priceReadyTitle: string;
  /** How long the figure stands. */
  priceHeldNotice: string;
  /** Leads a per-service figure: "Your price for X" / "Estimated total for X". */
  priceForServiceLead: string;
  /** Said when the figure is settled and only photos remain. */
  priceSetNotice: string;
  /** Said when a figure needs a human look before it can be given. */
  confirmAfterLookNotice: string;
  /** What the office will send back after reviewing photos. */
  photoReviewPromise: string;
  /** The same promise, with the turnaround. */
  photoReviewEmailPromise: string;

  // --- the "how it works" explainer ---------------------------------------
  seePriceStepTitle: string;
  seePriceStepBody: string;

  // --- the trust page's pricing point --------------------------------------
  trustPricingTitle: string;
  trustPricingBody: string;

  // --- transactional mail ---------------------------------------------------
  quoteEmailTitle: string;
  /** The sentence that says what kind of number this is. */
  quoteEmailQualifier: string;
  /** Leads the subject line: "Your price for X" / "Your estimate for X". */
  quoteEmailSubjectLead: string;
};

const FLAT_RATE: PricingCopy = {
  strategy: "FLAT_RATE",
  headline: "Skip the Estimate. Know Your Price.",
  subhead: "Pick your time. Book online.",
  pricingDifferentiator: "Upfront flat-rate pricing",
  primaryCta: "Book Your Service",
  headerCta: "Book Service",
  priceLead: "From",
  noPriceLabel: "Custom Quote",
  resolvedPriceLabel: "Your price",
  commitCta: "Book at this price",
  estimateNotice: null,
  materialsNotice: null,
  metaDescription: "See your price. Pick your time. Book your electrician.",
  pricingSectionTitle: "How Our Pricing Works",
  pricingSectionBody:
    "Getting an electrician to your door is most of what a small job costs. Your first service covers that, and everything after it is priced for the work it actually takes.",
  sameVisitBody:
    "Book your first service at the regular price. When being on-site already saves us time on the rest, you get that saving too.",

  priceReadyTitle: "Here's Your Price!",
  priceHeldNotice: "Your price is locked in for 30 days.",
  priceForServiceLead: "Your price for",
  priceSetNotice: "Your price is set.",
  confirmAfterLookNotice: "We'll confirm your price after a quick look",
  photoReviewPromise: "We'll review them and send back a fixed price.",
  photoReviewEmailPromise: "We'll email you a fixed price, usually within one business day.",

  seePriceStepTitle: "See Your Price",
  seePriceStepBody:
    "Answer a few questions about the job and see the price before you book — no estimate visit, no waiting on a callback.",

  trustPricingTitle: "Upfront Flat-Rate Pricing",
  trustPricingBody:
    "You see your price before we start — never a surprise bill after the work is done.",

  quoteEmailTitle: "Your price is ready",
  quoteEmailQualifier: "A fixed price for the work as we've seen it — not an estimate.",
  quoteEmailSubjectLead: "Your price for",
};

const TIME_AND_MATERIALS: PricingCopy = {
  strategy: "TIME_AND_MATERIALS",
  // Deliberately does not promise a price. It promises knowing the rate and
  // the likely range before anyone is in the house, which is the honest
  // version of the same reassurance.
  headline: "Know the Rate. See the Range.",
  subhead: "Pick your time. Book online.",
  pricingDifferentiator: "Rates and estimates upfront",
  primaryCta: "Book Your Service",
  headerCta: "Book Service",
  priceLead: "Estimated from",
  noPriceLabel: "Estimate on request",
  resolvedPriceLabel: "Estimated labor",
  commitCta: "Authorize service",
  estimateNotice:
    "This is an estimate, not a fixed-price quote. Your final invoice is based on the actual time and materials used.",
  materialsNotice:
    "Materials are billed in addition to labor, at cost plus our standard markup.",
  metaDescription: "See the rate and your estimated range. Pick your time. Book your electrician.",
  pricingSectionTitle: "How Our Pricing Works",
  pricingSectionBody:
    "You see the hourly rate and an estimated range for the work before you book. The final bill reflects the time the job actually takes and the materials it actually needs.",
  sameVisitBody:
    "Adding work to a visit we are already making saves the trip and the setup, and the estimate for the extra work reflects that.",

  priceReadyTitle: "Here's Your Estimate",
  priceHeldNotice: "This estimate is good for 30 days. Final billing is based on actual time and materials.",
  priceForServiceLead: "Estimated total for",
  priceSetNotice: "Your estimate is ready.",
  confirmAfterLookNotice: "We'll confirm your estimate after a quick look",
  photoReviewPromise: "We'll review them and send back an estimate.",
  photoReviewEmailPromise: "We'll email you an estimate, usually within one business day.",

  seePriceStepTitle: "See Your Estimate",
  seePriceStepBody:
    "Answer a few questions about the job and see the rate and an estimated range before you book — no estimate visit, no waiting on a callback.",

  trustPricingTitle: "Rates and Estimates Upfront",
  trustPricingBody:
    "You see the hourly rate and an estimated range before we start, and the final bill reflects the work actually done.",

  quoteEmailTitle: "Your estimate is ready",
  quoteEmailQualifier:
    "An estimate for the work as we've seen it. Final billing is based on the actual time and materials the job takes.",
  quoteEmailSubjectLead: "Your estimate for",
};

const BY_STRATEGY: Record<PricingStrategy, PricingCopy> = {
  FLAT_RATE, TIME_AND_MATERIALS,
};

/** Falls back to flat rate, which is the schema default and Elite's model. */
export function pricingCopy(strategy: PricingStrategy | null | undefined): PricingCopy {
  return BY_STRATEGY[strategy ?? "FLAT_RATE"] ?? FLAT_RATE;
}

/**
 * Strings that assume a fixed price, for the identity linter.
 *
 * Any of these appearing in a generic customer-facing component is the bug
 * this file exists to prevent: copy that is true for Elite, silently wrong for
 * a contractor billing time and materials, and invisible until one complains.
 */
/**
 * Words a labor-only range may not be labeled with.
 *
 * The whole risk of quoting labor and disclosing materials separately is that
 * a label quietly promotes the figure into the whole bill. So the language is
 * constrained rather than trusted, and the constraint is testable.
 *
 * Lift this only when the estimate genuinely includes materials.
 */
export const FORBIDDEN_TOTAL_LABELS = /\b(total|all[- ]in|full price|final price|everything)\b/i;

/** Every T&M label a customer sees applied to the labor-only range. */
export const TM_RANGE_LABELS = (c: PricingCopy) => [c.resolvedPriceLabel, c.priceLead];

export const FLAT_RATE_ASSUMPTIONS: readonly RegExp[] = [
  /\bknow your (exact )?price\b/i,
  /\bupfront (fixed|flat[- ]rate) price\b/i,
  /\byour price\b/i,
  /\bexact price\b/i,
  /\bfixed price\b/i,
  /\baccept (your |the )?quote\b/i,
  /\bskip the estimate\b/i,
  /\bflat[- ]rate pricing\b/i,
];
