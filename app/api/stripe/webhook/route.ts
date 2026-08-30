/**
 * Connected-account events — Payment Release #3.
 *
 * Confirms a deposit capture and advances the booking to DEPOSIT_CAPTURED.
 * Nothing here initiates money; it records money Stripe says already moved.
 *
 * ORDER OF OPERATIONS, AND IT MATTERS:
 *
 *   verify signature -> resolve tenant from event.account -> find the booking
 *   WITHIN that tenant -> record idempotently
 *
 * The tenant is resolved before any tenant data is read. An event for one
 * contractor cannot reach another's booking because the lookup is scoped by
 * the contractor the ACCOUNT resolved to, not by an id carried in the payload.
 *
 * ARRIVING EARLY IS NORMAL. Stripe can confirm a capture before the local
 * transaction commits. An event whose PaymentIntent matches no booking is
 * logged and answered 200-with-nothing-done, and Stripe redelivers. Inventing
 * a booking from a payment would be creating an obligation nobody agreed to.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripeConnect";
import { tenantForConnectEvent } from "@/lib/stripeWebhook";
import { recordCapture } from "@/lib/depositRecording";

export async function POST(req: Request) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Unsigned." }, { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    // An unverifiable event is not an event. Never processed, never logged as
    // if it were real.
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  const object = event.data.object as { id?: string; amount_received?: number; metadata?: Record<string, string> };

  // ── tenancy, before any tenant data ────────────────────────────────────
  const tenant = await tenantForConnectEvent(prisma, {
    account: (event as { account?: string }).account,
    metadata: object.metadata,
  });
  if (!tenant.ok) {
    console.warn(`[stripe] ${event.type} ${event.id}: ${tenant.reason}`);
    // 200: there is nothing for Stripe to retry. Redelivery would find the
    // same unknown account.
    return NextResponse.json({ received: true, handled: false, reason: tenant.reason });
  }

  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true, handled: false, reason: `unhandled ${event.type}` });
  }

  const intentId = object.id;
  if (!intentId) {
    return NextResponse.json({ received: true, handled: false, reason: "no payment intent id" });
  }

  // Scoped to the contractor the ACCOUNT resolved to. Booking derives its
  // owner through Visit, which is the chain the tenant guard classifies.
  const authorization = await prisma.paymentEvent.findFirst({
    where: {
      kind: "AUTHORIZATION_CREATED",
      stripeObjectId: intentId,
      booking: { visit: { contractorId: tenant.contractorId } },
    },
    select: { bookingId: true, amountCents: true },
  });

  if (!authorization) {
    // The local transaction has probably not committed yet. Stripe will
    // redeliver, and by then it will have.
    console.warn(
      `[stripe] ${event.id}: no authorization for ${intentId} under ${tenant.contractorId} yet — ` +
        `awaiting redelivery`
    );
    return NextResponse.json({ received: true, handled: false, reason: "no local booking yet" });
  }

  const { alreadyRecorded } = await recordCapture(
    prisma,
    authorization.bookingId,
    intentId,
    object.amount_received ?? authorization.amountCents,
    event.id
  );

  return NextResponse.json({ received: true, handled: true, alreadyRecorded });
}
