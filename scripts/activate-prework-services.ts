/**
 * Activation for the two fixed-price pre-work services.
 *
 *   npx tsx scripts/activate-prework-services.ts            dry run (default)
 *   npx tsx scripts/activate-prework-services.ts --commit   writes
 *
 * WHY THIS IS A SCRIPT AND NOT A MIGRATION
 *
 * Writing `basePrice` on an active service publishes it. There is no draft
 * state between "priced" and "public" — the storefront reads `basePrice`
 * directly, and `publishedPriceApprovedAt` is dashboard reporting, not a gate.
 * So this is the activation, and it defaults to showing what it WOULD do.
 *
 * The visit duration is a per-SERVICE seed, written to
 * `Service.preWorkVisitMinutes` — a column the contractor owns and can edit.
 * It was briefly a constant in this file, which would have made 30 minutes a
 * Price2Book rule about everyone's panel work rather than Elite's estimate of
 * their own. How long it takes to look at a panel is a trade judgment, and it
 * belongs to whoever is driving there.
 *
 * The price is not typed in. It is derived by `suggestPrimaryPrice` — the same
 * function `PATCH /api/admin/services/[id]/pricing` calls — from the crew
 * hours, material cost and the contractor's own rate and minimum. A number
 * typed here would be a number that stops tracking its inputs. It is then
 * checked against the owner-approved figure, and the run REFUSES on any
 * disagreement rather than publishing whichever one happens to be wrong.
 */

import { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice } from "../lib/pricing";
import { connectReadiness } from "../lib/stripeConnect";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

/** Owner-approved, 30 Aug 2026. The engine must agree with these to the cent. */
const PLAN = [
  {
    slug: "electrical-panel-replacement",
    expectedCents: 215500,
    ctaLabel: "Book My Panel Replacement",
    preWorkVisitMinutes: 30,
    // No permit-process promise: permit handling varies for a like-for-like
    // panel replacement, and a promise made here is made to every customer.
    preWorkCustomerNote:
      "Once booked, we'll schedule a brief on-site visit to verify your existing " +
      "panel and gather everything needed for installation. After any required " +
      "approvals are complete, we'll coordinate your installation date.",
  },
  {
    slug: "200a-service-upgrade",
    expectedCents: 308500,
    ctaLabel: "Book My Service Upgrade",
    preWorkVisitMinutes: 30,
    // A service upgrade is permitted work, so the stronger promise holds.
    preWorkCustomerNote:
      "Once booked, we'll begin the permit process and schedule a brief on-site " +
      "visit to verify your existing electrical service and gather everything " +
      "needed for installation. After the required approvals are complete, " +
      "we'll coordinate your installation date.",
  },
];

const DEPOSIT_CENTS = 24900;

function money(c: number | null) { return c === null ? "—" : `$${(c / 100).toFixed(2)}`; }

async function main() {
  console.log(`\nACTIVATION — two fixed-price pre-work services`);
  console.log(COMMIT ? `  COMMITTING\n` : `  DRY RUN — nothing is written. Pass --commit to apply.\n`);

  let refuse = 0;
  const refuseIf = (bad: boolean, why: string) => {
    if (bad) { console.log(`  REFUSED: ${why}`); refuse++; }
    return bad;
  };

  for (const p of PLAN) {
    const svc = await prisma.service.findFirst({ where: { slug: p.slug } });
    if (!svc) { refuseIf(true, `${p.slug} does not exist`); continue; }

    const settings = await prisma.pricingSettings.findUnique({
      where: { contractorId: svc.contractorId },
    });
    if (refuseIf(!settings, `${p.slug}: the contractor has no pricing settings`)) continue;

    // Deposits are taken online, so the contractor must actually be able to
    // take one. Publishing a deposit service onto an unready account produces
    // a service that looks bookable and is not.
    const contractor = await prisma.contractor.findUniqueOrThrow({
      where: { id: svc.contractorId },
      select: {
        slug: true, stripeAccountId: true, stripeMerchantConfigured: true,
        stripeCardPaymentsStatus: true, stripeOnboardingBlocked: true,
        stripeReadinessCheckedAt: true,
      },
    });
    const readiness = connectReadiness(contractor);
    if (refuseIf(!readiness.ready, `${p.slug}: ${contractor.slug} cannot take a deposit — ${readiness.reason}`)) continue;

    const primary = suggestPrimaryPrice(svc, settings!);
    const wwt = suggestWwtPrice(svc, settings!);

    console.log(`  ${p.slug}`);
    console.log(`     derived      ${money(primary.totalCents)}  (approved ${money(p.expectedCents)})`);
    console.log(`     base price   ${money(svc.basePrice)} -> ${money(primary.totalCents)}`);
    console.log(`     deposit      ${money(svc.depositCents)} -> ${money(DEPOSIT_CENTS)}`);
    console.log(`     pre-work     ${svc.requiresPreWorkVisit} -> true (${p.preWorkVisitMinutes} min)`);
    console.log(`     WWT price    ${money(svc.whileWeThereBasePrice)} (must stay empty)`);

    if (refuseIf(primary.totalCents !== p.expectedCents,
      `${p.slug}: the engine derives ${money(primary.totalCents)}, not the approved ${money(p.expectedCents)}`)) continue;
    if (refuseIf(wwt.totalCents !== null,
      `${p.slug}: a While We're There price appeared (${money(wwt.totalCents)}); neither service has one`)) continue;
    if (refuseIf(!svc.materialCostResolved,
      `${p.slug}: material costs do not resolve, so the price is not trustworthy`)) continue;
    if (refuseIf(svc.unresolvedMaterialKeys.length > 0 || svc.unresolvedPolicyKeys.length > 0,
      `${p.slug}: unresolved keys — ${[...svc.unresolvedMaterialKeys, ...svc.unresolvedPolicyKeys].join(", ")}`)) continue;

    if (COMMIT) {
      await prisma.service.update({
        where: { id: svc.id },
        data: {
          basePrice: primary.totalCents,
          publishedPriceApprovedAt: new Date(),
          depositCents: DEPOSIT_CENTS,
          depositCreditsToJob: true,
          requiresPreWorkVisit: true,
          preWorkVisitMinutes: p.preWorkVisitMinutes,
          installationRequiresPreWorkCompletion: true,
          ctaLabel: p.ctaLabel,
          preWorkCustomerNote: p.preWorkCustomerNote,
        },
      });
      console.log(`     WRITTEN`);
    }
    console.log();
  }

  if (refuse) {
    console.log(`\n  ${refuse} service(s) refused. Nothing was published.\n`);
    process.exit(1);
  }
  console.log(COMMIT
    ? `  Both services are published. Remove their rescue allowlist entries next.\n`
    : `  Both would publish cleanly. Rerun with --commit to apply.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
