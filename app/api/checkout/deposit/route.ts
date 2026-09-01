/**
 * What this visit owes before booking — the browser's half of the deposit.
 *
 * The customer-facing bridge for Release #4. The deposit path existed on the
 * server (authorize -> commit -> capture) but nothing ever collected a card,
 * so a deposit-bearing service would have been published as unbookable: the
 * authorization would come back `requires_payment_method` and refuse.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not create a PaymentIntent. The intent is created inside the
 * checkout transaction's ordering (`runDepositCheckout`), where the cancel and
 * capture paths live. A second place that creates intents is a second place
 * that can leave a hold behind.
 *
 * ON THE PUBLISHABLE KEY
 *
 * It is returned to the browser on purpose — that is what a publishable key is
 * for, and Stripe.js cannot mount without it. The SECRET key never leaves the
 * server. The two are separate environment variables so that stays true by
 * construction rather than by care.
 *
 * ON `stripeAccountId`
 *
 * These are DIRECT charges: the contractor is the merchant of record, so the
 * PaymentMethod must be created on the connected account, which means the
 * browser has to know which account. It is a public identifier of the business
 * the customer is already buying from.
 */

import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { findOpenVisit } from "@/lib/openVisit";
import { applySalesTax } from "@/lib/salesTax";
import { decideDeposit } from "@/lib/depositPolicy";
import { connectReadiness } from "@/lib/stripeConnect";

export async function GET(req: Request) {
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  return withSite(site, async (db) => {
    const sessionId = getOrCreateSessionId();
    const visit = await findOpenVisit(db, site.contractorId, sessionId);
    if (!visit) return NextResponse.json({ depositDueCents: 0 });

    const lineItems = await db.lineItem.findMany({
      where: { visitId: visit.id },
      select: {
        computedPriceCents: true,
        estimatedMinutes: true,
        service: { select: { slug: true, depositRule: true, depositCreditsToJob: true } },
      },
    });

    const contractor = await db.contractor.findUniqueOrThrow({
      where: { id: site.contractorId },
      select: {
        stripeAccountId: true, stripeMerchantConfigured: true,
        stripeCardPaymentsStatus: true, stripeOnboardingBlocked: true,
        stripeReadinessCheckedAt: true,
        salesTaxEnabled: true, salesTaxRatePpm: true,
        depositAmountCents: true, depositOnEveryBooking: true,
        depositSubtotalThresholdCents: true, depositDurationThresholdMinutes: true,
      },
    });

    // THE SAME TWO FUNCTIONS CHECKOUT USES. This route exists to tell the
    // customer what is about to happen; if it computed the figure a second
    // way, the number on the screen and the number on the card would
    // eventually disagree, and the customer would be right either time.
    const subtotalCents = lineItems.reduce((sum, li) => sum + (li.computedPriceCents ?? 0), 0);
    const complete = lineItems.every((li) => li.estimatedMinutes !== null);
    const durationMinutes = complete
      ? lineItems.reduce((sum, li) => sum + (li.estimatedMinutes ?? 0), 0)
      : null;

    const tax = applySalesTax(subtotalCents, contractor);
    const deposit = decideDeposit(
      {
        subtotalCents,
        durationMinutes,
        services: lineItems.map((li) => ({
          slug: li.service.slug,
          depositRule: li.service.depositRule,
        })),
      },
      contractor,
      tax.totalWithTaxCents
    );
    const depositDueCents = deposit.amountCents;

    // The whole financial picture, whether or not a deposit is due — the
    // homeowner is owed the total and the tax either way.
    const money = {
      subtotalCents,
      salesTaxRatePpm: tax.ratePpm,
      salesTaxCents: tax.taxCents,
      totalWithTaxCents: tax.totalWithTaxCents,
      depositDueCents,
      remainingCents: tax.totalWithTaxCents - depositDueCents,
    };

    if (depositDueCents === 0) return NextResponse.json({ ...money, depositDueCents: 0 });

    // Asked here so the customer is told BEFORE they type a card number,
    // rather than after they press the button. Same function the checkout
    // transaction uses, so the two cannot drift into disagreeing.
    const readiness = connectReadiness(contractor);
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;

    return NextResponse.json({
      ...money,
      creditsToJob: lineItems.every((li) => li.service.depositCreditsToJob),
      ready: readiness.ready && Boolean(publishableKey),
      stripeAccountId: readiness.ready ? contractor.stripeAccountId : null,
      publishableKey: readiness.ready ? publishableKey : null,
    });
  });
}
