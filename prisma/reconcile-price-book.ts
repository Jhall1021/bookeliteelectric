/**
 * Price book reconciliation — 23 August 2026.
 *
 *   npx tsx prisma/reconcile-price-book.ts          report
 *   npx tsx prisma/reconcile-price-book.ts --apply  publish
 *
 * THE SANCTIONED EXCEPTION.
 *
 * Seeds cannot touch a published customer price — _priceGuard.ts stops them,
 * because seeds were quietly repricing services nobody had decided to
 * reprice. This file is the alternative the governance rule allows: a named,
 * dated migration carrying prices an owner reviewed one at a time and signed
 * off in writing.
 *
 * WHAT THIS IS
 *
 * The catalog was priced before the pricing model existed. Once crew-hours,
 * material costs and markup became real, most published prices no longer
 * matched what their own inputs produced — not through drift, but because
 * they were never derived from inputs in the first place.
 *
 * The old add-on book is the clearest case: it charged roughly $130-200 for
 * almost everything, whether the work took fifteen minutes or ninety. This
 * migration replaces that with prices that follow the work.
 *
 * It is a REDISTRIBUTION, not a rise. Quick jobs come down, long jobs go up,
 * and the book as a whole barely moves.
 *
 * WHAT IT DOESN'T TOUCH
 *
 *   - 16 quote-only services, which have no deterministic price by design
 *   - 12 services held back pending real material costs
 *   -  1 approved exception: Electrical Troubleshooting at $249, a diagnostic
 *      product rather than a labor calculation
 *
 * Every price here came from the owner's decision file. Nothing was inferred.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Approved = {
  slug: string;
  basePrice?: number;
  whileWeThereBasePrice?: number;
  /** The owner's own wording from the decision file. */
  decision: string;
};

/**
 * Generated from BookEliteElectric_Pricing_Reconciliation_Decisions_2026-08-22.csv
 * rather than transcribed, because seventy hand-copied figures is seventy
 * chances to fat-finger someone's price.
 */
