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
   * The card to hold against — the homeowner's, tokenized in the browser.
   *
   * Optional, and the proof harness passes a Stripe test method. WITHOUT IT
   * the intent is created and sits at `requires_payment_method`: a hold
   * against nothing, which cannot be captured. That is the correct behavior —
   * an authorization needs something to authorize against.
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
  /**
   * Only ever needed to let Stripe.js finish an authentication challenge on an
   * intent the SERVER created. It authorizes completing that one intent — not
   * creating one, and not changing its amount. The browser still cannot author
   * money movement.
   */
  clientSecret?: string | null;
  /**
   * Read back on resume to prove the intent presented after authentication is
   * the one this visit created. NEVER used to establish tenancy — that comes
   * from the connected account and the session's own visit.
   */
  metadata?: Record<string, string>;
};

export type PaymentGateway = {
  authorizeDeposit(args: AuthorizeArgs): Promise<GatewayIntent>;
  captureDeposit(args: CaptureArgs): Promise<GatewayIntent>;
  /**
   * Read an existing authorization back from Stripe. The resume path uses it
   * to check what actually happened during authentication, rather than
   * believing what the browser reports about it.
   */
  retrieveAuthorization(args: {
    stripeAccountId: string;
    paymentIntentId: string;
  }): Promise<GatewayIntent>;
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
    clientSecret: pi.client_secret,
    metadata: pi.metadata ?? {},
  });

  return {
    async authorizeDeposit(args) {
      const pi = await stripe.paymentIntents.create(
        {
          amount: args.amountCents,
          currency: args.currency ?? "usd",
          capture_method: "manual",
          // The deposit flow requires a SYNCHRONOUS, NON-REDIRECT authorization
          // before the local booking transaction: authorize, commit, capture.
          // It therefore must not inherit redirect-capable methods from an
          // individual contractor's Stripe Dashboard.
          //
          // This is NOT a claim that redirect methods cannot be captured
          // manually — some, including Klarna and Cash App Pay, can. The
          // constraint is narrower and it is ours: this V1 flow has no step
          // that hands the homeowner off and waits for them to come back.
          //
          // Left unconstrained this fails per-contractor: it works on accounts
          // with only cards enabled and fails on the ones that turned
          // something else on, which is the kind of break nobody sees until a
          // real homeowner hits it.
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

    async retrieveAuthorization(args) {
      const pi = await stripe.paymentIntents.retrieve(
        args.paymentIntentId,
        undefined,
        connectedAccountContext(args.stripeAccountId)
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
