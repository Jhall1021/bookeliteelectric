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
import {
  connectLifecycleStripe, factsFromAccount, type V2Account,
} from "@/lib/stripeConnect";
import { checkCountry } from "@/lib/contractorIdentity";
import { appOrigin } from "@/lib/origins";

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    // The account lifecycle runs on the pinned preview version. Homeowner
    // money does not come near this client.
    const stripe = connectLifecycleStripe();
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
      select: { id: true, name: true, stripeAccountId: true, countryCode: true },
    });

    // COUNTRY, BEFORE STRIPE IS CALLED.
    //
    // A v2 account refuses configuration.merchant without identity.country, so
    // this could have been a Stripe error. It is checked here instead because
    // "we do not know where this contractor operates" and "Price2Book has not
    // opened in their country" are product answers, and a contractor deserves
    // to be told which one applies rather than shown a validation code.
    //
    // The value comes from the CONTRACTOR ROW, never from a constant here.
    // Writing "US" at this call site would turn the current tenant's location
    // into a platform assumption — the same error as shipping their crew-hours
    // in the template.
    const country = checkCountry(contractor.countryCode);
    if (!country.ok) {
      return NextResponse.json(
        { error: "Payments can't be set up for this account yet.", detail: country.reason },
        { status: 409 }
      );
    }

    let accountId = contractor.stripeAccountId;

    if (!accountId) {
      // A NEW connected account. `controller` asks for direct charges with the
      // connected account as merchant of record and bearer of losses — the
      // arrangement where the contractor, not Price2Book, is who the homeowner
      // transacts with.
      //
      // ACCOUNTS V2. The sandbox requires it, and v1 compatibility is
      // deliberately NOT enabled — running both shapes would mean two
      // definitions of "is this contractor ready" and eventually a
      // disagreement nobody notices until money is involved.
      //
      // THE CONFIGURATION IS THREE ECONOMIC DECISIONS, each stated rather than
      // defaulted, because getting any of them wrong costs somebody real
      // money.
      //
      //   fees_collector: "stripe"
      //     Stripe collects its processing fees DIRECTLY FROM THE CONTRACTOR.
      //     Price2Book does not pay them. The v1 attempt at this said
      //     fees.payer = "application", which would have billed Price2Book for
      //     card processing on every homeowner transaction in the country —
      //     found only because Stripe rejected it for an unrelated reason.
      //
      //   losses_collector: "stripe"
      //     Stripe carries an unrecoverable negative balance, not Price2Book.
      //     NOTE THE PRECISE MEANING: the charge still belongs to the
      //     contractor, and a refund or chargeback reduces THEIR connected
      //     balance. This says only that if that balance cannot cover it,
      //     the liability does not land on the platform.
      //
      //   dashboard: "full"
      //     A real Stripe account the contractor logs into, sees payouts in,
      //     and could take elsewhere. This is their payment system.
      //
      // DIRECT CHARGES ARE UNCHANGED. No destination charges, no
      // on_behalf_of, no transfer_data, no application fee.
      //
      // Cast because the installed SDK ships the v2 methods without parameter
      // types. The shape below is Stripe's documented v2 merchant
      // configuration, written out in full rather than spread from a helper so
      // that what is being sent is readable at the call site.
      const account = (await (stripe as unknown as {
        v2: { core: { accounts: { create(p: unknown): Promise<V2Account> } } };
      }).v2.core.accounts.create({
        include: ["configuration.merchant", "requirements"],
        // Required before configuration.merchant is accepted, and taken from
        // the contractor rather than assumed.
        identity: { country: country.countryCode },
        configuration: {
          merchant: {
            capabilities: { card_payments: { requested: true } },
          },
        },
        dashboard: "full",
        defaults: {
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "stripe",
          },
        },
        metadata: {
          // Correlation only. NEVER read back as tenancy authority — the
          // account id establishes whose account this is, and metadata is
          // influenceable in a way an account id is not.
          price2book_contractor_id: contractor.id,
        },
      })) as V2Account;

      accountId = account.id;

      await db.contractor.update({
        where: { id: contractor.id },
        data: { stripeAccountId: accountId, ...factsFromAccount(account, new Date()) },
      });
    }

    const origin = appOrigin();
    // V2 ACCOUNT LINK, targeting the merchant configuration — the thing the
    // contractor is actually onboarding for. A link that did not name it would
    // collect details for an account that still could not take a card.
    const link = (await (stripe as unknown as {
      v2: { core: { accountLinks: { create(p: unknown): Promise<{ url: string }> } } };
    }).v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant"],
          refresh_url: `${origin}/admin/payments?stripe=refresh`,
          return_url: `${origin}/admin/payments?stripe=return`,
        },
      },
    })) as { url: string };

    return NextResponse.json({ onboardingUrl: link.url, stripeAccountId: accountId });
  });
}
