/**
 * Deposit checkout, in the one order that is safe.
 *
 *     1. AUTHORIZE   money held, nothing local written
 *     2. TRANSACTION everything local, in one commit
 *     3. CAPTURE     money taken, after the commit
 *     4. WEBHOOK     Stripe confirms; the ledger reaches DEPOSIT_CAPTURED
 *
 * WHY THIS ORDER AND NOT ANY OTHER
 *
 * Checkout's transaction cannot contain a network call — the route says why:
 * "a transaction held open across a network call holds database locks for as
 * long as a third party takes to answer." So the money step is outside it, and
 * the only question is which side.
 *
 * Charging first and writing second risks money taken for a booking that does
 * not exist. Writing first and charging second risks a booking nobody paid
 * for. Authorizing first splits the difference: a hold is reversible and
 * expires by itself, so the failure mode of the risky half is "a hold nobody
 * captured" rather than "a payment nobody can find".
 *
 * WHAT EACH FAILURE DOES
 *
 *   authorize fails       nothing happened. The customer is told.
 *   transaction fails     cancel the hold. No booking, no captured money.
 *   capture fails         the booking SURVIVES, visibly, in FAILED. It is not
 *                         deleted: the customer believes they have booked, and
 *                         a vanished booking is worse than an unpaid one. The
 *                         pre-work visit stays locked until capture succeeds.
 */

import type { PaymentGateway } from "./paymentGateway";
import { connectReadiness, type ConnectFacts } from "./stripeConnect";

export type DepositAttempt =
  | { outcome: "not_ready"; reason: string }
  | { outcome: "authorize_failed"; error: string }
  | { outcome: "write_failed"; error: string; authorizationCanceled: boolean }
  | { outcome: "capture_failed"; bookingId: string; paymentIntentId: string; error: string }
  | { outcome: "captured"; bookingId: string; paymentIntentId: string };

export type DepositFlowDeps = {
  gateway: PaymentGateway;
  /** The contractor's Connect facts, as last confirmed with Stripe. */
  connect: ConnectFacts;
  /** Everything local, atomically. Returns the booking id. */
  writeLocal: (paymentIntentId: string) => Promise<string>;
  /** Record the capture and advance the state. Idempotent by construction. */
  recordCapture: (bookingId: string, paymentIntentId: string) => Promise<void>;
  /** Record the failure and make it visible. */
  recordCaptureFailure: (bookingId: string, paymentIntentId: string, error: string) => Promise<void>;
};

export type DepositRequest = {
  stripeAccountId: string;
  amountCents: number;
  /** Stable per checkout attempt, so a retry cannot create a second hold. */
  idempotencyKey: string;
  metadata?: Record<string, string>;
  /** The homeowner's card. Supplied by checkout; a test card in the harness. */
  paymentMethod?: string;
};

export async function runDepositCheckout(
  req: DepositRequest,
  deps: DepositFlowDeps
): Promise<DepositAttempt> {
  // ── 0. READINESS, before anything ──────────────────────────────────────
  //
  // Fails closed. Offering a deposit to a homeowner whose contractor cannot
  // accept it fails after the customer has committed and before anything is
  // recoverable — which is the worst possible moment for it.
  const readiness = connectReadiness(deps.connect);
  if (!readiness.ready) return { outcome: "not_ready", reason: readiness.reason };

  // The amount comes from the caller, snapshotted from the contractor's own
  // service configuration. Nothing here knows what a deposit "should" be.
  if (req.amountCents <= 0) {
    return { outcome: "not_ready", reason: "no deposit is due on this booking" };
  }

  // ── 1. AUTHORIZE ───────────────────────────────────────────────────────
  let intent;
  try {
    intent = await deps.gateway.authorizeDeposit({
      stripeAccountId: req.stripeAccountId,
      amountCents: req.amountCents,
      metadata: req.metadata,
      paymentMethod: req.paymentMethod,
      idempotencyKey: `${req.idempotencyKey}:authorize`,
    });
  } catch (e) {
    return { outcome: "authorize_failed", error: msg(e) };
  }

  // ── 2. TRANSACTION ─────────────────────────────────────────────────────
  let bookingId: string;
  try {
    bookingId = await deps.writeLocal(intent.id);
  } catch (e) {
    // The hold is reversible and this is the whole reason for authorizing
    // first. Cancellation is best-effort: an uncanceled hold expires on its
    // own, so a failure here costs the customer a temporary hold rather than
    // a charge.
    let canceled = false;
    try {
      await deps.gateway.cancelAuthorization({
        stripeAccountId: req.stripeAccountId,
        paymentIntentId: intent.id,
        idempotencyKey: `${req.idempotencyKey}:cancel`,
      });
      canceled = true;
    } catch {
      // Swallowed deliberately — reported, not thrown. The customer's problem
      // is that their booking failed, not that our cleanup did.
    }
    return { outcome: "write_failed", error: msg(e), authorizationCanceled: canceled };
  }

  // ── 3. CAPTURE ─────────────────────────────────────────────────────────
  try {
    await deps.gateway.captureDeposit({
      stripeAccountId: req.stripeAccountId,
      paymentIntentId: intent.id,
      idempotencyKey: `${req.idempotencyKey}:capture`,
    });
  } catch (e) {
    await deps.recordCaptureFailure(bookingId, intent.id, msg(e));
    return { outcome: "capture_failed", bookingId, paymentIntentId: intent.id, error: msg(e) };
  }

  await deps.recordCapture(bookingId, intent.id);
  return { outcome: "captured", bookingId, paymentIntentId: intent.id };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * May this booking's pre-work visit be scheduled or pushed to Jobber?
 *
 * Separate from `installationMayProceed` on purpose: that one gates the
 * INSTALLATION on the visit's findings, this one gates the VISIT on the money.
 * A booking whose deposit failed has an Appointment row — it was written
 * atomically with the booking — and it must not become a real appointment on
 * anybody's calendar.
 */
export function preWorkMayProceed(paymentState: string): { allowed: boolean; reason: string } {
  if (paymentState === "DEPOSIT_CAPTURED") {
    return { allowed: true, reason: "the deposit is captured" };
  }
  if (paymentState === "NOT_REQUIRED") {
    return { allowed: true, reason: "no deposit is required for this booking" };
  }
  return { allowed: false, reason: `the deposit is not captured (${paymentState})` };
}
