import { formatCents } from "./flow-types";
import type { PricingStrategy } from "@prisma/client";

/**
 * One accurate line describing what a service actually charges — for the
 * Services & Pricing catalog, where a single flat number used to stand in
 * for every service regardless of whether it kept that promise.
 *
 * Reuses `CatalogPromise.promisesFixedPrice` (lib/onboardingReadiness.ts,
 * itself built on lib/activationOutcome.ts's tree walk) rather than
 * re-deriving "does this service actually promise a price" from
 * `bookingType` alone — a service declared ADJUSTED whose every route
 * reaches review promises nothing, and this must not disagree with the
 * readiness engine that already decided that.
 */
export type ServicePricingSummary = {
  /** The one line shown at a glance — "$249", "From $249", "$180–260 estimate", "Custom quote", "Not published yet". */
  primary: string;
  /** A short qualifier shown under the primary line, only when something is actually true of it — never invented to fill space. */
  secondary: string | null;
  /** Whether this line deserves an attention color — an unapproved, missing, or drifted price, never merely "quote-driven" (that's a legitimate resting state). */
  needsAttention: boolean;
};

export function describeServicePricing(input: {
  pricingStrategy: PricingStrategy;
  promisesFixedPrice: boolean;
  hasTree: boolean;
  basePrice: number | null;
  whileWeThereBasePrice: number | null;
  startingPriceLabel: string | null;
  publishedPriceApprovedAt: Date | null;
  estimateLowCrewHours: number | null;
  estimateHighCrewHours: number | null;
  estimateApprovedAt: Date | null;
  /** True when the current published/derived price no longer matches what current inputs would derive — lib/onboardingReadiness.ts's PRICE_DRIFTED. */
  priceDrifted: boolean;
  /** True when a fixed price is derivable but has never been approved — PRICE_NOT_APPROVED / SUGGESTED_NOT_APPROVED. */
  priceUnapproved: boolean;
  /** True when the fixed price can't even be derived yet — LABOR_INPUTS_MISSING. */
  laborMissing: boolean;
}): ServicePricingSummary {
  const addOn = input.whileWeThereBasePrice !== null ? ` · ${formatCents(input.whileWeThereBasePrice)} add-on` : "";

  if (!input.promisesFixedPrice) {
    // Quote-driven is a legitimate, deliberate outcome — the photo-review or
    // remote-quote path IS the promise, not a gap in it. Never flagged.
    return { primary: input.startingPriceLabel ?? "Custom quote", secondary: null, needsAttention: false };
  }

  if (input.pricingStrategy === "TIME_AND_MATERIALS") {
    if (input.estimateLowCrewHours === null || input.estimateHighCrewHours === null) {
      return { primary: "Estimate range not set", secondary: null, needsAttention: true };
    }
    const range = `${input.estimateLowCrewHours}–${input.estimateHighCrewHours} hr estimate`;
    if (!input.estimateApprovedAt) {
      return { primary: range, secondary: "awaiting approval", needsAttention: true };
    }
    return { primary: range, secondary: null, needsAttention: false };
  }

  // FLAT_RATE
  if (input.basePrice === null) {
    return {
      primary: input.laborMissing ? "Not priced yet" : "Not published",
      secondary: null,
      needsAttention: true,
    };
  }
  const primary = `${input.hasTree ? "From " : ""}${formatCents(input.basePrice)}${addOn}`;
  if (input.priceDrifted) {
    return { primary, secondary: "price has changed since approval", needsAttention: true };
  }
  if (input.priceUnapproved) {
    return { primary, secondary: "awaiting approval", needsAttention: true };
  }
  return { primary, secondary: null, needsAttention: false };
}
