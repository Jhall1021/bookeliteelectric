/**
 * The boundary between this application and whoever moves the money.
 *
 * An interface rather than direct Stripe calls, for one reason that matters
 * more than testability: **the deposit ordering has to be proved, and it
 * cannot be proved against a network.** Authorize-then-write-then-capture is
 * only correct if a failure at each point does the right thing, and the only
 * way to demonstrate that is to make each point fail on demand.
 *
 * So the flow takes a gateway. Production passes the Stripe one. The proof
 * passes one that fails wherever the proof needs it to.
 *
 * EVERY CALL NAMES THE CONNECTED ACCOUNT. Not by a default configured
 * somewhere — as a required argument, so a call that forgets does not compile
 * rather than quietly operating on the platform account. Homeowner money
 * belongs to the contractor; Price2Book never holds it.
 */

import Stripe from "stripe";
import { stripeClient, connectedAccountContext } from "./stripeConnect";

export type AuthorizeArgs = {
  /** The contractor's connected account. Required, never defaulted. */
  stripeAccountId: string;
  amountCents: number;
  currency?: string;
  /** Correlation only — never read back as tenancy authority. */
  metadata?: Record<string, string>;
  /** Outbound idempotency, so a retried authorize cannot create two holds. */
  idempotencyKey: string;
};

export type CaptureArgs = {
  stripeAccountId: string;
  paymentIntentId: string;
  /** So a retried capture cannot take the money twice. */
  idempotencyKey: string;
};

export type GatewayIntent = {
  id: string;
  status: string;
  amountCents: number;
};

export type PaymentGateway = {
  authorizeDeposit(args: AuthorizeArgs): Promise<GatewayIntent>;
  captureDeposit(args: CaptureArgs): Promise<GatewayIntent>;
  /** Best-effort. A hold that is never canceled expires on its own. */
  cancelAuthorization(args: CaptureArgs): Promise<void>;
};

/**
 * The real one.
 *
 * `capture_method: "manual"` is the whole ordering strategy in one option: the
 * money is held, not taken, until the local write has committed. The hold is
 * being used as a short atomicity bridge rather than parked on a customer's
 * card for days.
 */
export function stripeGateway(): PaymentGateway | null {
  const stripe = stripeClient();
  if (!stripe) return null;

  const toIntent = (pi: Stripe.PaymentIntent): GatewayIntent => ({
    id: pi.id,
    status: pi.status,
    amountCents: pi.amount,
  });

  return {
    async authorizeDeposit(args) {
      const pi = await stripe.paymentIntents.create(
        {
          amount: args.amountCents,
          currency: args.currency ?? "usd",
          capture_method: "manual",
          metadata: args.metadata,
        },
        {
          ...connectedAccountContext(args.stripeAccountId),
          idempotencyKey: args.idempotencyKey,
        }
      );
      return toIntent(pi);
    },

    async captureDeposit(args) {
      const pi = await stripe.paymentIntents.capture(
        args.paymentIntentId,
        undefined,
        {
          ...connectedAccountContext(args.stripeAccountId),
          idempotencyKey: args.idempotencyKey,
        }
      );
      return toIntent(pi);
    },

    async cancelAuthorization(args) {
      await stripe.paymentIntents.cancel(
        args.paymentIntentId,
        undefined,
        { ...connectedAccountContext(args.stripeAccountId) }
      );
    },
  };
}
