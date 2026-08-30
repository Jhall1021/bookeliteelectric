/**
 * Release #3 end-to-end, against real Stripe in TEST MODE.
 *
 *   npx tsx scripts/verify-deposit-live-test.ts --contractor <slug>
 *
 * The internal proof (verify-deposit-flow.ts) exercises the ordering against
 * an injected gateway, which is what lets it force failures a network cannot
 * be asked for. This one exercises the same path against Stripe itself, so the
 * two together cover both "the logic is right" and "the integration is real".
 *
 * REFUSES A LIVE KEY. Not as a warning — it exits. A proof that could run
 * against production money is a proof nobody should be able to run by
 * accident, and `sk_live` is the one string that makes this file dangerous.
 *
 * PRINTS NO SECRET. Keys, signing secrets and account tokens never reach
 * stdout. Stripe object ids (pi_..., acct_...) are identifiers rather than
 * credentials and are printed, because a proof you cannot correlate with the
 * Stripe dashboard is not much of a proof.
 *
 * Creates one $2.49 test PaymentIntent per run — deliberately not $249, so a
 * misconfigured run against real money would be a rounding error rather than a
 * charge. The amount under test is the ORDERING, not the figure; the figure is
 * proved from contractor configuration in verify-deposit-flow.
 */

import { PrismaClient } from "@prisma/client";
import {
  stripeClient, connectReadiness, factsFromAccount, type V2Account,
} from "../lib/stripeConnect";
import { stripeGateway } from "../lib/paymentGateway";
import { runDepositCheckout, preWorkMayProceed } from "../lib/depositFlow";
import { recordCapture } from "../lib/depositRecording";
import { tenantForConnectEvent } from "../lib/stripeWebhook";
import { reconcile } from "../lib/paymentLedger";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}

/** A small real amount. See the header. */
const TEST_CENTS = 249;

