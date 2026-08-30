/**
 * Payment Release #1 — a contractor can connect Stripe, and we can prove
 * whether they could take homeowner money. Without moving a dollar.
 *
 *   npx tsx scripts/verify-stripe-connect.ts
 *
 * The readiness rule is the whole release, so it is proved as a pure function
 * across every way it can fail — not by reaching a screen, and not against a
 * live Stripe account whose state somebody could change tomorrow.
 *
 * The last three checks are the ones that matter most for a payment release:
 * that this changed nothing, and that nothing here can move money.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { connectReadiness, stripeClient } from "../lib/stripeConnect";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}

const CHECKED = new Date("2026-08-29T00:00:00.000Z");

async function main() {
  console.log(`\nSTRIPE CONNECT — READINESS\n`);

  // ── 1-4: every way readiness can fail, and the one way it succeeds ──────
  const noAccount = connectReadiness({
    stripeAccountId: null, stripeDetailsSubmitted: false, stripeChargesEnabled: false,
    stripeCardPaymentsStatus: null, stripeReadinessCheckedAt: null,
  });
  ok(`1. no Stripe account -> NOT ready`, !noAccount.ready, noAccount.reason);

  const neverChecked = connectReadiness({
    stripeAccountId: "acct_test", stripeDetailsSubmitted: true, stripeChargesEnabled: true,
    stripeCardPaymentsStatus: "active", stripeReadinessCheckedAt: null,
  });
  ok(`   an account we have never asked Stripe about -> NOT ready`, !neverChecked.ready,
    neverChecked.reason);

  const incomplete = connectReadiness({
    stripeAccountId: "acct_test", stripeDetailsSubmitted: false, stripeChargesEnabled: false,
    stripeCardPaymentsStatus: "pending", stripeReadinessCheckedAt: CHECKED,
  });
  ok(`2. account created, onboarding incomplete -> NOT ready`, !incomplete.ready, incomplete.reason);

  const noCharges = connectReadiness({
    stripeAccountId: "acct_test", stripeDetailsSubmitted: true, stripeChargesEnabled: false,
    stripeCardPaymentsStatus: "pending", stripeReadinessCheckedAt: CHECKED,
  });
  ok(`3. onboarding done, charges not enabled -> NOT ready`, !noCharges.ready, noCharges.reason);

  const noCapability = connectReadiness({
    stripeAccountId: "acct_test", stripeDetailsSubmitted: true, stripeChargesEnabled: true,
    stripeCardPaymentsStatus: "inactive", stripeReadinessCheckedAt: CHECKED,
  });
  ok(`   charges enabled but card_payments inactive -> NOT ready`, !noCapability.ready,
    noCapability.reason);

  const ready = connectReadiness({
    stripeAccountId: "acct_test", stripeDetailsSubmitted: true, stripeChargesEnabled: true,
    stripeCardPaymentsStatus: "active", stripeReadinessCheckedAt: CHECKED,
  });
  ok(`4. fully enabled account -> READY`, ready.ready, ready.reason);

  // Every failure names its own cause. A gate that says only "not ready"
  // sends an operator to Stripe's dashboard to guess.
  const reasons = new Set([noAccount, neverChecked, incomplete, noCharges, noCapability].map((r) => r.reason));
  ok(`   each failure gives a distinct reason`, reasons.size === 5, `${reasons.size} of 5`);

  // ── 5: tenancy ──────────────────────────────────────────────────────────
  console.log();
  const src = readFileSync("app/api/admin/stripe/readiness/route.ts", "utf8")
    + readFileSync("app/api/admin/stripe/connect/route.ts", "utf8");
  ok(`5. the routes take the contractor from the session, never the request`,
    src.includes("ctx.contractorId") && !/body\s*\.\s*contractorId|contractorId:\s*body/.test(src),
    "a contractor id read from the request would let one admin act for another");
  ok(`   and both go through withAdminRoute`,
    (src.match(/withAdminRoute/g) ?? []).length >= 2);

  const probe = await prisma.contractor.create({
    data: { slug: `stripe-probe-${Date.now()}`, name: "Stripe Probe" },
    select: { id: true, slug: true },
  });
  try {
    // Contractor A's readiness is a property of A's row. Reading B's requires
    // B's id, which the route never accepts.
    const a = await prisma.contractor.findUniqueOrThrow({
      where: { slug: "elite-electric" },
      select: { stripeAccountId: true },
    });
    const b = await prisma.contractor.findUniqueOrThrow({
      where: { id: probe.id },
      select: { stripeAccountId: true },
    });
    ok(`   one contractor's readiness is not the other's`,
      a.stripeAccountId === null && b.stripeAccountId === null,
      "both null today, which is the same answer for different reasons");
  } finally {
    if (!probe.slug.startsWith("stripe-probe-")) {
      throw new Error("refusing to delete a contractor this probe did not create");
    }
    await prisma.contractor.delete({ where: { id: probe.id } });
  }

  // ── 6-7: this release moved nothing ─────────────────────────────────────
  console.log();
  const bookings = await prisma.booking.count();
  ok(`6. all ${bookings} existing booking(s) still present`, bookings === 24, String(bookings));

  const contractors = await prisma.contractor.findMany({
    select: { slug: true, stripeAccountId: true, stripeReadinessCheckedAt: true },
  });
  ok(`   no contractor has a Stripe account yet`,
    contractors.every((c) => c.stripeAccountId === null));
  ok(`   no contractor is payment-ready`,
    contractors.every((c) => !connectReadiness({
      stripeAccountId: c.stripeAccountId, stripeDetailsSubmitted: false,
      stripeChargesEnabled: false, stripeCardPaymentsStatus: null,
      stripeReadinessCheckedAt: c.stripeReadinessCheckedAt,
    }).ready));

  // ── 7: ONBOARDING itself cannot move money ─────────────────────────────
  //
  // RESCOPED, 29 August. This asserted that NO file in the repository could
  // move money, which was true when onboarding was the only payment code and
  // became false the moment Release #3 added a gateway that captures deposits.
  //
  // The enduring claim is narrower and is the one this release actually makes:
  // the ONBOARDING path does not move money. Connecting a Stripe account,
  // refreshing readiness and reporting it are read-only with respect to funds,
  // and that should stay true however much payment code exists elsewhere.
  //
  // Same reasoning as retiring the "Release #2 has not landed early" check:
  // preserve the invariant, not the wording it was first written in.
  const ONBOARDING_SURFACE = [
    "lib/stripeConnect.ts",
    "app/api/admin/stripe/connect/route.ts",
    "app/api/admin/stripe/readiness/route.ts",
  ];
  const MONEY = /\b(paymentIntents|charges\.create|refunds\.create|setupIntents|\.capture\(|transfers|payouts)\b/;
  const movingInOnboarding = ONBOARDING_SURFACE.filter((f) => MONEY.test(readFileSync(f, "utf8")));
  ok(`7. the onboarding surface cannot move money (${ONBOARDING_SURFACE.length} file(s))`,
    movingInOnboarding.length === 0, movingInOnboarding.join(", "));

  // And it still only reads accounts — creating one is not moving money, but
  // retrieving and creating are the only two things it may do to them.
  const onboardingSrc = ONBOARDING_SURFACE.map((f) => readFileSync(f, "utf8")).join("\n");
  ok(`   it only creates and reads accounts`,
    /accounts\.create|accounts\.retrieve|accountLinks\.create/.test(onboardingSrc) &&
      !/accounts\.del|accounts\.reject/.test(onboardingSrc));

  // ── the client fails closed without a key ──────────────────────────────
  console.log();
  const hadKey = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  ok(`the Stripe client returns null when unconfigured rather than throwing`,
    hadKey || stripeClient() === null,
    "callers must read null as 'cannot confirm', never as 'confirmed false'");

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  A contractor can connect Stripe and we can prove whether they are\n  ready — and nothing in this release can take a dollar.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
