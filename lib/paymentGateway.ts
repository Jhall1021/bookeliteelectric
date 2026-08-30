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
  /**
   * The card to hold against.
   *
   * In production this is the homeowner's payment method, collected by the
   * checkout UI — which is a later release. Optional so this release can be
   * exercised end to end with a Stripe test payment method, and so the
   * eventual UI has somewhere to put a real one without changing the shape.
   *
   * WITHOUT IT the intent is created and sits at `requires_payment_method`: a
   * hold against nothing, which cannot be captured. That is the correct
   * behavior — an authorization needs something to authorize against.
   */
  paymentMethod?: string;
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
          // A deposit is a HOLD: authorize now, capture after the booking
          // commits. Redirect-based methods (Klarna, Cash App) do not support
          // that shape, and a connected account can enable them in its own
          // dashboard without telling us — so the intent is constrained here
          // rather than left to each contractor's dashboard settings.
          //
          // Otherwise this fails per-contractor: it works on accounts with
          // only cards enabled and fails on the ones that turned something
          // else on, which is the kind of break nobody sees until a real
          // homeowner hits it.
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
          metadata: args.metadata,
          // Confirmed at creation when a card is supplied, which is what turns
          // "an intent exists" into "money is actually held". Without it the
          // intent waits for a payment method and captures nothing.
          ...(args.paymentMethod
            ? { payment_method: args.paymentMethod, confirm: true }
            : {}),
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
