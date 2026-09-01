/**
 * Move the two per-service deposits onto the general policy.
 *
 *   npx tsx scripts/migrate-deposit-policy.ts [--commit]
 *
 * Elite's 200A upgrade and panel replacement each carried
 * `Service.depositCents = 24900`, and the old rule SUMMED them — a homeowner
 * booking both was asked for $498 against one appointment. The policy replaces
 * that with one contractor-level amount and a per-service rule.
 *
 * NOT AN ELITE-ONLY PATH. Anything carrying a per-service deposit is migrated
 * the same way, and the deposit code no longer reads `depositCents` at all.
 * Elite is simply the only contractor who has one today.
 *
 * SAFE BY INSPECTION: no booking has ever taken a deposit
 * (`depositDueCents > 0` is zero rows), so there is no snapshot to preserve
 * and nothing a homeowner already agreed to can move.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

async function main() {
  console.log(`\nDEPOSIT POLICY MIGRATION${COMMIT ? "" : " — DRY RUN"}\n`);

  const taken = await prisma.booking.count({ where: { depositDueCents: { gt: 0 } } });
  if (taken > 0) {
    // The premise of the migration is that nothing is snapshotted. If that
    // stops being true, stop: a booking's agreed deposit is not ours to move.
    console.log(`  ${taken} booking(s) already carry a deposit — refusing to migrate blind.\n`);
    process.exit(1);
  }

  const withDeposit = await prisma.service.findMany({
    where: { depositCents: { gt: 0 } },
    select: { id: true, slug: true, depositCents: true, contractorId: true },
  });
  if (withDeposit.length === 0) {
    console.log("  Nothing to migrate.\n");
    await prisma.$disconnect();
    return;
  }

  const byContractor = new Map<string, typeof withDeposit>();
  for (const s of withDeposit) {
    byContractor.set(s.contractorId, [...(byContractor.get(s.contractorId) ?? []), s]);
  }

  for (const [contractorId, services] of byContractor) {
    const c = await prisma.contractor.findUniqueOrThrow({
      where: { id: contractorId },
      select: { slug: true, depositAmountCents: true },
    });
    const amounts = [...new Set(services.map((s) => s.depositCents!))];

    // One contractor-level figure. If their services disagreed, the largest is
    // the safe read of intent — it is the amount they thought secured their
    // most valuable work, and it is capped at the booking total anyway.
    const amount = Math.max(...amounts);
    console.log(`  ${c.slug}`);
    console.log(`    services: ${services.map((s) => s.slug).join(", ")}`);
    console.log(`    per-service amounts: ${amounts.map((a) => `$${(a / 100).toFixed(2)}`).join(", ")}`);
    console.log(`    -> deposit amount $${(amount / 100).toFixed(2)}, those services ALWAYS_REQUIRE`);

    if (!COMMIT) continue;
    await prisma.$transaction(async (tx) => {
      await tx.contractor.update({
        where: { id: contractorId },
        // Only the amount and the service rule. No company-wide threshold is
        // invented: the old behavior was "these services, always", and that
        // is exactly ALWAYS_REQUIRE. Guessing a $1,000 rule they never set
        // would change who pays a deposit.
        data: { depositAmountCents: amount },
      });
      for (const s of services) {
        await tx.service.update({ where: { id: s.id }, data: { depositRule: "ALWAYS_REQUIRE" } });
      }
    });
  }

  console.log(COMMIT ? "\n  Migrated.\n" : "\n  Nothing was changed.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
