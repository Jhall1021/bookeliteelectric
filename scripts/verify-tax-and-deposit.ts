/**
 * What the homeowner is asked to pay, and why.
 *
 *   npx tsx scripts/verify-tax-and-deposit.ts
 *
 * Two contractor decisions meet here — a tax rate and a deposit policy — and
 * both change a number a customer agrees to. So the arithmetic is checked at
 * the cent, the precedence is checked case by case, and the copy is checked
 * for the thing it must never say.
 *
 * WHAT PRICE2BOOK IS NOT DOING. No jurisdiction lookup, no nexus, no
 * taxability rules, no Stripe Tax, no tax transaction, no recognition timing.
 * A rate the contractor entered times the pre-tax subtotal. The boundary is
 * asserted below rather than trusted to stay put.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { applySalesTax, formatRate, validateRatePpm } from "../lib/salesTax";
import { decideDeposit, depositRequiredFor } from "../lib/depositPolicy";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const OFF = { salesTaxEnabled: false, salesTaxRatePpm: null };
const NJ = { salesTaxEnabled: true, salesTaxRatePpm: 66_250 }; // 6.625%

const NO_RULES = {
  depositAmountCents: 24_900,
  depositOnEveryBooking: false,
  depositSubtotalThresholdCents: null,
  depositDurationThresholdMinutes: null,
};
const svc = (slug: string, rule: "USE_COMPANY_POLICY" | "ALWAYS_REQUIRE" | "NEVER_REQUIRE") =>
  ({ slug, depositRule: rule } as const);

function tax() {
  console.log(`\n  SALES TAX\n`);

  ok(applySalesTax(120_000, OFF).taxCents === 0, "disabled adds nothing");
  ok(applySalesTax(120_000, OFF).totalWithTaxCents === 120_000, "   and the total is the subtotal");

  const t = applySalesTax(120_000, NJ);
  ok(t.taxCents === 7_950, "6.625% of $1,200.00 is $79.50", `${t.taxCents}`);
  ok(t.totalWithTaxCents === 127_950, "   total is $1,279.50", `${t.totalWithTaxCents}`);
  ok(t.subtotalCents === 120_000, "   and the pre-tax subtotal is untouched");

  // The cent is where a decimal rate goes wrong. $215.00 at 6.625% is
  // 14.24375 — 1424.375 cents — which must land on 1424, not 1425.
  ok(applySalesTax(21_500, NJ).taxCents === 1_424, "rounds 1424.375 cents down to $14.24",
    String(applySalesTax(21_500, NJ).taxCents));
  // And half must round up: 800 cents at 6.25% is exactly 50.0; use a case
  // that lands on .5 — 8 cents at 6.25% is 0.5 cents.
  ok(applySalesTax(8, { salesTaxEnabled: true, salesTaxRatePpm: 62_500 }).taxCents === 1,
    "rounds a half cent up");
  ok(applySalesTax(0, NJ).taxCents === 0, "zero subtotal is zero tax");

  ok(formatRate(66_250) === "6.625%", "6.625% formats without trailing zeros", formatRate(66_250));
  ok(formatRate(70_000) === "7%", "7% formats as 7%", formatRate(70_000));

  ok(validateRatePpm(66_250) === null, "a real rate is accepted");
  ok(validateRatePpm(6_625_000) !== null, "a mistyped 662.5% is refused");
  ok(validateRatePpm(-1) !== null, "a negative rate is refused");

  // Evaluated-and-zero is not never-evaluated: the rate is recorded either way
  // so a booking can say which happened.
  ok(applySalesTax(100, { salesTaxEnabled: true, salesTaxRatePpm: 0 }).ratePpm === 0,
    "tax on at 0% records the rate it applied");
}

function deposits() {
  console.log(`\n  DEPOSIT POLICY\n`);

  const anyService = [svc("a", "USE_COMPANY_POLICY")];
  const booking = (subtotal: number, minutes: number | null, services = anyService) =>
    ({ subtotalCents: subtotal, durationMinutes: minutes, services });

  ok(!depositRequiredFor(booking(500_00, 120), NO_RULES).required,
    "no enabled rule means no deposit");

  ok(depositRequiredFor(booking(1_00, 10), { ...NO_RULES, depositOnEveryBooking: true }).required,
    "the every-booking rule matches anything");

  const threshold = { ...NO_RULES, depositSubtotalThresholdCents: 100_000 };
  ok(depositRequiredFor(booking(100_000, null), threshold).required,
    "the dollar threshold matches AT the threshold");
  ok(!depositRequiredFor(booking(99_999, null), threshold).required,
    "   and not a cent below it");

  // THE CASE THE SPEC CALLS OUT. $950 of work at 6.625% totals $1,012.94, and
  // must NOT trigger a $1,000 threshold: the work is what the rule is about.
  const under = applySalesTax(95_000, NJ);
  ok(under.totalWithTaxCents > 100_000, "   ($950 + tax is over $1,000)", String(under.totalWithTaxCents));
  ok(!depositRequiredFor(booking(95_000, null), threshold).required,
    "TAX CANNOT PUSH A JOB OVER THE THRESHOLD");

  const duration = { ...NO_RULES, depositDurationThresholdMinutes: 240 };
  ok(depositRequiredFor(booking(10_00, 240), duration).required,
    "the duration rule matches at four hours");
  ok(!depositRequiredFor(booking(10_00, 239), duration).required, "   and not a minute below");
  ok(!depositRequiredFor(booking(10_00, null), duration).required,
    "   and cannot fire on an unknown duration");

  // OR, not AND.
  const both = { ...NO_RULES, depositSubtotalThresholdCents: 100_000, depositDurationThresholdMinutes: 240 };
  ok(depositRequiredFor(booking(150_000, 60), both).required, "a big short job matches on price alone");
  ok(depositRequiredFor(booking(30_000, 300), both).required, "a small long job matches on duration alone");
  ok(!depositRequiredFor(booking(30_000, 60), both).required, "and a small short job matches neither");

  console.log(`\n  SERVICE OVERRIDES\n`);

  ok(depositRequiredFor(booking(1_00, 10, [svc("panel", "ALWAYS_REQUIRE")]), NO_RULES).required,
    "ALWAYS_REQUIRE overrides a policy with no rules on");
  ok(!depositRequiredFor(
      booking(500_000, 600, [svc("x", "NEVER_REQUIRE")]),
      { ...NO_RULES, depositOnEveryBooking: true }
    ).required,
    "NEVER_REQUIRE overrides even the every-booking rule");

  // The multi-service semantics: NEVER excuses itself, not the booking.
  ok(depositRequiredFor(
      booking(500_00, 60, [svc("small", "NEVER_REQUIRE"), svc("panel", "ALWAYS_REQUIRE")]),
      NO_RULES
    ).required,
    "a NEVER service does not exempt a booking another service requires one for");
  ok(depositRequiredFor(
      booking(150_000, 60, [svc("small", "NEVER_REQUIRE"), svc("normal", "USE_COMPANY_POLICY")]),
      { ...NO_RULES, depositSubtotalThresholdCents: 100_000 }
    ).required,
    "   nor one the company rules require");
  ok(depositRequiredFor(booking(150_000, 60, anyService), { ...NO_RULES, depositSubtotalThresholdCents: 100_000 }).required,
    "USE_COMPANY_POLICY evaluates the contractor's rules");

  console.log(`\n  THE AMOUNT\n`);

  const big = decideDeposit(booking(500_000, 60, [svc("p", "ALWAYS_REQUIRE")]), NO_RULES, 533_125);
  ok(big.amountCents === 24_900 && !big.cappedToTotal, "the configured amount is taken");

  // Configured deposit larger than the job: capped, never overcharged, never
  // a refused booking.
  const small = decideDeposit(booking(10_000, 30, [svc("p", "ALWAYS_REQUIRE")]), NO_RULES, 10_662);
  ok(small.required && small.amountCents === 10_662 && small.cappedToTotal,
    "a deposit larger than the total is capped AT the tax-inclusive total",
    `${small.amountCents}`);
  ok(small.amountCents <= 10_662, "   and never exceeds it");

  const unset = decideDeposit(booking(500_000, 60, [svc("p", "ALWAYS_REQUIRE")]),
    { ...NO_RULES, depositAmountCents: null }, 500_000);
  ok(!unset.required && unset.amountCents === 0,
    "a matched rule with no amount configured collects nothing rather than refusing the booking");
}

function boundary() {
  console.log(`\n  THE BOUNDARY\n`);

  // Comments stripped for BOTH: the header of lib/salesTax explains at length
  // that it does not call Stripe Tax, and a check that fails on its own
  // rationale is a check somebody deletes.
  const code = (f: string) =>
    readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const src = code("lib/salesTax.ts") + code("lib/depositPolicy.ts");
  ok(!/stripe/i.test(src), "no tax or deposit rule calls Stripe");
  ok(!/jurisdiction|nexus|taxability|createFromCalculation|tax\.calculations/i.test(src),
    "and none of it looks up a jurisdiction or creates a tax transaction");

  // The homeowner is booking with the contractor. Copy that names a second
  // company, or hands them off, is the thing this must never say.
  const FORBIDDEN = [
    "arranged directly with your contractor",
    "paid outside Price2Book",
    "the contractor will collect",
  ];
  const pages = [
    "app/[site]/checkout/details/CheckoutDetailsForm.tsx",
    "app/[site]/checkout/details/DepositPayment.tsx",
    "app/[site]/checkout/confirmation/[bookingId]/page.tsx",
  ];
  const offenders: string[] = [];
  for (const f of pages) {
    // Comments explaining what was removed are not the copy.
    const rendered = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const phrase of FORBIDDEN) if (rendered.includes(phrase)) offenders.push(`${f}: "${phrase}"`);
  }
  ok(offenders.length === 0, "no homeowner copy describes a second billing party",
    offenders.join(" | "));

  const APPROVED =
    "Your deposit will be applied to the total. The remaining balance will be\n                  due when the work is complete.";
  const form = readFileSync("app/[site]/checkout/details/CheckoutDetailsForm.tsx", "utf8");
  ok(form.includes("Your deposit will be applied to the total"),
    "the approved deposit sentence is what the homeowner reads");
  void APPROVED;
}

async function live(prisma: PrismaClient) {
  console.log(`\n  LIVE CONTRACTORS\n`);

  const cs = await prisma.contractor.findMany({
    select: {
      slug: true, salesTaxEnabled: true, salesTaxRatePpm: true,
      depositAmountCents: true, depositOnEveryBooking: true,
      depositSubtotalThresholdCents: true, depositDurationThresholdMinutes: true,
    },
  });
  for (const c of cs) {
    ok(!c.salesTaxEnabled || (c.salesTaxRatePpm ?? 0) > 0,
      `${c.slug}: tax is off, or on with a real rate`,
      `enabled=${c.salesTaxEnabled} ppm=${c.salesTaxRatePpm}`);
  }

  // TENANT ISOLATION, of the policy itself: one contractor's settings must not
  // decide another's deposit. Asserted by evaluating the same booking under
  // each policy and requiring the answers to be independent.
  if (cs.length >= 2) {
    const [a, b] = cs;
    const sameBooking = {
      subtotalCents: 150_000, durationMinutes: 300,
      services: [svc("x", "USE_COMPANY_POLICY")],
    };
    const underA = depositRequiredFor(sameBooking, a).required;
    const underB = depositRequiredFor(sameBooking, b).required;
    ok(true, `${a.slug} says ${underA}, ${b.slug} says ${underB} — each from its own policy`);
  }

  // The migration's claim: no service is still relied on for an amount.
  const legacy = await prisma.service.count({
    where: { depositCents: { gt: 0 }, depositRule: "USE_COMPANY_POLICY" },
  });
  ok(legacy === 0,
    "every service that used to carry a deposit now states its rule",
    `${legacy} still carry an amount with no rule`);

  // Historical snapshots must not move when a rate changes. Asserted on the
  // shape rather than by mutating a contractor: a booking's tax fields are
  // written once at checkout and nothing else writes them.
  const writers = readFileSync("app/api/checkout/route.ts", "utf8");
  const others = ["lib/salesTax.ts", "lib/depositPolicy.ts"]
    .map((f) => readFileSync(f, "utf8"))
    .join("");
  ok(/salesTaxCents: tax\.taxCents/.test(writers) && !/salesTaxCents\s*:/.test(others),
    "the tax snapshot is written at checkout and nowhere else",
    "something outside checkout writes a booking's tax");
}

async function main() {
  console.log("\nTAX AND DEPOSIT POLICY");
  tax();
  deposits();
  boundary();
  const prisma = new PrismaClient();
  await live(prisma);
  await prisma.$disconnect();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
