/**
 * Connect a Stripe account, or resume onboarding — Payment Release #1.
 *
 * Creates the contractor's connected account if they have none, then returns a
 * Stripe-hosted onboarding link. Nothing here moves money and nothing here
 * decides readiness; readiness is what Stripe says afterwards.
 *
 * TENANCY. The contractor comes from the admin session through
 * `withAdminRoute`, never from the request body. A route that accepted a
 * contractor id would let a signed-in admin of one contractor create or
 * re-link an account for another.
 */

import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { stripeClient, factsFromAccount } from "@/lib/stripeConnect";
import { appOrigin } from "@/lib/origins";

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    const stripe = stripeClient();
    if (!stripe) {
      // No key configured. Says so rather than pretending the contractor is
      // simply not ready — those are different problems with different owners.
      return NextResponse.json(
        { error: "Stripe is not configured on this deployment." },
        { status: 503 }
      );
    }

    const contractor = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: { id: true, name: true, stripeAccountId: true },
    });

    let accountId = contractor.stripeAccountId;

    if (!accountId) {
      // A NEW connected account. `controller` asks for direct charges with the
      // connected account as merchant of record and bearer of losses — the
      // arrangement where the contractor, not Price2Book, is who the homeowner
      // transacts with.
      //
      // THE THREE CONTROLLER PROPERTIES ARE THREE ECONOMIC DECISIONS, and each
      // one is stated rather than defaulted, because getting any of them wrong
      // costs somebody real money.
      //
      //   fees.payer = "account"
      //     THE CONTRACTOR PAYS STRIPE'S PROCESSING FEES. This said
      //     "application" until 29 August, which would have made Price2Book
      //     liable for card-processing fees on every homeowner transaction in
      //     the country — a cost model nobody chose. Stripe rejected it as
      //     incompatible with a full dashboard, which is how it was found; the
      //     400 was a symptom, the fee assignment was the bug.
      //
      //   losses.payments = "stripe"
      //     Disputes and chargebacks sit with the connected account, not with
      //     Price2Book. The homeowner transacted with the contractor, so the
      //     contractor answers for it.
      //
      //   stripe_dashboard.type = "full"
      //     The contractor gets a real Stripe account they can log into, see
      //     their payouts in, and take elsewhere. This is their payment
      //     system; Price2Book facilitates it and does not own it.
      //
      // Together these are what Stripe calls a Standard account. Written as
      // explicit controller properties rather than `type: "standard"` so the
      // three decisions are visible in the code instead of implied by a
      // shorthand — and so a future change to one of them has to be typed on
      // purpose.
      const account = await stripe.accounts.create({
        controller: {
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          stripe_dashboard: { type: "full" },
        },
        metadata: {
          // Correlation only. NEVER read back as tenancy authority — the
          // account id establishes whose account this is, and metadata is
          // influenceable in a way an account id is not.
          price2book_contractor_id: contractor.id,
        },
      });
      accountId = account.id;

      await db.contractor.update({
        where: { id: contractor.id },
        data: { stripeAccountId: accountId, ...factsFromAccount(account, new Date()) },
      });
    }

    const origin = appOrigin();
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/admin/payments?stripe=refresh`,
      return_url: `${origin}/admin/payments?stripe=return`,
    });

    return NextResponse.json({ onboardingUrl: link.url, stripeAccountId: accountId });
  });
}
