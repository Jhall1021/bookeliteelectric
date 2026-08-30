/**
 * Is this contractor able to accept homeowner payments? — Payment Release #1.
 *
 *   GET   report the stored readiness, without calling Stripe
 *   POST  refresh from Stripe, then report
 *
 * Two verbs because they answer different questions. GET is "what do we know",
 * and is cheap enough for any screen to ask. POST is "ask Stripe again", which
 * is a network call and should happen when somebody returns from onboarding or
 * presses a button — not on every page load.
 */

import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import {
  stripeClient, factsFromAccount, connectReadiness, type V2Account,
} from "@/lib/stripeConnect";

const SELECT = {
  stripeAccountId: true,
  stripeMerchantConfigured: true,
  stripeCardPaymentsStatus: true,
  stripeOnboardingBlocked: true,
  stripeReadinessCheckedAt: true,
} as const;

export async function GET() {
  return withAdminRoute(async (db, ctx) => {
    const facts = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: SELECT,
    });
    return NextResponse.json({ ...facts, ...connectReadiness(facts) });
  });
}

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: SELECT,
    });

    if (!contractor.stripeAccountId) {
      // Nothing to refresh, and that is a complete answer rather than an error.
      return NextResponse.json({ ...contractor, ...connectReadiness(contractor) });
    }

    const stripe = stripeClient();
    if (!stripe) {
      // FAILS CLOSED. Stripe unreachable means readiness is UNCONFIRMED, and
      // unconfirmed is not ready. The stored facts are returned unchanged so
      // an outage cannot silently promote a contractor — or silently demote
      // one, since nothing is written.
      return NextResponse.json(
        {
          ...contractor,
          ready: false,
          reason: "Stripe is not configured on this deployment, so readiness cannot be confirmed",
        },
        { status: 503 }
      );
    }

    let account: V2Account;
    try {
      // V2 RETRIEVAL, asking for the two things readiness is derived from.
      // v1 compatibility is deliberately not enabled, so this is the only
      // shape in play.
      account = (await (stripe as unknown as {
        v2: { core: { accounts: { retrieve(id: string, p?: unknown): Promise<V2Account> } } };
      }).v2.core.accounts.retrieve(contractor.stripeAccountId, {
        include: ["configuration.merchant", "requirements"],
      })) as V2Account;
    } catch (e) {
      console.error(`[stripe] readiness refresh failed for ${contractor.stripeAccountId}:`, e);
      return NextResponse.json(
        {
          ...contractor,
          ready: false,
          reason: "Stripe could not be reached, so readiness cannot be confirmed",
        },
        { status: 503 }
      );
    }

    const facts = factsFromAccount(account, new Date());
    await db.contractor.update({ where: { id: ctx.contractorId }, data: facts });

    const merged = { stripeAccountId: contractor.stripeAccountId, ...facts };
    return NextResponse.json({ ...merged, ...connectReadiness(merged) });
  });
}
