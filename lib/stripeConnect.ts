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
  stripeDetailsSubmitted: boolean;
  stripeChargesEnabled: boolean;
  stripeCardPaymentsStatus: string | null;
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
  if (!facts.stripeDetailsSubmitted) {
    return { ready: false, reason: "Stripe onboarding is not complete" };
  }
  if (!facts.stripeChargesEnabled) {
    return { ready: false, reason: "Stripe has not enabled charges on this account" };
  }
  if (facts.stripeCardPaymentsStatus !== "active") {
    return {
      ready: false,
      reason:
        `the card_payments capability is ` +
        `${facts.stripeCardPaymentsStatus ?? "unknown"}, not active`,
    };
  }
  return { ready: true, reason: "onboarding complete and card payments active" };
}

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
  return new Stripe(key, { apiVersion: "2025-10-29.clover" as Stripe.LatestApiVersion });
}

/** Read the capability status Stripe reports for card payments. */
export function cardPaymentsStatus(account: Stripe.Account): string | null {
  return account.capabilities?.card_payments ?? null;
}

/**
 * Turn a Stripe account into the facts worth storing.
 *
 * `charges_enabled` and `details_submitted` are Stripe's own summary of
 * whether the account works; the capability is the specific permission a
 * direct card charge needs. All three are stored because they fail
 * independently, and an operator asking "why is this contractor not ready"
 * deserves a specific answer.
 */
export function factsFromAccount(account: Stripe.Account, checkedAt: Date) {
  return {
    stripeDetailsSubmitted: account.details_submitted ?? false,
    stripeChargesEnabled: account.charges_enabled ?? false,
    stripeCardPaymentsStatus: cardPaymentsStatus(account),
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
