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
import { checkCountry } from "../lib/contractorIdentity";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}

const CHECKED = new Date("2026-08-29T00:00:00.000Z");

/**
 * Comments are stripped before any source is matched.
 *
 * Every check below looks for terms that its own documentation has to mention
 * — a comment saying "no destination charges, no on_behalf_of" is not a
 * destination charge. Twice now a check has failed on the paragraph explaining
 * why it exists. audit-guard-adoption solved this the same way.
 */
function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const t = line.trimStart();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "";
      const i = line.indexOf("//");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

async function main() {
  console.log(`\nSTRIPE CONNECT — READINESS\n`);

  // ── 1-4: every way readiness can fail, and the one way it succeeds ──────
  const noAccount = connectReadiness({
    stripeAccountId: null, stripeMerchantConfigured: false,
    stripeCardPaymentsStatus: null, stripeOnboardingBlocked: false,
    stripeReadinessCheckedAt: null,
  });
  ok(`1. no Stripe account -> NOT ready`, !noAccount.ready, noAccount.reason);

  const neverChecked = connectReadiness({
    stripeAccountId: "acct_test", stripeMerchantConfigured: true,
    stripeCardPaymentsStatus: "active", stripeOnboardingBlocked: false,
    stripeReadinessCheckedAt: null,
  });
  ok(`   an account we have never asked Stripe about -> NOT ready`, !neverChecked.ready,
    neverChecked.reason);

  const incomplete = connectReadiness({
    stripeAccountId: "acct_test", stripeMerchantConfigured: false,
    stripeCardPaymentsStatus: "pending", stripeOnboardingBlocked: false,
    stripeReadinessCheckedAt: CHECKED,
  });
  ok(`2. account created, no merchant configuration -> NOT ready`, !incomplete.ready, incomplete.reason);

  const noCharges = connectReadiness({
    stripeAccountId: "acct_test", stripeMerchantConfigured: true,
    stripeCardPaymentsStatus: "pending", stripeOnboardingBlocked: true,
    stripeReadinessCheckedAt: CHECKED,
  });
  ok(`3. merchant configured, onboarding requirements outstanding -> NOT ready`, !noCharges.ready, noCharges.reason);

  const noCapability = connectReadiness({
    stripeAccountId: "acct_test", stripeMerchantConfigured: true,
    stripeCardPaymentsStatus: "unsupported", stripeOnboardingBlocked: false,
    stripeReadinessCheckedAt: CHECKED,
  });
  ok(`   unblocked but card_payments not active -> NOT ready`, !noCapability.ready,
    noCapability.reason);

  const ready = connectReadiness({
    stripeAccountId: "acct_test", stripeMerchantConfigured: true,
    stripeCardPaymentsStatus: "active", stripeOnboardingBlocked: false,
    stripeReadinessCheckedAt: CHECKED,
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
      stripeAccountId: c.stripeAccountId, stripeMerchantConfigured: false,
      stripeCardPaymentsStatus: null, stripeOnboardingBlocked: false,
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
  const movingInOnboarding = ONBOARDING_SURFACE.filter((f) =>
    MONEY.test(stripComments(readFileSync(f, "utf8")))
  );
  ok(`7. the onboarding surface cannot move money (${ONBOARDING_SURFACE.length} file(s))`,
    movingInOnboarding.length === 0, movingInOnboarding.join(", "));

  // And it still only reads accounts — creating one is not moving money, but
  // retrieving and creating are the only two things it may do to them.
  const onboardingSrc = ONBOARDING_SURFACE.map((f) => stripComments(readFileSync(f, "utf8"))).join("\n");
  ok(`   it only creates and reads accounts`,
    /accounts\.create|accounts\.retrieve|accountLinks\.create/.test(onboardingSrc) &&
      !/accounts\.del|accounts\.reject/.test(onboardingSrc));

  // ── the economics of the connected account ─────────────────────────────
  //
  // Asserted against the source because this is the failure mode with no
  // symptom: an account created with the wrong fee payer works perfectly and
  // sends Price2Book a bill. It was caught on 29 August only because Stripe
  // happened to reject the combination for an unrelated reason — a full
  // dashboard cannot have the platform paying fees. Without that conflict it
  // would have shipped.
  console.log();
  const connectSrc = stripComments(readFileSync("app/api/admin/stripe/connect/route.ts", "utf8"));

  ok(`Stripe collects its fees from the CONTRACTOR`,
    /fees_collector:\s*"stripe"/.test(connectSrc),
    'anything else can put processing fees on the platform');

  ok(`an unrecoverable negative balance does not land on the platform`,
    /losses_collector:\s*"stripe"/.test(connectSrc),
    "the charge still belongs to the contractor and refunds reduce THEIR balance; " +
      "this is only about who carries a shortfall");

  ok(`the contractor gets a full Stripe dashboard`,
    /dashboard:\s*"full"/.test(connectSrc),
    "this is their payment system; they must be able to log into it");

  ok(`the merchant configuration requests card payments`,
    /card_payments:\s*\{\s*requested:\s*true\s*\}/.test(connectSrc));

  ok(`v1 account compatibility is not enabled`,
    !/stripe\.accounts\.create|controller:\s*\{/.test(connectSrc),
    "two account shapes would mean two definitions of ready");

  // Direct charges, not destination. The distinction is who the homeowner
  // transacts with, and switching to destination charges to make an error go
  // away would move merchant-of-record to Price2Book.
  ok(`charges are not routed through the platform account`,
    !/on_behalf_of|transfer_data|application_fee/.test(connectSrc),
    "destination-charge markers would mean Price2Book is merchant of record");

  // ── country, and where it is allowed to come from ──────────────────────
  //
  // Stripe surfaced this by refusing configuration.merchant without
  // identity.country, but the interesting property is not that the field
  // exists — it is WHERE THE VALUE COMES FROM. A "US" written at the Stripe
  // call site would work perfectly for the current tenant and turn their
  // location into a platform assumption, which is the same error as shipping
  // one contractor's crew-hours in the template.
  console.log();

  /** The refusal reason, or "" when the check passed. */
  const why = (c: string | null) => {
    const r = checkCountry(c);
    return r.ok ? "" : r.reason;
  };

  ok(`an unknown country is refused`, !checkCountry(null).ok, why(null));
  ok(`   and blank counts as unknown`, !checkCountry("   ").ok);
  ok(`a malformed code is refused`, !checkCountry("USA").ok, why("USA"));
  ok(`an unsupported country is refused`, !checkCountry("GB").ok, why("GB"));
  ok(`   unknown and unsupported give different reasons`,
    why(null) !== "" && why("GB") !== "" && why(null) !== why("GB"),
    "a contractor deserves to know which one applies");
  const us = checkCountry("us");
  ok(`a supported country is accepted and normalized`, us.ok && us.countryCode === "US");

  // The refusal happens BEFORE Stripe, which is the whole point of checking it
  // here rather than letting the API answer.
  ok(`the route refuses before any Stripe call`,
    connectSrc.indexOf("checkCountry(") < connectSrc.indexOf("accounts.create"),
    "a validation code from Stripe is a worse answer than a product one");

  ok(`the country comes from the contractor row, never a constant`,
    /identity:\s*\{\s*country:\s*country\.countryCode\s*\}/.test(connectSrc) &&
      !/"US"/.test(connectSrc),
    'a literal "US" here would make the current tenant the platform default');

  ok(`the supported list is a product decision, not Stripe configuration`,
    /SUPPORTED_COUNTRIES/.test(readFileSync("lib/contractorIdentity.ts", "utf8")) &&
      !/SUPPORTED_COUNTRIES/.test(stripComments(readFileSync("lib/stripeConnect.ts", "utf8"))),
    "the day a second country opens, nobody should be searching the payment code");

  // Tenancy: the country is read from the session's own contractor row.
  ok(`one contractor cannot supply the country for another`,
    /select:\s*\{[^}]*countryCode: true/.test(connectSrc) &&
      !/body[^\n]*country|country[^\n]*body/.test(connectSrc),
    "a country read from the request would let one admin configure another's account");

  // ── the API-version boundary ───────────────────────────────────────────
  //
  // Two clients, two versions, and the separation is the point. The v2 account
  // methods are unreachable on the stable version — the sandbox answers "The
  // API method cannot be found ... explicitly specify a .preview
  // Stripe-Version" — so the lifecycle is pinned to a preview. Homeowner money
  // must not follow it there: a preview API is a moving target by definition,
  // and the payment path is the last place that belongs.
  //
  // Asserted in BOTH directions, because each has its own failure. The
  // lifecycle silently losing the pin fails loudly at Stripe. The payment path
  // silently gaining it does not fail at all.
  console.log();
  const connectLib = stripComments(readFileSync("lib/stripeConnect.ts", "utf8"));
  const gatewayLib = stripComments(readFileSync("lib/paymentGateway.ts", "utf8"));
  const readinessSrc = stripComments(readFileSync("app/api/admin/stripe/readiness/route.ts", "utf8"));
  const webhookSrc = stripComments(readFileSync("app/api/stripe/webhook/route.ts", "utf8"));

  ok(`the Connect lifecycle is pinned to the required preview version`,
    /CONNECT_LIFECYCLE_API_VERSION\s*=\s*"2026-02-25\.preview"/.test(connectLib));

  ok(`both account-lifecycle routes use the pinned client`,
    /connectLifecycleStripe\(\)/.test(connectSrc) && /connectLifecycleStripe\(\)/.test(readinessSrc));
  ok(`   and neither reaches for the stable one`,
    !/stripeClient\(\)/.test(connectSrc) && !/stripeClient\(\)/.test(readinessSrc));

  // The direction that fails silently.
  ok(`the payment gateway does NOT inherit the preview version`,
    !/connectLifecycleStripe|preview/.test(gatewayLib),
    "PaymentIntents and captures must stay on the stable API");
  ok(`   it uses the stable client`, /stripeClient\(\)/.test(gatewayLib));
  ok(`   and webhook verification does too`,
    /stripeClient\(\)/.test(webhookSrc) && !/connectLifecycleStripe/.test(webhookSrc),
    "a signature verified against a preview version is a different contract");

  ok(`the two versions are actually different`,
    /STABLE_API_VERSION\s*=\s*"2025-10-29\.clover"/.test(connectLib),
    "a boundary between two identical values proves nothing");

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
