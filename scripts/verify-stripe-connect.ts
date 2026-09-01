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
import { readFileSync, readdirSync } from "node:fs";
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
/** Every .ts/.tsx under a directory. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== "node_modules") out.push(...walk(full)); }
    else out.push(full);
  }
  return out;
}

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
    const READINESS_SELECT = {
      stripeAccountId: true, stripeMerchantConfigured: true,
      stripeCardPaymentsStatus: true, stripeOnboardingBlocked: true,
      stripeReadinessCheckedAt: true,
    } as const;
    const a = await prisma.contractor.findUniqueOrThrow({
      where: { slug: "elite-electric" }, select: READINESS_SELECT,
    });
    const b = await prisma.contractor.findUniqueOrThrow({
      where: { id: probe.id }, select: READINESS_SELECT,
    });
    // Was "both are null today", which is a much weaker claim and stopped
    // being true the moment a contractor onboarded. Now it can assert the
    // thing that matters: one contractor being ready says nothing about
    // another.
    const bReady = connectReadiness(b);
    ok(`   readiness belongs to a contractor, not to the platform`,
      a.stripeAccountId !== b.stripeAccountId && !bReady.ready,
      `probe ready=${bReady.ready}`);
    ok(`   a contractor with no account is never ready, whatever another has`,
      b.stripeAccountId === null && !bReady.ready, bReady.reason);
  } finally {
    if (!probe.slug.startsWith("stripe-probe-")) {
      throw new Error("refusing to delete a contractor this probe did not create");
    }
    await prisma.contractor.delete({ where: { id: probe.id } });
  }

  // ── 6-7: this release moved nothing ─────────────────────────────────────
  console.log();

  // RETIRED, 31 August. This counted bookings and asserted the total was
  // exactly 24 — Release #1's way of saying the Connect work had destroyed
  // nothing. That question was answered when the release shipped, and what
  // the frozen number meant afterwards was "nobody may take a booking": the
  // first homeowner to check out through a second contractor's storefront
  // failed the build, having done nothing wrong.
  //
  // Retired rather than rebased to 25, which would only move the date of the
  // next false failure. The enduring claim — that no booking belongs to the
  // wrong contractor, or to none — is verify-booking-tenancy's, and it is
  // asserted from the data's own shape instead of a remembered total. Same
  // reason as the dormancy claims below: a check kept past its question is
  // one nobody reads.

  // These asserted "no contractor has an account yet" and "none is
  // payment-ready". Both were Release #1 dormancy claims and both stopped
  // being true on 30 August, when a contractor actually onboarded. Retired for
  // the same reason as the earlier ones: a check kept past its question is one
  // nobody reads.
  //
  // What replaces them is the claim that still means something — readiness is
  // never inferred from our own flow reaching a screen. It is derived from
  // facts Stripe reported, and a contractor we have not asked about is not
  // ready however far along they look.
  const contractors = await prisma.contractor.findMany({
    select: {
      slug: true, stripeAccountId: true, stripeMerchantConfigured: true,
      stripeCardPaymentsStatus: true, stripeOnboardingBlocked: true,
      stripeReadinessCheckedAt: true,
    },
  });
  const readyOnes = contractors.filter((c) => connectReadiness(c).ready);
  console.log(`       ${readyOnes.length} of ${contractors.length} contractor(s) payment-ready`);
  ok(`   every ready contractor was actually checked with Stripe`,
    readyOnes.every((c) => c.stripeReadinessCheckedAt !== null),
    "readiness is what Stripe reported, never what our flow assumed");
  ok(`   and every ready contractor has card_payments active`,
    readyOnes.every((c) => c.stripeCardPaymentsStatus === "active" && c.stripeMerchantConfigured));

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

  // Was an allow_redirects subtraction, which let us_bank_account through —
  // not redirect-based, but equally unable to support this flow's
  // authorize-now-capture-later shape. The browser proof caught the Payment
  // Element offering Bank and Klarna on a live checkout.
  ok(`the deposit names the one method it supports, rather than subtracting`,
    /payment_method_types:\s*\["card"\]/.test(gatewayLib));
  ok(`   and does not inherit the contractor's dashboard selection`,
    !/automatic_payment_methods/.test(gatewayLib));
  ok(`   and the hold is still authorize-then-capture`,
    /capture_method:\s*"manual"/.test(gatewayLib));

  // ── the publishable key reaches the browser; the secret never can ─────
  //
  // Stripe.js cannot mount without a publishable key, and a client component
  // cannot read server env. The safe way to close that gap is for a SERVER
  // route to hand the publishable key down. The unsafe ways all look similar
  // enough to reach for by accident, so they are named here.
  {
    const depositRoute = stripComments(readFileSync("app/api/checkout/deposit/route.ts", "utf8"));
    const cardUi = stripComments(
      readFileSync("app/[site]/checkout/details/DepositPayment.tsx", "utf8")
    );

    ok(`the publishable key reaches the browser through a server route`,
      /process\.env\.STRIPE_PUBLISHABLE_KEY/.test(depositRoute));
    ok(`   and that route cannot hand back the secret key`,
      !/STRIPE_SECRET_KEY/.test(depositRoute));

    // A client component reading process.env at all is the shape of the
    // mistake: whatever it names, it is asking the bundler for a value.
    ok(`   and the card component reads no environment variable of its own`,
      !/process\.env/.test(cardUi));

    // The UI must not offer what the server will refuse. PaymentElement was
    // asked to restrict itself to card and ignored it — the live browser proof
    // caught it offering Bank and Klarna on a real checkout, either of which
    // the server rejects after the customer has entered their details.
    // CardElement cannot offer anything else, which is a restriction that does
    // not depend on an option being honored.
    ok(`   and the deposit collects a card, not a menu the server would refuse`,
      /CardElement/.test(cardUi) && !/PaymentElement/.test(cardUi));

    // The one spelling that WOULD ship a secret to every visitor.
    const everySource = ["lib", "app", "components", "scripts"]
      .flatMap((d) => walk(d))
      .filter((f) => /\.tsx?$/.test(f));
    const exposed = everySource.filter((f) =>
      /NEXT_PUBLIC_[A-Z_]*(SECRET|SK_|PRIVATE)/.test(readFileSync(f, "utf8"))
    );
    ok(`   and no secret is exposed under a NEXT_PUBLIC_ name`,
      exposed.length === 0, exposed.join(", "));
  }

  // The direction that fails silently.
  ok(`the payment gateway does NOT inherit the preview version`,
    !/connectLifecycleStripe|preview/.test(gatewayLib),
    "PaymentIntents and captures must stay on the stable API");
  ok(`   it uses the stable client`, /stripeClient\(\)/.test(gatewayLib));
  ok(`   and webhook verification does too`,
    /stripeClient\(\)/.test(webhookSrc) && !/connectLifecycleStripe/.test(webhookSrc),
    "a signature verified against a preview version is a different contract");

  // THE HARNESS MUST NOT BYPASS THE BOUNDARY IT TESTS.
  //
  // verify-deposit-live-test reached for the stable client to retrieve a v2
  // account and failed with a preview-version error — against an account
  // production had already retrieved successfully. That produced a FALSE
  // FAILURE, which is the benign half.
  //
  // The malign half is what this check is really for: a harness on a different
  // client is not exercising the architecture it claims to. A false pass would
  // be indistinguishable from a real one.
  const harnessSrc = stripComments(readFileSync("scripts/verify-deposit-live-test.ts", "utf8"));
  const v2Lines = harnessSrc
    .split("\n")
    .filter((l) => /v2\.core\.accounts|v2\.core\.accountLinks/.test(l));
  ok(`the live harness performs v2 account calls`, v2Lines.length > 0,
    "if it stopped, this check would pass by doing nothing");

  // Find what each v2 call is invoked ON. The client identifier appears on the
  // opening line of the cast, a few lines above the method.
  const badClientOnV2 = /\(stripe as unknown as \{[\s\S]{0,200}?v2\.core\.accounts/.test(harnessSrc);
  ok(`   and every one uses connectLifecycleStripe(), never the stable client`,
    !badClientOnV2,
    "a harness on the wrong client tests a shape the application does not have");

  ok(`   while its PaymentIntent calls stay on the stable client`,
    /stripe\.paymentIntents\./.test(harnessSrc) &&
      !/lifecycle\.paymentIntents|lifecycle as unknown as[\s\S]{0,200}?paymentIntents/.test(harnessSrc),
    "the boundary runs both ways in the harness too");

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
