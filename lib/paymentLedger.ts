/**
 * What the customer owes, and what money moved.
 *
 * Two questions, two ledgers, because one cannot answer both. The formula that
 * looks obvious is wrong:
 *
 *     booked total − captured + refunded = remaining        ← WRONG
 *
 * A $3,085 job with a $249 deposit paid, then canceled and refunded, gives
 * `3085 − 249 + 249 = 3085 still owed`. The homeowner owes nothing. The
 * formula treats a refund as if it restored an obligation, when a refund is
 * cash movement and a cancellation is a change to what is owed.
 *
 *     adjusted amount due  =  booked total + additions − credits
 *     net paid             =  captures − refunds
 *     remaining balance    =  adjusted amount due − net paid
 *
 * The same cancellation, correctly: a CREDIT of $3,085 makes the adjusted due
 * zero, the refund makes net paid zero, and nothing is owed.
 *
 * Everything here is PURE. The ledgers are the truth; these are the only place
 * that reads them, so there is one interpretation rather than one per caller.
 */

/** The subset of a PaymentEvent these functions need. */
export type LedgerEvent = {
  kind: "AUTHORIZATION_CREATED" | "AUTHORIZATION_CANCELED" | "CAPTURE" | "REFUND";
  amountCents: number;
};

/** The subset of a BookingAdjustment these functions need. */
export type LedgerAdjustment = {
  kind: "ADDITION" | "CREDIT";
  amountCents: number;
};

/**
 * What the customer owes, after everything anybody approved.
 *
 * An authorization is NOT money and does not appear here — a hold is a promise
 * the bank makes, not a payment the customer made.
 */
export function adjustedAmountDueCents(
  bookedTotalCents: number,
  adjustments: readonly LedgerAdjustment[]
): number {
  let due = bookedTotalCents;
  for (const a of adjustments) {
    if (a.kind === "ADDITION") due += a.amountCents;
    else due -= a.amountCents;
  }
  return due;
}

/**
 * Money that actually moved, net.
 *
 * Authorizations are deliberately ignored on both sides: created and canceled
 * are states of a hold, and a hold that expires took nothing. Counting one
 * would make an abandoned checkout look like a payment.
 */
export function netPaidCents(events: readonly LedgerEvent[]): number {
  let paid = 0;
  for (const e of events) {
    if (e.kind === "CAPTURE") paid += e.amountCents;
    else if (e.kind === "REFUND") paid -= e.amountCents;
  }
  return paid;
}

export function remainingBalanceCents(
  bookedTotalCents: number,
  adjustments: readonly LedgerAdjustment[],
  events: readonly LedgerEvent[]
): number {
  return adjustedAmountDueCents(bookedTotalCents, adjustments) - netPaidCents(events);
}

/** Everything at once, for a screen or a report. */
export function reconcile(
  bookedTotalCents: number,
  adjustments: readonly LedgerAdjustment[],
  events: readonly LedgerEvent[]
) {
  const adjustedDue = adjustedAmountDueCents(bookedTotalCents, adjustments);
  const netPaid = netPaidCents(events);
  return {
    bookedTotalCents,
    adjustedDueCents: adjustedDue,
    netPaidCents: netPaid,
    remainingCents: adjustedDue - netPaid,
    /** Negative remaining means we hold money that is no longer owed. */
    overpaidCents: Math.max(0, netPaid - adjustedDue),
  };
}

/**
 * V1 INVARIANT: at most one pre-work project per booking.
 *
 * PreWorkVisit is 1:1 on Booking, so two deposit-bearing services on one visit
 * would mean two projects, two permits, two verification visits — and one
 * workflow record. There is no correct behavior available; the model has
 * nowhere to put the second one.
 *
 * Normal services ride along freely. Only a second pre-work service is
 * refused, and the customer is told to book it separately.
 */
export function preWorkProjectConflict(
  services: readonly { slug: string; requiresPreWorkVisit: boolean }[]
): { conflict: boolean; slugs: string[] } {
  const slugs = services.filter((s) => s.requiresPreWorkVisit).map((s) => s.slug).sort();
  return { conflict: slugs.length > 1, slugs };
}

/**
 * The deposit a booking requires, from the services actually on it.
 *
 * Returns 0 rather than null when nothing is due: this function is only called
 * when a booking IS being evaluated, and "evaluated, none due" is a different
 * fact from "never evaluated". Null belongs to bookings this system never saw.
 */
export function depositDueCentsFor(
  services: readonly { depositCents: number | null }[]
): number {
  return services.reduce((sum, s) => sum + (s.depositCents ?? 0), 0);
}
