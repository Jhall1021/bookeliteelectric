/**
 * Payment Release #2 — the ledger can represent the future lifecycle, and no
 * booking can enter it.
 *
 *   npx tsx scripts/verify-payment-ledger.ts
 *
 * The reconciliation cases are the heart of it. The formula this replaced was
 * wrong in a way that only shows up once refunds exist, so every case below
 * that involves a refund is there because the obvious model got it wrong.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  reconcile, adjustedAmountDueCents, netPaidCents,
  preWorkProjectConflict, depositDueCentsFor,
  type LedgerEvent, type LedgerAdjustment,
} from "../lib/paymentLedger";
import { DERIVED_TENANT_MODELS } from "../lib/tenantGuard";

const prisma = new PrismaClient();

/** Files whose job is to LIST the money-moving APIs. See the filter below. */
const ENUMERATE_MONEY_TERMS = [
  "scripts/verify-payment-ledger.ts",
  "scripts/verify-stripe-connect.ts",
];

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}
const $ = (c: number) => `$${(c / 100).toFixed(2)}`;

async function main() {
  console.log(`\nPAYMENT LEDGER — DORMANT\n`);

  // ── 1-3: the historical migration told the truth ───────────────────────
  const bookings = await prisma.booking.findMany({
    select: { id: true, paymentState: true, depositDueCents: true, totalCents: true, paymentModel: true },
  });
  ok(`1. all ${bookings.length} historical booking(s) are LEGACY_UNTRACKED`,
    bookings.every((b) => b.paymentState === "LEGACY_UNTRACKED"));
  ok(`2. none is falsely labeled NOT_REQUIRED`,
    bookings.every((b) => b.paymentState !== "NOT_REQUIRED"),
    "each carries a PaymentModel saying card-on-file was intended");
  ok(`   nor claims an evaluated $0 deposit`,
    bookings.every((b) => b.depositDueCents === null),
    "null is 'never evaluated'; 0 would be 'evaluated, none due'");
  ok(`3. every totalCents is a real published amount`,
    bookings.every((b) => b.totalCents > 0), "none zeroed or rewritten");

  // ── 4: reconciliation, seven cases ─────────────────────────────────────
  console.log(`\n  RECONCILIATION\n`);
  const TOTAL = 308500; // a 200A service upgrade

  const cases: { name: string; adj: LedgerAdjustment[]; ev: LedgerEvent[]; due: number; paid: number; rem: number }[] = [
    { name: "untouched booking", adj: [], ev: [], due: TOTAL, paid: 0, rem: TOTAL },
    { name: "deposit authorized (a hold is not money)", adj: [],
      ev: [{ kind: "AUTHORIZATION_CREATED", amountCents: 24900 }], due: TOTAL, paid: 0, rem: TOTAL },
    { name: "deposit captured", adj: [],
      ev: [{ kind: "CAPTURE", amountCents: 24900 }], due: TOTAL, paid: 24900, rem: TOTAL - 24900 },
    { name: "final balance captured", adj: [],
      ev: [{ kind: "CAPTURE", amountCents: 24900 }, { kind: "CAPTURE", amountCents: TOTAL - 24900 }],
      due: TOTAL, paid: TOTAL, rem: 0 },
    { name: "partial refund after full payment", adj: [],
      ev: [{ kind: "CAPTURE", amountCents: TOTAL }, { kind: "REFUND", amountCents: 50000 }],
      due: TOTAL, paid: TOTAL - 50000, rem: 50000 },
    // The case the wrong formula got backwards.
    { name: "cancellation: credit + refund -> nothing owed",
      adj: [{ kind: "CREDIT", amountCents: TOTAL }],
      ev: [{ kind: "CAPTURE", amountCents: 24900 }, { kind: "REFUND", amountCents: 24900 }],
      due: 0, paid: 0, rem: 0 },
    { name: "approved addition after booking",
      adj: [{ kind: "ADDITION", amountCents: 45000 }],
      ev: [{ kind: "CAPTURE", amountCents: 24900 }],
      due: TOTAL + 45000, paid: 24900, rem: TOTAL + 45000 - 24900 },
  ];

  for (const c of cases) {
    const r = reconcile(TOTAL, c.adj, c.ev);
    const good = r.adjustedDueCents === c.due && r.netPaidCents === c.paid && r.remainingCents === c.rem;
    ok(`4. ${c.name}`, good,
      `due ${$(r.adjustedDueCents)} paid ${$(r.netPaidCents)} remaining ${$(r.remainingCents)}`);
  }

  // Full refund with no credit still owes — because a refund alone is not a
  // cancellation. That asymmetry is the point of two ledgers.
  const refundOnly = reconcile(TOTAL, [],
    [{ kind: "CAPTURE", amountCents: TOTAL }, { kind: "REFUND", amountCents: TOTAL }]);
  ok(`   full refund WITHOUT a credit still shows the full amount owed`,
    refundOnly.remainingCents === TOTAL,
    "a refund is cash movement; only an approved credit changes the obligation");

  // ── 5-6: append-only, and idempotent, enforced by the database ─────────
  console.log(`\n  THE LEDGERS DEFEND THEMSELVES\n`);
  const probeBooking = bookings[0];
  const ev = await prisma.paymentEvent.create({
    data: { bookingId: probeBooking.id, kind: "CAPTURE", amountCents: 1,
            stripeEventId: `evt_probe_${Date.now()}`, note: "verifier probe" },
    select: { id: true, stripeEventId: true },
  });
  const adj = await prisma.bookingAdjustment.create({
    data: { bookingId: probeBooking.id, kind: "CREDIT", amountCents: 1, reason: "verifier probe" },
    select: { id: true },
  });
  try {
    let updateBlocked = false;
    try { await prisma.paymentEvent.update({ where: { id: ev.id }, data: { amountCents: 999 } }); }
    catch { updateBlocked = true; }
    ok(`5. a payment event cannot be updated`, updateBlocked,
      "a ledger whose rows can be edited into agreement is a cache with extra steps");

    let adjBlocked = false;
    try { await prisma.bookingAdjustment.update({ where: { id: adj.id }, data: { amountCents: 999 } }); }
    catch { adjBlocked = true; }
    ok(`   nor can an adjustment`, adjBlocked);

    let deleteBlocked = false;
    try { await prisma.paymentEvent.delete({ where: { id: ev.id } }); }
    catch { deleteBlocked = true; }
    ok(`   nor deleted`, deleteBlocked, "a correction is a new row");

    let dupBlocked = false;
    try {
      await prisma.paymentEvent.create({
        data: { bookingId: probeBooking.id, kind: "CAPTURE", amountCents: 1,
                stripeEventId: ev.stripeEventId, note: "replay probe" },
      });
    } catch { dupBlocked = true; }
    ok(`6. a duplicate Stripe event id is rejected structurally`, dupBlocked,
      "a replayed webhook must fail on insert, not add a second capture");
  } finally {
    // The trigger blocks deletes, so the probe rows are removed by dropping
    // the trigger for exactly the length of the cleanup and restoring it.
    await prisma.$executeRawUnsafe(`ALTER TABLE payment_events DISABLE TRIGGER payment_events_append_only`);
    await prisma.$executeRawUnsafe(`ALTER TABLE booking_adjustments DISABLE TRIGGER booking_adjustments_append_only`);
    await prisma.paymentEvent.deleteMany({ where: { note: { contains: "probe" } } });
    await prisma.bookingAdjustment.deleteMany({ where: { reason: { contains: "verifier probe" } } });
    await prisma.$executeRawUnsafe(`ALTER TABLE payment_events ENABLE TRIGGER payment_events_append_only`);
    await prisma.$executeRawUnsafe(`ALTER TABLE booking_adjustments ENABLE TRIGGER booking_adjustments_append_only`);
  }

  // ── 7: tenancy ─────────────────────────────────────────────────────────
  console.log();
  for (const m of ["PaymentEvent", "BookingAdjustment"]) {
    const path = DERIVED_TENANT_MODELS.get(m);
    ok(`7. ${m} is tenant-rooted through ${path?.join(" -> ") ?? "NOTHING"}`,
      JSON.stringify(path) === JSON.stringify(["booking", "visit"]),
      "an unclassified financial model would let one contractor read another's payments");
  }

  // ── 8: one pre-work project per booking ────────────────────────────────
  console.log();
  const two = preWorkProjectConflict([
    { slug: "200a-service-upgrade", requiresPreWorkVisit: true },
    { slug: "electrical-panel-replacement", requiresPreWorkVisit: true },
  ]);
  ok(`8. two pre-work projects in one booking are rejected`, two.conflict, two.slugs.join(", "));
  ok(`   one pre-work project plus normal services is allowed`,
    !preWorkProjectConflict([
      { slug: "200a-service-upgrade", requiresPreWorkVisit: true },
      { slug: "replace-standard-outlet", requiresPreWorkVisit: false },
    ]).conflict);
  ok(`   the checkout route enforces it`,
    readFileSync("app/api/checkout/route.ts", "utf8").includes("preWorkProjectConflict"));

  // The deposit snapshot: evaluated-zero is not never-evaluated.
  ok(`   a visit with no deposit service evaluates to 0, not null`,
    depositDueCentsFor([{ depositCents: null }, { depositCents: null }]) === 0);

  // ── 9-13: nothing else moved ───────────────────────────────────────────
  console.log();
  const c = await prisma.contractor.findUniqueOrThrow({
    where: { slug: "elite-electric" }, select: { id: true },
  });
  // RETIRED, 31 August: "both pre-work services remain unpublished". They are
  // published now, deliberately, through the pricing lifecycle — so that check
  // had become an assertion that the release had not happened. What has to
  // stay true is that a service asking a homeowner for a deposit is COHERENT:
  // a real price somebody approved, a real deposit, and a visit whose length
  // is known before anyone is asked to pay for it.
  const preWork = await prisma.service.findMany({
    where: { contractorId: c.id, requiresPreWorkVisit: true },
    select: {
      slug: true, basePrice: true, publishedPriceApprovedAt: true,
      depositCents: true, preWorkVisitMinutes: true, whileWeThereBasePrice: true,
    },
  });
  const incoherent = preWork.filter(
    (s) =>
      s.basePrice === null ||
      s.publishedPriceApprovedAt === null ||
      (s.depositCents ?? 0) <= 0 ||
      s.preWorkVisitMinutes === null
  );
  ok(`11. every pre-work service has an approved price, a deposit and a visit length`,
    incoherent.length === 0,
    incoherent.map((s) => s.slug).join(", "));
  ok(`    and none of them carries a While We're There price`,
    preWork.every((s) => s.whileWeThereBasePrice === null),
    preWork.filter((s) => s.whileWeThereBasePrice !== null).map((s) => s.slug).join(", "));

  // RESCOPED, 29 August. This asserted that NO file could move money, which
  // was true while the ledger was the newest payment code and became false the
  // moment Release #3 added a gateway that captures deposits.
  //
  // The enduring claim is the one this release actually makes: THE LEDGER does
  // not move money. It records what moved. That should stay true however much
  // payment code exists elsewhere, and it is the property that lets the ledger
  // be trusted as a record rather than suspected as an actor.
  //
  // Third time this codebase has preserved an invariant rather than its
  // original wording — see the retired "Release #2 has not landed early" check
  // and the rescoped onboarding one.
  const LEDGER_SURFACE = ["lib/paymentLedger.ts", "lib/depositRecording.ts"];
  const MONEY = /\b(paymentIntents|charges\.create|refunds\.create|setupIntents|\.capture\(|transfers|payouts)\b/;
  const movingInLedger = LEDGER_SURFACE.filter((f) => MONEY.test(readFileSync(f, "utf8")));
  ok(`10. the ledger records money but cannot move it (${LEDGER_SURFACE.length} file(s))`,
    movingInLedger.length === 0, movingInLedger.join(", "));
  ok(`    and it imports no payment gateway`,
    !LEDGER_SURFACE.some((f) => /paymentGateway|from "stripe"/.test(readFileSync(f, "utf8"))));

  ok(`9. checkout still refuses unpriced lines and still writes one transaction`,
    /unpriced\.length > 0/.test(readFileSync("app/api/checkout/route.ts", "utf8")) &&
    /prisma\.\$transaction/.test(readFileSync("app/api/checkout/route.ts", "utf8")));

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  The lifecycle is representable, and no booking is in it.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