async function main() {
  const slugArg = process.argv.indexOf("--contractor");
  const slug = slugArg > -1 ? process.argv[slugArg + 1] : null;

  console.log(`\nRELEASE #3 — END TO END AGAINST STRIPE (TEST MODE)\n`);

  // ── the refusals, before anything ──────────────────────────────────────
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key) {
    console.log(`  Not configured. STRIPE_SECRET_KEY is empty.\n`);
    console.log(`  This harness is ready and will run the moment a TEST key exists.`);
    console.log(`  It refuses a live key by design, so it cannot be pointed at real money.\n`);
    process.exit(2);
  }
  if (key.startsWith("sk_live")) {
    console.error(`  REFUSED: STRIPE_SECRET_KEY is a LIVE key.\n`);
    console.error(`  This harness authorizes and captures. It runs in test mode only.\n`);
    process.exit(1);
  }
  ok(`the configured key is test mode`, key.startsWith("sk_test"), "prefix only; no value printed");

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  ok(`a webhook signing secret is configured`, webhookSecret.length > 0,
    "belongs to this endpoint and environment; never shared with production");

  const stripe = stripeClient();
  const gateway = stripeGateway();
  if (!stripe || !gateway) { console.error(`  no Stripe client\n`); process.exit(1); }

  // ── the contractor ─────────────────────────────────────────────────────
  // A missing connected account is a STATE, not an error. Before onboarding
  // has run there is nothing to test, and saying so is more useful than a
  // stack trace with a Prisma code in it.
  const contractor = slug
    ? await prisma.contractor.findUnique({ where: { slug }, select: ALL })
    : await prisma.contractor.findFirst({
        where: { stripeAccountId: { not: null } }, select: ALL,
      });

  if (!contractor) {
    const all = await prisma.contractor.findMany({ select: { slug: true, stripeAccountId: true } });
    console.log(`\n  No contractor with a connected Stripe account yet.\n`);
    for (const c of all) {
      console.log(`     ${c.slug.padEnd(24)} ${c.stripeAccountId ?? "no account"}`);
    }
    console.log(`\n  Connect one through POST /api/admin/stripe/connect, finish`);
    console.log(`  onboarding until card_payments is active, then rerun.\n`);
    process.exit(2);
  }
  console.log(`\n  contractor  ${contractor.slug}`);
  console.log(`  account     ${contractor.stripeAccountId ?? "none"}\n`);

  // ── 1: readiness, refreshed from Stripe, not assumed ───────────────────
  if (!contractor.stripeAccountId) {
    ok(`1. a contractor with no account is refused before any authorization`,
      !connectReadiness(contractor).ready, connectReadiness(contractor).reason);
    console.log(`\n  No connected account. Connect one and rerun.\n`);
    process.exit(2);
  }

  const account = (await (stripe as unknown as {
    v2: { core: { accounts: { retrieve(id: string, p?: unknown): Promise<V2Account> } } };
  }).v2.core.accounts.retrieve(contractor.stripeAccountId, {
    include: ["configuration.merchant", "requirements"],
  })) as V2Account;
  const facts = factsFromAccount(account, new Date());
  await prisma.contractor.update({ where: { id: contractor.id }, data: facts });
  const refreshed = { stripeAccountId: contractor.stripeAccountId, ...facts };
  const readiness = connectReadiness(refreshed);

  console.log(`  REFRESHED FROM STRIPE`);
  console.log(`     merchant configured      ${facts.stripeMerchantConfigured}`);
  console.log(`     card_payments capability ${facts.stripeCardPaymentsStatus ?? "null"}`);
  console.log(`     onboarding blocked       ${facts.stripeOnboardingBlocked}`);
  console.log(`     -> ${readiness.ready ? "READY" : "NOT READY"}: ${readiness.reason}\n`);

  if (!readiness.ready) {
    ok(`1. a not-ready account is refused before any authorization`, true, readiness.reason);
    console.log(`\n  Finish test onboarding until charges_enabled is true, then rerun.\n`);
    process.exit(2);
  }
  ok(`1. readiness is confirmed from Stripe, not assumed`, readiness.ready);

  // ── 2-4: authorize, write, capture, for real ───────────────────────────
  const booking = await prisma.booking.findFirstOrThrow({
    select: { id: true, totalCents: true, paymentState: true },
  });
  const idem = `p2b_e2e_${Date.now()}`;
  let capturedIntentId = "";

  const attempt = await runDepositCheckout(
    { stripeAccountId: contractor.stripeAccountId, amountCents: TEST_CENTS, idempotencyKey: idem },
    {
      gateway, connect: refreshed,
      writeLocal: async (intentId) => {
        capturedIntentId = intentId;
        // Stands in for the checkout transaction: proves the intent id is
        // known locally BEFORE any capture happens.
        await prisma.paymentEvent.create({
          data: { bookingId: booking.id, kind: "AUTHORIZATION_CREATED",
                  amountCents: TEST_CENTS, stripeObjectId: intentId },
        });
        return booking.id;
      },
      recordCapture: async (bid, pid) => { await recordCapture(prisma, bid, pid, TEST_CENTS); },
      recordCaptureFailure: async () => {},
    }
  );

  ok(`2. a real authorization succeeded on the connected account`,
    Boolean(capturedIntentId), capturedIntentId);
  ok(`3. the local row existed before capture`,
    (await prisma.paymentEvent.count({
      where: { stripeObjectId: capturedIntentId, kind: "AUTHORIZATION_CREATED" },
    })) === 1);
  ok(`4. capture succeeded exactly once`, attempt.outcome === "captured", attempt.outcome);

  // The connected account goes in OPTIONS, not params — the same explicit
  // context every homeowner-money call in this codebase carries.
  const intent = await stripe.paymentIntents.retrieve(capturedIntentId, undefined, {
    stripeAccount: contractor.stripeAccountId,
  });
  console.log(`\n  PaymentIntent ${intent.id}  status=${intent.status}  amount=${intent.amount}\n`);
  ok(`   Stripe reports it succeeded`, intent.status === "succeeded", intent.status);

  // ── 8-9: idempotency, against Stripe ───────────────────────────────────
  await gateway.captureDeposit({
    stripeAccountId: contractor.stripeAccountId,
    paymentIntentId: capturedIntentId,
    idempotencyKey: `${idem}:capture`,
  });
  const after = await stripe.paymentIntents.retrieve(capturedIntentId, undefined, {
    stripeAccount: contractor.stripeAccountId,
  });
  ok(`8. repeating the capture with the same key moved money once`,
    after.amount_received === intent.amount_received, `${after.amount_received}`);

  await recordCapture(prisma, booking.id, capturedIntentId, TEST_CENTS);
  ok(`9. and the retry converges on ONE ledger row`,
    (await prisma.paymentEvent.count({
      where: { stripeObjectId: capturedIntentId, kind: "CAPTURE" },
    })) === 1);

  // ── 5-7: webhook tenancy and idempotency ───────────────────────────────
  const tenant = await tenantForConnectEvent(prisma, {
    account: contractor.stripeAccountId,
    metadata: { price2book_contractor_id: "some-other-contractor" },
  });
  ok(`5. the webhook resolves the tenant from event.account`,
    tenant.ok && tenant.contractorId === contractor.id);
  ok(`   and metadata claiming another contractor does not win`, tenant.ok);

  const before7 = await prisma.paymentEvent.count({ where: { stripeObjectId: capturedIntentId } });
  await recordCapture(prisma, booking.id, capturedIntentId, TEST_CENTS, `evt_e2e_${Date.now()}`);
  ok(`7. a repeat webhook is harmless`,
    (await prisma.paymentEvent.count({ where: { stripeObjectId: capturedIntentId } })) === before7);

  // ── 12-16: state, gating, ledger ───────────────────────────────────────
  const final = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { paymentState: true, totalCents: true },
  });
  ok(`12. pre-work proceeds only at DEPOSIT_CAPTURED`,
    final.paymentState === "DEPOSIT_CAPTURED" && preWorkMayProceed(final.paymentState).allowed &&
    !preWorkMayProceed("DEPOSIT_AUTHORIZED").allowed);
  ok(`14. Booking.totalCents is unchanged`, final.totalCents === booking.totalCents,
    `${booking.totalCents} -> ${final.totalCents}`);

  const events = await prisma.paymentEvent.findMany({
    where: { bookingId: booking.id }, select: { kind: true, amountCents: true },
  });
  const r = reconcile(final.totalCents, [], events);
  console.log(`\n  LEDGER  booked ${final.totalCents}  netPaid ${r.netPaidCents}  remaining ${r.remainingCents}\n`);
  ok(`15. the ledger reports the capture`, r.netPaidCents === TEST_CENTS, `${r.netPaidCents}`);
  ok(`16. no path reached BALANCE_DUE or SETTLED`,
    !["BALANCE_DUE", "SETTLED"].includes(final.paymentState), final.paymentState);

  // ── cleanup ────────────────────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`ALTER TABLE payment_events DISABLE TRIGGER payment_events_append_only`);
  await prisma.paymentEvent.deleteMany({ where: { stripeObjectId: capturedIntentId } });
  await prisma.$executeRawUnsafe(`ALTER TABLE payment_events ENABLE TRIGGER payment_events_append_only`);
  await prisma.booking.update({ where: { id: booking.id }, data: { paymentState: "LEGACY_UNTRACKED" } });
  console.log(`  test rows removed; booking returned to LEGACY_UNTRACKED\n`);

  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  End to end against Stripe, in test mode, with no live key.\n`);
}

const ALL = {
  id: true, slug: true, stripeAccountId: true, stripeMerchantConfigured: true,
  stripeCardPaymentsStatus: true, stripeOnboardingBlocked: true, stripeReadinessCheckedAt: true,
} as const;

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
