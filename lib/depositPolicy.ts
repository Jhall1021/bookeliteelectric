/**
 * Whether a booking takes a deposit, and how much.
 *
 * ONE DEPOSIT PER BOOKING. The old rule summed `Service.depositCents` across
 * the visit, so two $249 services on one booking asked a homeowner for $498 —
 * two deposits for one appointment. A deposit secures the job, and there is
 * one job.
 *
 * THE RULES ARE OR, NOT AND. A contractor who wants a deposit above $1,000 and
 * also on anything over four hours means either, not both — a $1,400 two-hour
 * job and a $300 six-hour job each secure something worth securing.
 *
 * PRECEDENCE, stated once so it cannot drift:
 *
 *   1. ANY service marked ALWAYS_REQUIRE  -> deposit
 *   2. else EVERY service marked NEVER_REQUIRE -> no deposit
 *   3. else the company rules, evaluated over the WHOLE booking
 *
 * Step 2 is deliberately "every", not "any". A NEVER_REQUIRE service excuses
 * itself; it does not excuse the booking it happens to be riding on, or adding
 * a $40 outlet swap to a $4,000 panel replacement would waive the deposit on
 * the panel.
 */

import type { DepositRule } from "@prisma/client";

export type DepositPolicy = {
  depositAmountCents: number | null;
  depositOnEveryBooking: boolean;
  /** Null means the rule is off. */
  depositSubtotalThresholdCents: number | null;
  /** Null means the rule is off. */
  depositDurationThresholdMinutes: number | null;
};

export type BookingForDeposit = {
  /** PRE-TAX. Tax must never push a job over the threshold. */
  subtotalCents: number;
  /**
   * The block the scheduling engine actually reserves, in minutes.
   *
   * Null when any line item has no estimate — the same null
   * `estimatedDurationMinutes` carries into the calendar. The duration rule
   * cannot then evaluate, so it does not match; the other rules still do. A
   * guess here would either invent a deposit or waive one, and both are worse
   * than a rule that declines to fire on data it does not have.
   */
  durationMinutes: number | null;
  services: readonly { slug: string; depositRule: DepositRule }[];
};

export type DepositDecision = {
  required: boolean;
  /** Why, for the contractor's own screens. Empty when none matched. */
  reasons: string[];
  /** What to collect. Zero when none is required. */
  amountCents: number;
  /** True when the configured amount was more than the booking is worth. */
  cappedToTotal: boolean;
};

/** Does this booking require a deposit, and why? Amount is decided separately. */
export function depositRequiredFor(
  booking: BookingForDeposit,
  policy: DepositPolicy
): { required: boolean; reasons: string[] } {
  const always = booking.services.filter((s) => s.depositRule === "ALWAYS_REQUIRE");
  if (always.length > 0) {
    return { required: true, reasons: [`${always[0].slug} always requires a deposit`] };
  }

  const considered = booking.services.filter((s) => s.depositRule !== "NEVER_REQUIRE");
  if (booking.services.length > 0 && considered.length === 0) {
    return { required: false, reasons: [] };
  }

  const reasons: string[] = [];
  if (policy.depositOnEveryBooking) reasons.push("you take a deposit on every booking");

  if (
    policy.depositSubtotalThresholdCents !== null &&
    booking.subtotalCents >= policy.depositSubtotalThresholdCents
  ) {
    reasons.push(
      `the job is $${(booking.subtotalCents / 100).toFixed(2)} before tax, at or above your ` +
        `$${(policy.depositSubtotalThresholdCents / 100).toFixed(2)} threshold`
    );
  }

  if (
    policy.depositDurationThresholdMinutes !== null &&
    booking.durationMinutes !== null &&
    booking.durationMinutes >= policy.depositDurationThresholdMinutes
  ) {
    reasons.push(
      `it books ${(booking.durationMinutes / 60).toFixed(1)} hours of your day, at or above ` +
        `your ${(policy.depositDurationThresholdMinutes / 60).toFixed(1)}-hour threshold`
    );
  }

  return { required: reasons.length > 0, reasons };
}

/**
 * The decision and the figure together.
 *
 * CAPPED AT THE TAX-INCLUSIVE TOTAL. A contractor whose deposit is $500 and
 * whose customer books $200 of work must not be asked for more than the job
 * costs — and refusing the booking would be worse: it turns a configuration
 * choice into a lost customer. Taking the whole amount is the smallest safe
 * behavior, and it is deterministic.
 *
 * Capped at the TAX-INCLUSIVE total rather than the subtotal, because that is
 * what the homeowner owes; a deposit that exceeded it would leave a negative
 * remaining balance on the confirmation.
 */
export function decideDeposit(
  booking: BookingForDeposit,
  policy: DepositPolicy,
  totalWithTaxCents: number
): DepositDecision {
  const { required, reasons } = depositRequiredFor(booking, policy);
  if (!required) return { required: false, reasons: [], amountCents: 0, cappedToTotal: false };

  const configured = policy.depositAmountCents ?? 0;
  // A rule matched but no amount is set: nothing to collect, and refusing the
  // booking over the contractor's own missing setting would punish the
  // customer. Readiness is where an unset amount belongs.
  if (configured <= 0) {
    return { required: false, reasons, amountCents: 0, cappedToTotal: false };
  }

  const capped = configured > totalWithTaxCents;
  return {
    required: true,
    reasons,
    amountCents: capped ? totalWithTaxCents : configured,
    cappedToTotal: capped,
  };
}
