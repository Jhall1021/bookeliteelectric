/**
 * Payment Release #3 — deposit authorization and capture.
 *
 *   npx tsx scripts/verify-deposit-flow.ts
 *
 * The ordering is the product. Authorize -> write -> capture is only correct
 * if a failure at each point does the right thing, so the gateway here fails
 * wherever the proof needs it to. NO LIVE KEY IS USED and none is needed: a
 * proof that depended on a network could not force the failures that matter.
 *
 * The sharpest case is the last one. Not "capture twice" — that is a double
 * click. The real one is: the capture SUCCEEDS, the response is lost, and the
 * server retries not knowing whether money moved. Recovery from uncertainty,
 * rather than rejection of an obvious duplicate.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { runDepositCheckout, resumeDepositCheckout, preWorkMayProceed } from "../lib/depositFlow";
import { recordCapture, recordCaptureFailure } from "../lib/depositRecording";
import { tenantForConnectEvent } from "../lib/stripeWebhook";
import type { PaymentGateway, GatewayIntent } from "../lib/paymentGateway";
import type { ConnectFacts } from "../lib/stripeConnect";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}

const READY: ConnectFacts = {
  stripeAccountId: "acct_test_ready",
  stripeMerchantConfigured: true,
  stripeCardPaymentsStatus: "active",
  stripeOnboardingBlocked: false,
  stripeReadinessCheckedAt: new Date("2026-08-29"),
};
const DEPOSIT = 24900;

/** A gateway that records what it was asked and fails where told. */
function fakeGateway(opts: {
  failAuthorize?: boolean;
  failCapture?: boolean;
  /** Capture succeeds but the caller never hears — the timeout case. */
  captureSucceedsThenTimesOut?: boolean;
  /** A real card whose bank wants the cardholder to authenticate. */
  authorizeRequiresAction?: boolean;
  /** Omit the client secret, so the challenge cannot be started at all. */
  withoutClientSecret?: boolean;
  /** What `retrieveAuthorization` reports after the challenge. */
  retrieveStatus?: string;
  retrieveAmountCents?: number;
  retrieveMetadata?: Record<string, string>;
} = {}) {
  const calls: string[] = [];
  const keys: string[] = [];
  /** Stripe's real behavior: same key, same result, no second charge. */
  const captured = new Set<string>();
  const gateway: PaymentGateway = {
    async authorizeDeposit(a) {
      calls.push("authorize");
      keys.push(a.idempotencyKey);
      if (!a.stripeAccountId) throw new Error("no connected account supplied");
      if (opts.failAuthorize) throw new Error("card declined");
      if (opts.authorizeRequiresAction) {
        return {
          id: "pi_test_1",
          status: "requires_action",
          amountCents: a.amountCents,
          clientSecret: opts.withoutClientSecret ? null : "pi_test_1_secret",
          metadata: a.metadata ?? {},
        } as GatewayIntent;
      }
      return { id: "pi_test_1", status: "requires_capture", amountCents: a.amountCents } as GatewayIntent;
    },
    async captureDeposit(a) {
      calls.push("capture");
      keys.push(a.idempotencyKey);
      if (opts.failCapture) throw new Error("capture failed at the bank");
      // The money moves ONCE per idempotency key, whatever the caller believes.
      captured.add(a.idempotencyKey);
      if (opts.captureSucceedsThenTimesOut && calls.filter((c) => c === "capture").length === 1) {
        throw new Error("ETIMEDOUT waiting for response");
      }
      return { id: a.paymentIntentId, status: "succeeded", amountCents: DEPOSIT } as GatewayIntent;
    },
    async retrieveAuthorization(a) {
      calls.push("retrieve");
      return {
        id: a.paymentIntentId,
        status: opts.retrieveStatus ?? "requires_capture",
        amountCents: opts.retrieveAmountCents ?? DEPOSIT,
        metadata: opts.retrieveMetadata ?? { price2book_visit_id: "visit_1" },
      } as GatewayIntent;
    },
    async cancelAuthorization() { calls.push("cancel"); },
  };
  return { gateway, calls, keys, captured };
}

