/**
 * Stripe Connect — the contractor's own payment account.
 *
 * Homeowner money moves from a homeowner to a contractor. Price2Book
 * facilitates it and never holds it. With DIRECT CHARGES the connected account
 * is the merchant of record: their name on the statement, their dispute, their
 * payout, their liability. Stripe documents direct charges as the fit for a
 * platform enabling its customers to take payments, which is exactly this.
 *
 * NOT PRICE2BOOK'S OWN BILLING. That is a separate Stripe surface, on the
 * platform account, with the contractor as the customer. The two share an SDK
 * and nothing else — not a Customer object, not a webhook, not a table. The
 * failure mode if they blur is a contractor's overdue software invoice
 * entangled with a homeowner's deposit.
 *
 * RELEASE #1 IS ONBOARDING ONLY. Nothing here moves a dollar. No charge, no
 * intent, no payment method. The single question it answers is whether a
 * contractor could accept homeowner money if we asked them to.
 */

import Stripe from "stripe";

/**
 * The facts Stripe reported, as stored.
 *
 * Deliberately the raw answers rather than a computed verdict: a stored
 * boolean called `paymentReady` would be a conclusion nobody could re-derive,
 * and the rule for reaching it is likely to tighten before it loosens.
 */
export type ConnectFacts = {
  stripeAccountId: string | null;
  /** The merchant configuration exists on the v2 account. */
  stripeMerchantConfigured: boolean;
  /** v2 merchant capability: "active", "pending", "unsupported", or null. */
  stripeCardPaymentsStatus: string | null;
  /** Outstanding onboarding requirements that block charging. */
  stripeOnboardingBlocked: boolean;
  stripeReadinessCheckedAt: Date | null;
};

export type Readiness = {
  ready: boolean;
  /** Operator-facing. Says which condition failed, not just that one did. */
  reason: string;
};

/**
 * Can this contractor actually accept a direct card charge?
 *
 * PURE, so it can be proved without Stripe and without a network. Every
 * condition is a fact Stripe reported; none is inferred from our own flow
 * having reached a particular screen.
 *
 * FAILS CLOSED AT EVERY STEP. An account that exists is not an account that
 * works; onboarding submitted is not onboarding accepted; and a readiness
 * question that has never been asked is not a yes. The cost of a false
 * negative is a contractor waiting. The cost of a false positive is a
 * homeowner committing to a deposit their contractor cannot take — after the
 * commitment and before anything is recoverable.
 */
export function connectReadiness(facts: ConnectFacts): Readiness {
  if (!facts.stripeAccountId) {
    return { ready: false, reason: "no Stripe account is connected" };
  }
  if (facts.stripeReadinessCheckedAt === null) {
    return { ready: false, reason: "readiness has never been checked with Stripe" };
  }
  if (!facts.stripeMerchantConfigured) {
    return { ready: false, reason: "the account has no merchant configuration" };
  }
  if (facts.stripeOnboardingBlocked) {
    return { ready: false, reason: "Stripe is still waiting on onboarding requirements" };
  }
  if (facts.stripeCardPaymentsStatus !== "active") {
    return {
      ready: false,
      reason:
        `the card_payments capability is ` +
        `${facts.stripeCardPaymentsStatus ?? "unknown"}, not active`,
    };
  }
  return { ready: true, reason: "merchant configured and card payments active" };
}

/**
 * The v2 account shape this code depends on.
 *
 * Declared here because the installed SDK ships the v2 methods without strict
 * parameter or response types. A cast that hides a wrong shape is dangerous;
 * this one names exactly what is read, so a change in Stripe's response breaks
 * against something written down rather than against `any`.
 */
export type V2Account = {
  id: string;
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: { status?: string };
      };
    };
  };
  requirements?: {
    /** Entries Stripe is still waiting on. Presence blocks charging. */
    entries?: unknown[];
  };
};

/**
 * The platform's Stripe client.
 *
 * Constructed lazily and returns null without a key, rather than throwing at
 * import time — the same reasoning `lib/auth.ts` gives for its mail client: a
 * module that cannot be imported without a credential cannot be typechecked,
 * tested or reasoned about in an environment that does not have one.
 *
 * A null client is not an error state. It is the honest answer in an
 * environment with no Stripe configured, and every caller must treat it as
 * "cannot confirm" rather than "confirmed false".
 */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, { apiVersion: STABLE_API_VERSION as Stripe.LatestApiVersion });
}

/**
 * The STABLE API version, used by everything that touches homeowner money.
 *
 * PaymentIntents, captures, refunds and webhook signature verification all run
 * here. A preview version is a moving target by definition, and the payment
 * path is the last place that belongs.
 */
export const STABLE_API_VERSION = "2025-10-29.clover";

/**
 * The PREVIEW version the v2 Connect account lifecycle requires.
 *
 * Stripe's v2 account methods are not reachable on the stable version — the
 * sandbox answers "The API method cannot be found ... explicitly specify a
 * .preview Stripe-Version". So the account lifecycle is pinned here.
 */
export const CONNECT_LIFECYCLE_API_VERSION = "2026-02-25.preview";

/**
 * A SECOND client, for the Connect account lifecycle only.
 *
 * Creating an account, generating an onboarding link, and reading back
 * readiness — nothing else. It exists as its own function rather than as an
 * option passed at each call site because the boundary is the point: a
 * per-call option is something a future call can forget, and forgetting it
 * would either fail loudly (fine) or silently pull the payment path onto a
 * preview API (not fine).
 *
 * WHAT MUST NOT USE THIS. PaymentIntents, captures, refunds, webhook
 * verification. Those stay on the stable version through `stripeClient()`, and
 * scripts/verify-stripe-connect.ts asserts the separation rather than trusting
 * it — the failure mode is a payment flow quietly running on an API Stripe
 * reserves the right to change.
 */
export function connectLifecycleStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: CONNECT_LIFECYCLE_API_VERSION as Stripe.LatestApiVersion,
  });
}

/** The v2 merchant capability status, or null if there is no merchant config. */
export function cardPaymentsStatus(account: V2Account): string | null {
  return account.configuration?.merchant?.capabilities?.card_payments?.status ?? null;
}

/**
 * Turn a v2 account into the facts worth storing.
 *
 * Three facts because they fail independently, and an operator asking "why is
 * this contractor not ready" deserves a specific answer rather than a boolean.
 */
export function factsFromAccount(account: V2Account, checkedAt: Date) {
  return {
    stripeMerchantConfigured: Boolean(account.configuration?.merchant),
    stripeCardPaymentsStatus: cardPaymentsStatus(account),
    // Any outstanding requirement blocks. Fails closed on an unexpected shape:
    // if `entries` is missing we treat it as unblocked ONLY because the
    // capability check above still has to pass, and a pending capability is
    // what an outstanding requirement produces.
    stripeOnboardingBlocked: (account.requirements?.entries?.length ?? 0) > 0,
    stripeReadinessCheckedAt: checkedAt,
  };
}

/**
 * EVERY call touching homeowner money names the connected account explicitly.
 *
 * Not by a default set somewhere, not by convention — at the call site, so a
 * call that forgets fails rather than quietly operating on the platform
 * account. Release #1 makes no such calls; this exists so the first one that
 * does has an obvious place to go, and an obvious shape to copy.
 */
export function connectedAccountContext(stripeAccountId: string): { stripeAccount: string } {
  return { stripeAccount: stripeAccountId };
}
