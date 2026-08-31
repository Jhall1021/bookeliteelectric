/**
 * The site-visit and deposit settings for the two pre-work services.
 *
 *   npx tsx scripts/configure-prework-deposit.ts            dry run
 *   npx tsx scripts/configure-prework-deposit.ts --commit   writes
 *
 * These are exactly the fields the "Site visit & deposit" panel writes, with
 * the same values a contractor would type into it. It is a script only because
 * the admin route requires a Better Auth session and a contractor membership,
 * which a script cannot hold — not because the settings bypass anything.
 *
 * It writes NO price and NO approval. The prices were published separately
 * through the pricing lifecycle, and this could not change them if it tried:
 * the database constraint requires basePrice and publishedPriceApprovedAt to
 * move together, and neither is touched here.
 *
 * The 30-minute visit is a per-service V1 seed the contractor owns and can
 * change in the panel — not a Price2Book rule about how long it takes to look
 * at a panel.
 */

import { PrismaClient } from "@prisma/client";
import { connectReadiness } from "../lib/stripeConnect";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);

const DEPOSIT_CENTS = 24900;

const PLAN = [
  {
    slug: "electrical-panel-replacement",
    preWorkVisitMinutes: 30,
    ctaLabel: "Book My Panel Replacement",
    // No permit-process promise: permit handling varies for a like-for-like
    // panel replacement, and a promise made here is made to every customer.
    preWorkCustomerNote:
      "Once booked, we'll schedule a brief on-site visit to verify your existing " +
      "panel and gather everything needed for installation. After any required " +
      "approvals are complete, we'll coordinate your installation date.",
  },
  {
    slug: "200a-service-upgrade",
    preWorkVisitMinutes: 30,
    ctaLabel: "Book My Service Upgrade",
    // A service upgrade is permitted work, so the stronger promise holds.
    preWorkCustomerNote:
      "Once booked, we'll begin the permit process and schedule a brief on-site " +
      "visit to verify your existing electrical service and gather everything " +
      "needed for installation. After the required approvals are complete, " +
      "we'll coordinate your installation date.",
  },
];

async function main() {
  console.log(`\nSITE VISIT & DEPOSIT`);
  console.log(COMMIT ? `  COMMITTING\n` : `  DRY RUN — nothing is written.\n`);
  let refuse = 0;

  for (const p of PLAN) {
    const s = await prisma.service.findFirstOrThrow({ where: { slug: p.slug } });
    const contractor = await prisma.contractor.findUniqueOrThrow({
      where: { id: s.contractorId },
      select: {
        slug: true, stripeAccountId: true, stripeMerchantConfigured: true,
        stripeCardPaymentsStatus: true, stripeOnboardingBlocked: true, stripeReadinessCheckedAt: true,
      },
    });
    const readiness = connectReadiness(contractor);

    console.log(`  ${p.slug}`);
    console.log(`     published price   ${money(s.basePrice)}  approved ${s.publishedPriceApprovedAt ? "yes" : "NO"}`);
    console.log(`     deposit           ${money(s.depositCents)} -> ${money(DEPOSIT_CENTS)}, credited to the job`);
    console.log(`     site visit        ${s.requiresPreWorkVisit} -> true, ${p.preWorkVisitMinutes} minutes`);
    console.log(`     button            ${s.ctaLabel ?? "default"} -> "${p.ctaLabel}"`);
    console.log(`     stripe ready      ${readiness.ready} (${readiness.reason})`);

    // A deposit service on an unready account looks bookable and is not.
    if (!readiness.ready) { console.log(`     REFUSED: ${contractor.slug} cannot take a deposit\n`); refuse++; continue; }
    if (s.basePrice === null || s.publishedPriceApprovedAt === null) {
      console.log(`     REFUSED: configure a deposit only on a service with an approved price\n`);
      refuse++; continue;
    }
    if (s.whileWeThereBasePrice !== null) {
      console.log(`     REFUSED: an add-on price appeared; neither service has one\n`);
      refuse++; continue;
    }

    if (COMMIT) {
      await prisma.service.update({
        where: { id: s.id },
        data: {
          requiresPreWorkVisit: true,
          preWorkVisitMinutes: p.preWorkVisitMinutes,
          installationRequiresPreWorkCompletion: true,
          depositCents: DEPOSIT_CENTS,
          depositCreditsToJob: true,
          ctaLabel: p.ctaLabel,
          preWorkCustomerNote: p.preWorkCustomerNote,
        },
      });
      console.log(`     CONFIGURED`);
    }
    console.log();
  }

  if (refuse) { console.log(`\n  ${refuse} refused. Nothing written.\n`); process.exit(1); }
  console.log(COMMIT ? `  Both configured.\n` : `  Both would configure cleanly. Rerun with --commit.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