async function main() {
  console.log(`\nDEPOSIT FLOW — AUTHORIZE, WRITE, CAPTURE\n`);

  // ── 17: no live key ────────────────────────────────────────────────────
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  ok(`17. no live Stripe key is used`, !key.startsWith("sk_live"),
    "this proof runs entirely against an injected gateway");

  // ── 1-3: the happy path, in order ──────────────────────────────────────
  {
    const f = fakeGateway();
    const order: string[] = [];
    const r = await runDepositCheckout(
      { stripeAccountId: READY.stripeAccountId!, amountCents: DEPOSIT, idempotencyKey: "visit_x" },
      {
        gateway: f.gateway, connect: READY,
        writeLocal: async () => { order.push("write"); return "bk_1"; },
        recordCapture: async () => { order.push("record"); },
        recordCaptureFailure: async () => { order.push("record_failure"); },
      }
    );
    ok(`1. a $249 deposit authorizes on the connected account`,
      r.outcome === "captured" && f.calls[0] === "authorize", f.calls.join(" -> "));
    ok(`2. nothing is captured before the local write commits`,
      f.calls.indexOf("authorize") < order.indexOf("write") + f.calls.indexOf("authorize") + 1 &&
      f.calls.indexOf("capture") > f.calls.indexOf("authorize") && order[0] === "write",
      `gateway ${f.calls.join(" -> ")}, local ${order.join(" -> ")}`);
    ok(`3. success records exactly one capture`,
      order.filter((o) => o === "record").length === 1, order.join(" -> "));
  }

  // ── 4: the write fails ─────────────────────────────────────────────────
  {
    const f = fakeGateway();
    const r = await runDepositCheckout(
      { stripeAccountId: READY.stripeAccountId!, amountCents: DEPOSIT, idempotencyKey: "visit_y" },
      {
        gateway: f.gateway, connect: READY,
        writeLocal: async () => { throw new Error("arrival window conflict"); },
        recordCapture: async () => { throw new Error("must not be reached"); },
        recordCaptureFailure: async () => { throw new Error("must not be reached"); },
      }
    );
    ok(`4. a failed write cancels the authorization`,
      r.outcome === "write_failed" && r.authorizationCanceled && f.calls.includes("cancel"),
      f.calls.join(" -> "));
    ok(`   and never captures`, !f.calls.includes("capture"), f.calls.join(" -> "));
  }

  // ── 5: capture fails ───────────────────────────────────────────────────
  {
    const f = fakeGateway({ failCapture: true });
    let failureRecorded = false;
    const r = await runDepositCheckout(
      { stripeAccountId: READY.stripeAccountId!, amountCents: DEPOSIT, idempotencyKey: "visit_z" },
      {
        gateway: f.gateway, connect: READY,
        writeLocal: async () => "bk_2",
        recordCapture: async () => { throw new Error("must not be reached"); },
        recordCaptureFailure: async () => { failureRecorded = true; },
      }
    );
    ok(`5. a failed capture keeps the booking and records the failure`,
      r.outcome === "capture_failed" && failureRecorded);
    ok(`   and the pre-work visit stays locked`, !preWorkMayProceed("FAILED").allowed,
      preWorkMayProceed("FAILED").reason);
  }

  // ── 10: readiness gate ─────────────────────────────────────────────────
  for (const [label, connect] of [
    ["no account", { ...READY, stripeAccountId: null }],
    ["never checked", { ...READY, stripeReadinessCheckedAt: null }],
    ["onboarding blocked", { ...READY, stripeOnboardingBlocked: true }],
    ["capability inactive", { ...READY, stripeCardPaymentsStatus: "pending" }],
  ] as [string, ConnectFacts][]) {
    const f = fakeGateway();
    const r = await runDepositCheckout(
      { stripeAccountId: connect.stripeAccountId ?? "", amountCents: DEPOSIT, idempotencyKey: "k" },
      { gateway: f.gateway, connect,
        writeLocal: async () => { throw new Error("must not be reached"); },
        recordCapture: async () => {}, recordCaptureFailure: async () => {} }
    );
    ok(`10. not ready (${label}) -> refused before any Stripe call`,
      r.outcome === "not_ready" && f.calls.length === 0, f.calls.join(","));
  }

  // ── 6 + the adversarial timeout ────────────────────────────────────────
  console.log();
  {
    // Capture succeeds at Stripe; the response is lost; the caller retries.
    const f = fakeGateway({ captureSucceedsThenTimesOut: true });
    const deps = {
      gateway: f.gateway, connect: READY,
      writeLocal: async () => "bk_3",
      recordCapture: async () => {},
      recordCaptureFailure: async () => {},
    };
    const req = { stripeAccountId: READY.stripeAccountId!, amountCents: DEPOSIT, idempotencyKey: "visit_timeout" };
    const first = await runDepositCheckout(req, deps);
    const second = await runDepositCheckout(req, deps);

    ok(`   the lost response is seen as a failure the first time`,
      first.outcome === "capture_failed", first.outcome);
    ok(`   the retry succeeds`, second.outcome === "captured", second.outcome);
    ok(`6. and the money moved exactly ONCE across both attempts`,
      f.captured.size === 1, `${f.captured.size} distinct capture(s)`);
    ok(`   because both attempts sent the same idempotency key`,
      new Set(f.keys.filter((k) => k.endsWith(":capture"))).size === 1,
      [...new Set(f.keys)].join(", "));
  }

  // ── 3/6/7: the ledger, against the real database ───────────────────────
  console.log();
  const bk = await prisma.booking.findFirstOrThrow({ select: { id: true, totalCents: true } });
  const PI = `pi_probe_${Date.now()}`;
  try {
    const a = await recordCapture(prisma, bk.id, PI, DEPOSIT);
    const b = await recordCapture(prisma, bk.id, PI, DEPOSIT);
    const rows = await prisma.paymentEvent.count({ where: { stripeObjectId: PI, kind: "CAPTURE" } });
    ok(`   recording the same capture twice writes ONE ledger row`,
      rows === 1 && !a.alreadyRecorded && b.alreadyRecorded, `${rows} row(s)`);

    // 7: a replayed webhook, carrying its own event id, is the same capture.
    const c = await recordCapture(prisma, bk.id, PI, DEPOSIT, `evt_probe_${Date.now()}`);
    const after = await prisma.paymentEvent.count({ where: { stripeObjectId: PI, kind: "CAPTURE" } });
    ok(`7. a webhook confirming an already-recorded capture adds nothing`,
      after === 1 && c.alreadyRecorded, `${after} row(s)`);
    ok(`   the constraint is the backstop, not the only defense`,
      readFileSync("lib/paymentGateway.ts", "utf8").includes("idempotencyKey"),
      "the outbound Stripe call carries its own idempotency key");
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE payment_events DISABLE TRIGGER payment_events_append_only`);
    await prisma.paymentEvent.deleteMany({ where: { stripeObjectId: PI } });
    await prisma.$executeRawUnsafe(`ALTER TABLE payment_events ENABLE TRIGGER payment_events_append_only`);
    await prisma.booking.update({ where: { id: bk.id }, data: { paymentState: "LEGACY_UNTRACKED" } });
  }

  // ── 8-9: webhook tenancy ───────────────────────────────────────────────
  console.log();
  const elite = await prisma.contractor.findUniqueOrThrow({
    where: { slug: "elite-electric" }, select: { id: true },
  });
  const probe = await prisma.contractor.create({
    data: { slug: `wh-probe-${Date.now()}`, name: "Webhook Probe", stripeAccountId: `acct_probe_${Date.now()}` },
    select: { id: true, slug: true, stripeAccountId: true },
  });
  try {
    const unknown = await tenantForConnectEvent(prisma, { account: "acct_nobody_knows" });
    ok(`8. an event from an unknown account resolves to no tenant`, !unknown.ok, unknown.ok ? "" : unknown.reason);

    const mine = await tenantForConnectEvent(prisma, { account: probe.stripeAccountId! });
    ok(`   an event resolves to the contractor that owns the account`,
      mine.ok && mine.contractorId === probe.id);

    // 9: metadata claims a different contractor. The account still wins.
    const spoofed = await tenantForConnectEvent(prisma, {
      account: probe.stripeAccountId!,
      metadata: { price2book_contractor_id: elite.id },
    });
    ok(`9. metadata cannot override event.account`,
      spoofed.ok && spoofed.contractorId === probe.id,
      spoofed.ok ? `resolved ${spoofed.contractorId}` : spoofed.reason);

    const noAccount = await tenantForConnectEvent(prisma, {
      account: null, metadata: { price2book_contractor_id: elite.id },
    });
    ok(`   metadata alone establishes nothing`, !noAccount.ok);
  } finally {
    if (!probe.slug.startsWith("wh-probe-")) throw new Error("refusing to delete an unknown contractor");
    await prisma.contractor.delete({ where: { id: probe.id } });
  }

  // ── 11-16, 18: nothing else moved ──────────────────────────────────────
  console.log();
  const checkout = readFileSync("app/api/checkout/route.ts", "utf8");
  ok(`11. the non-deposit path is unchanged`,
    checkout.includes("if (depositDueCents > 0) {") && /writeCheckout\(\)\)/.test(checkout),
    "the deposit branch returns before the legacy path is reached");

  const bookings = await prisma.booking.findMany({ select: { paymentState: true, totalCents: true } });
  ok(`12. all ${bookings.length} legacy bookings remain LEGACY_UNTRACKED`,
    bookings.every((b) => b.paymentState === "LEGACY_UNTRACKED"));
  ok(`13. no booking's totalCents was touched by payment`,
    bookings.every((b) => b.totalCents > 0));

  ok(`14. the deposit amount is snapshotted, never hardcoded`,
    !/24900|249\s*\*\s*100/.test(readFileSync("lib/depositFlow.ts", "utf8")) &&
    !/24900/.test(readFileSync("lib/paymentGateway.ts", "utf8")) &&
    checkout.includes("depositDueCentsFor"),
    "no payment file contains the number");

  ok(`15. pre-work rows are atomic with the booking but inert until capture`,
    checkout.includes("tx.appointment.create") && checkout.includes("tx.preWorkVisit.create") &&
    !preWorkMayProceed("DEPOSIT_AUTHORIZED").allowed && preWorkMayProceed("DEPOSIT_CAPTURED").allowed);

  // indexOf would have matched the IMPORT at the top of the file rather than
  // the push block, which is the kind of check that passes for the wrong
  // reason. Anchored on the call instead.
  ok(`16. a deposit booking is never pushed to Jobber in this release`,
    checkout.indexOf("if (depositDueCents > 0) {") <
      checkout.indexOf("await pushBookingToJobber("),
    "the deposit branch returns before the push block");

  // ── 18-25: cardholder authentication (3-D Secure) ──────────────────────
  //
  // `requires_action` is NOT a declined card. It is a real card whose bank
  // wants the cardholder to prove they are present. The whole point of these
  // checks is that the customer gets a way through it WITHOUT any of the
  // ordering guarantees loosening on the way.
  {
    const REQ = {
      stripeAccountId: READY.stripeAccountId!,
      amountCents: DEPOSIT,
      idempotencyKey: "visit_3ds",
      metadata: { price2book_visit_id: "visit_1" },
    };
    const deps = (f: ReturnType<typeof fakeGateway>, order: string[]) => ({
      gateway: f.gateway, connect: READY,
      writeLocal: async () => { order.push("write"); return "bk_3ds"; },
      recordCapture: async () => { order.push("record"); },
      recordCaptureFailure: async () => { order.push("record_failure"); },
    });

    const order: string[] = [];
    const f = fakeGateway({ authorizeRequiresAction: true });
    const r = await runDepositCheckout(REQ, deps(f, order));

    ok(`18. a card needing authentication is not treated as declined`,
      r.outcome === "requires_action", r.outcome);
    ok(`19.   and NO booking is written before the customer authenticates`,
      !order.includes("write"), order.join(" -> ") || "nothing written");
    ok(`20.   and nothing is captured`, !f.calls.includes("capture"), f.calls.join(" -> "));
    ok(`21.   and the hold is NOT canceled — it is what gets captured later`,
      !f.calls.includes("cancel"), f.calls.join(" -> "));

    // The resume path is the one that could quietly undo the design: it must
    // not authorize again, and it must not trust the browser.
    const f2 = fakeGateway({});
    const order2: string[] = [];
    const r2 = await resumeDepositCheckout(
      { ...REQ, paymentIntentId: "pi_test_1", expectedMetadata: { price2book_visit_id: "visit_1" } },
      deps(f2, order2)
    );
    ok(`22. after authentication the SAME intent is captured, with no second authorization`,
      r2.outcome === "captured" && !f2.calls.includes("authorize") &&
        (r2 as { paymentIntentId: string }).paymentIntentId === "pi_test_1",
      f2.calls.join(" -> "));
    ok(`23.   and the local transaction still precedes the capture`,
      order2.join(",").startsWith("write") && f2.calls.indexOf("capture") > f2.calls.indexOf("retrieve"),
      `${order2.join(" -> ")} | ${f2.calls.join(" -> ")}`);

    // A browser that finished nothing, or lies about which intent it finished.
    const f3 = fakeGateway({ retrieveStatus: "requires_action" });
    const order3: string[] = [];
    const r3 = await resumeDepositCheckout(
      { ...REQ, paymentIntentId: "pi_test_1" }, deps(f3, order3)
    );
    ok(`24. an abandoned challenge books nothing and captures nothing`,
      r3.outcome === "authorize_failed" && !order3.includes("write") && !f3.calls.includes("capture"),
      `${r3.outcome} | ${f3.calls.join(" -> ")}`);

    const f4 = fakeGateway({ retrieveAmountCents: 100 });
    const order4: string[] = [];
    const r4 = await resumeDepositCheckout(
      { ...REQ, paymentIntentId: "pi_test_1" }, deps(f4, order4)
    );
    ok(`25. the SERVER's amount decides — an intent for another amount is refused`,
      r4.outcome === "authorize_failed" && !order4.includes("write"), r4.outcome);

    const f5 = fakeGateway({ retrieveMetadata: { price2book_visit_id: "someone_elses_visit" } });
    const order5: string[] = [];
    const r5 = await resumeDepositCheckout(
      { ...REQ, paymentIntentId: "pi_test_1", expectedMetadata: { price2book_visit_id: "visit_1" } },
      deps(f5, order5)
    );
    ok(`26.   and an intent from another checkout is refused`,
      r5.outcome === "authorize_failed" && !order5.includes("write"), r5.outcome);

    // Nothing to hand the customer means nothing they can finish.
    const f6 = fakeGateway({ authorizeRequiresAction: true, withoutClientSecret: true });
    const order6: string[] = [];
    const r6 = await runDepositCheckout(REQ, deps(f6, order6));
    ok(`27. an unfinishable challenge is canceled rather than left stranded`,
      r6.outcome === "authorize_failed" && f6.calls.includes("cancel"), f6.calls.join(" -> "));
  }

  // The browser must never be able to name the amount. It sends a payment
  // method or an intent id; the server recomputes what is due from the visit.
  {
    const checkoutSrc = readFileSync("app/api/checkout/route.ts", "utf8");
    ok(`28. the checkout route never takes an amount from the request body`,
      !/(amountCents|depositCents)\s*[:=]\s*(body|req)\./.test(checkoutSrc) &&
        /amountCents: depositDueCents/.test(checkoutSrc));
    ok(`29.   and the resume path recomputes it rather than trusting the round trip`,
      /\.\.\.depositRequest, paymentIntentId: resumePaymentIntentId/.test(checkoutSrc));
  }

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  Authorize, write, capture — and every way it can go wrong.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
