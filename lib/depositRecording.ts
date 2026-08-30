/**
 * Writing down what the gateway did, idempotently.
 *
 * Separated from the flow so the ordering can be proved without a database and
 * the recording can be proved without a gateway.
 *
 * IDEMPOTENT BY CONSTRAINT, NOT BY CHECKING FIRST. `recordCapture` catches the
 * unique violation rather than looking before it writes, because a check
 * followed by an insert leaves a window in which two requests both see nothing
 * and both write — and a duplicate row here is a duplicate payment in every
 * report that reads the ledger.
 *
 * This is what makes the timeout case converge. When the server captures
 * successfully, times out before hearing so, and retries: Stripe's idempotency
 * key returns the same intent rather than charging again, and this returns the
 * same ledger state rather than recording it twice.
 */

import type { PrismaClient } from "@prisma/client";

const UNIQUE_VIOLATION = "P2002";
const isUnique = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === UNIQUE_VIOLATION;

export type CaptureRecord = { alreadyRecorded: boolean };

/**
 * One CAPTURE row per PaymentIntent, and the booking reaches DEPOSIT_CAPTURED.
 *
 * Safe to call any number of times with the same arguments.
 */
export async function recordCapture(
  db: PrismaClient,
  bookingId: string,
  paymentIntentId: string,
  amountCents: number,
  stripeEventId?: string | null
): Promise<CaptureRecord> {
  let alreadyRecorded = false;
  try {
    await db.paymentEvent.create({
      data: {
        bookingId,
        kind: "CAPTURE",
        amountCents,
        stripeObjectId: paymentIntentId,
        stripeEventId: stripeEventId ?? null,
      },
    });
  } catch (e) {
    if (!isUnique(e)) throw e;
    // The money moved once and was already written down. Either the webhook
    // beat the synchronous path or a retry arrived — both are this.
    alreadyRecorded = true;
  }

  // Idempotent on its own: setting a state to what it already is costs
  // nothing and means a partial failure can be re-driven safely.
  await db.booking.update({
    where: { id: bookingId },
    data: { paymentState: "DEPOSIT_CAPTURED" },
  });

  return { alreadyRecorded };
}

/**
 * A capture that failed.
 *
 * The booking SURVIVES. The customer believes they have booked, and deleting
 * it would leave them with a confirmation for something that no longer exists.
 * FAILED is visible, queryable and retryable — which is what an operator needs
 * and what a deleted row cannot offer.
 *
 * No PaymentEvent is written: nothing moved, and a ledger of attempted money
 * is a different thing from a ledger of money.
 */
export async function recordCaptureFailure(
  db: PrismaClient,
  bookingId: string,
  paymentIntentId: string,
  error: string
): Promise<void> {
  await db.booking.update({
    where: { id: bookingId },
    data: {
      paymentState: "FAILED",
      paymentStatus: `deposit capture failed on ${paymentIntentId}: ${error.slice(0, 160)}`,
    },
  });
}