const APPROVED: Approved[] = [
  {
    slug: "bidet-smart-toilet-outlet",
    basePrice: 28000,
    whileWeThereBasePrice: 22000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "customer-supplied-non-smart-outlet",
    basePrice: 25500,
    whileWeThereBasePrice: 9000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "swap-out-customer-supplied-non-smart-switch",
    basePrice: 25500,
    whileWeThereBasePrice: 9000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "customer-supplied-smart-switch",
    basePrice: 25500,
    whileWeThereBasePrice: 13000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "dedicated-120v-circuit-outlet",
    basePrice: 68500,
    whileWeThereBasePrice: 68500,
    decision: "APPROVE / PUBLISH MODEL",
  },
  {
    slug: "dishwasher-electrical",
    whileWeThereBasePrice: 12500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "doorbell-transformer-replacement",
    basePrice: 27000,
    whileWeThereBasePrice: 21000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "double-pole-breaker-replacement",
    basePrice: 28000,
    whileWeThereBasePrice: 21500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "exterior-gfci-standard",
    basePrice: 44500,
    whileWeThereBasePrice: 38500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "floodlight-camera-existing",
    whileWeThereBasePrice: 19000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "garage-door-opener-outlet",
    basePrice: 28000,
    whileWeThereBasePrice: 22000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "garage-door-opener-outlet-ev",
    basePrice: 28000,
    whileWeThereBasePrice: 22000,
    decision: "ALIGN WITH REGULAR SERVICE",
  },
  {
    slug: "garbage-disposal-install",
    whileWeThereBasePrice: 12500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "home-electrical-safety-inspection",
    basePrice: 37500,
    whileWeThereBasePrice: 31500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "install-new-microwave",
    basePrice: 50000,
    whileWeThereBasePrice: 44000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "tv-install-existing-location",
    whileWeThereBasePrice: 12500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "new-120v-outlet",
    basePrice: 28000,
    whileWeThereBasePrice: 22000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "occupancy-motion-switch",
    basePrice: 30500,
    whileWeThereBasePrice: 14000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "tv-installation",
    basePrice: 42500,
    whileWeThereBasePrice: 36500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "recessed-lighting",
    basePrice: 37500,
    whileWeThereBasePrice: 37500,
    decision: "APPROVE CORRECTED MODEL",
  },
  {
    slug: "otr-microwave-install",
    basePrice: 37500,
    whileWeThereBasePrice: 31500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "replace-3-way-switch",
    basePrice: 26500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "replace-ceiling-fan",
    basePrice: 31500,
    whileWeThereBasePrice: 25000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "smoke-co-detector",
    basePrice: 33500,
    whileWeThereBasePrice: 14500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "replace-exterior-light-fixture",
    whileWeThereBasePrice: 19000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "replace-gfci-outlet",
    basePrice: 28000,
    whileWeThereBasePrice: 11500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "replace-interior-light-fixture",
    whileWeThereBasePrice: 12500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "replace-led-dimmer",
    basePrice: 29500,
    whileWeThereBasePrice: 13000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "replace-motion-flood-light",
    whileWeThereBasePrice: 19000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "replace-standard-outlet",
    basePrice: 26000,
    whileWeThereBasePrice: 9500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "replace-standard-switch",
    basePrice: 26000,
    whileWeThereBasePrice: 9500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "hardwired-smoke-detector",
    basePrice: 28500,
    whileWeThereBasePrice: 9500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "single-pole-breaker-replacement",
    basePrice: 26500,
    whileWeThereBasePrice: 14000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "smart-outlet-upgrade",
    basePrice: 33500,
    whileWeThereBasePrice: 21000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "smart-switch-upgrade",
    basePrice: 33000,
    whileWeThereBasePrice: 20500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "smart-thermostat-install",
    whileWeThereBasePrice: 12500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "timer-switch-install",
    basePrice: 33500,
    whileWeThereBasePrice: 21000,
    decision: "APPROVE MODEL",
  },
  {
    slug: "usb-outlet-upgrade",
    basePrice: 30000,
    whileWeThereBasePrice: 13500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "video-doorbell-existing-wiring",
    whileWeThereBasePrice: 12500,
    decision: "APPROVE MODEL",
  },
  {
    slug: "whole-house-surge-protection",
    basePrice: 60000,
    whileWeThereBasePrice: 53500,
    decision: "APPROVE MODEL",
  },

  // ---- second pass: the twelve rows held pending material costs ---------
  //
  // These couldn't be judged in the first pass because their material
  // composition wasn't established — pricing labor for a receptacle swap
  // with no receptacle in it isn't a model, it's a gap. The owner confirmed
  // the compositions on 23 Aug and these follow from them.
  {
    slug: "dryer-receptacle-replacement",
    basePrice: 26500,
    whileWeThereBasePrice: 14000,
    decision: "APPROVE MODEL — material established 23 Aug",
  },
  {
    slug: "range-receptacle-replacement",
    basePrice: 26500,
    whileWeThereBasePrice: 14000,
    decision: "APPROVE MODEL — material established 23 Aug",
  },
  {
    slug: "new-ceiling-light",
    basePrice: 34000,
    whileWeThereBasePrice: 27500,
    decision: "APPROVE MODEL — material established 23 Aug",
  },
  {
    slug: "new-ceiling-fan",
    basePrice: 48500,
    whileWeThereBasePrice: 42000,
    decision: "APPROVE MODEL — material established 23 Aug",
  },
  {
    slug: "fan-replacing-light",
    basePrice: 40500,
    whileWeThereBasePrice: 34000,
    decision: "APPROVE MODEL — material established 23 Aug",
  },
  {
    slug: "bathroom-fan-light-combo",
    basePrice: 50000,
    whileWeThereBasePrice: 44000,
    decision: "APPROVE MODEL — material established 23 Aug",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const now = new Date();

  console.log(`\nPRICE BOOK RECONCILIATION — 23 August 2026\n`);
  console.log(`  ${APPROVED.length} service(s) approved for publishing\n`);

  let changed = 0, already = 0, missing = 0;
  let up = 0, down = 0, upTotal = 0, downTotal = 0;

  for (const a of APPROVED) {
    const svc = await prisma.service.findUnique({
      where: { slug: a.slug },
      select: { id: true, name: true, basePrice: true, whileWeThereBasePrice: true },
    });
    if (!svc) {
      console.log(`  ! ${a.slug} not in the catalog — skipped`);
      missing++;
      continue;
    }

    const moves: string[] = [];
    const data: Record<string, number | Date> = {};

    for (const [field, label] of [
      ["basePrice", "standalone"],
      ["whileWeThereBasePrice", "same-visit"],
    ] as const) {
      const wanted = a[field];
      if (wanted === undefined) continue;
      const current = svc[field];
      if (current === wanted) continue;
      const delta = wanted - (current ?? 0);
      if (delta > 0) { up++; upTotal += delta; } else { down++; downTotal -= delta; }
      moves.push(
        `${label} $${((current ?? 0) / 100).toFixed(0)} -> $${(wanted / 100).toFixed(0)}` +
          ` (${delta > 0 ? "+" : ""}$${(delta / 100).toFixed(0)})`
      );
      data[field] = wanted;
    }

    if (moves.length === 0) {
      already++;
      continue;
    }

    console.log(`  ${svc.name.trim()}`);
    for (const m of moves) console.log(`      ${m}`);

    if (apply) {
      // Stamped because a person decided each of these. This is the only
      // file in the repo entitled to set it.
      data.publishedPriceApprovedAt = now;
      await prisma.service.update({ where: { id: svc.id }, data });
    }
    changed++;
  }

  console.log(`\n  ${"─".repeat(60)}`);
  console.log(`  ${changed} service(s) with price changes`);
  console.log(`  ${already} already at the approved price`);
  if (missing) console.log(`  ${missing} not found`);
  console.log(`\n  ${up} price(s) rise by $${(upTotal / 100).toFixed(0)}`);
  console.log(`  ${down} price(s) fall by $${(downTotal / 100).toFixed(0)}`);
  console.log(`  net ${upTotal - downTotal >= 0 ? "+" : "-"}$${Math.abs((upTotal - downTotal) / 100).toFixed(0)}`);

  if (!apply) {
    console.log(`\n  Report only. Re-run with --apply to publish.\n`);
    return;
  }
  console.log(`\n  ✓ Published and stamped as owner-approved.`);
  console.log(`  Re-run the reconciliation — these should now read MATCH.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
