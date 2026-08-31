/**
 * Re-approve the legacy prices that were published before approval existed.
 *
 *   npx tsx scripts/republish-legacy-approved-prices.ts            dry run
 *   npx tsx scripts/republish-legacy-approved-prices.ts --commit   writes
 *
 * These five carry a price with no `publishedPriceApprovedAt`, because until
 * 30 Aug 2026 the service editor wrote `basePrice` straight from a typed
 * field. Each one's inputs reproduce its published figure TO THE CENT, so
 * re-approving changes nothing a customer sees — it records that a human
 * accepted a number that was already correct.
 *
 * OWNER AUTHORIZATION: given 30 Aug 2026, for these five slugs only, with the
 * explicit instruction not to alter any amount as part of the migration.
 * `new-coax-line` is deliberately absent: it publishes $420.00 and derives
 * $405.00, and that $15.00 is a decision, not a migration.
 *
 * WHY A SCRIPT RATHER THAN THE ADMIN SCREEN
 *
 * The publish route requires a Better Auth session and a contractor
 * membership, which a script cannot hold. So this follows the pattern already
 * sanctioned for owner-approved publication — publish-phase-f-package.ts and
 * its siblings: publish ONLY a slug listed here, derive the figure through the
 * same `suggestPrimaryPrice` the admin route calls, and REFUSE if the engine
 * no longer reproduces what is published.
 *
 * That refusal is the whole safety property. If a cost has moved since this
 * was written, the amounts no longer agree, and this becomes a repricing
 * rather than a re-approval — so it stops instead.
 */

import { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice } from "../lib/pricing";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);

/** Owner-authorized 30 Aug 2026. Each reproduces its published price exactly. */
const APPROVED = [
  "new-ethernet-line",
  "new-wall-sconce",
  "replace-wall-sconce",
  "elite-articulating-mount",
  "elite-tilt-mount",
];

async function main() {
  console.log(`\nRE-APPROVING LEGACY PRICES`);
  console.log(COMMIT ? `  COMMITTING\n` : `  DRY RUN — nothing is written.\n`);
  let refuse = 0;

  for (const slug of APPROVED) {
    const s = await prisma.service.findFirstOrThrow({ where: { slug } });
    const settings = await prisma.pricingSettings.findUniqueOrThrow({
      where: { contractorId: s.contractorId },
    });

    const primary = suggestPrimaryPrice(s as never, settings as never);
    const wwt = suggestWwtPrice(s as never, settings as never);

    console.log(`  ${slug}`);
    console.log(`     base ${money(s.basePrice)} -> derives ${money(primary.totalCents)}`);
    console.log(`     wwt  ${money(s.whileWeThereBasePrice)} -> derives ${money(wwt.totalCents)}`);

    if (s.publishedPriceApprovedAt !== null) {
      console.log(`     SKIPPED: already approved ${s.publishedPriceApprovedAt.toISOString()}\n`);
      continue;
    }
    // The migration must not move money. Either number disagreeing means the
    // inputs have changed since this list was written, and that is a pricing
    // decision for the contractor rather than a stamp to apply.
    if (primary.totalCents !== s.basePrice) {
      console.log(`     REFUSED: the engine no longer reproduces the published base price\n`);
      refuse++; continue;
    }
    if (wwt.totalCents !== s.whileWeThereBasePrice) {
      console.log(`     REFUSED: the derived add-on price differs from the published one\n`);
      refuse++; continue;
    }

    if (COMMIT) {
      await prisma.service.update({
        where: { id: s.id },
        data: {
          basePrice: primary.totalCents,
          whileWeThereBasePrice: wwt.totalCents,
          publishedPriceApprovedAt: new Date(),
        },
      });
      console.log(`     APPROVED — same amounts, now with a decision behind them`);
    }
    console.log();
  }

  if (refuse) { console.log(`\n  ${refuse} refused. Nothing else was written.\n`); process.exit(1); }
  const remaining = await prisma.service.count({
    where: { basePrice: { not: null }, publishedPriceApprovedAt: null },
  });
  console.log(COMMIT
    ? `  ${remaining} unapproved price(s) remain.\n`
    : `  All five would re-approve at their existing amounts. Rerun with --commit.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
