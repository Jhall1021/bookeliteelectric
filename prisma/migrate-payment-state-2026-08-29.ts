/**
 * Every existing booking becomes LEGACY_UNTRACKED — 29 August 2026.
 *
 *   npx tsx prisma/migrate-payment-state-2026-08-29.ts          report
 *   npx tsx prisma/migrate-payment-state-2026-08-29.ts --apply  write
 *
 * NOT NOT_REQUIRED, and the distinction is the whole point of the script.
 *
 * All 24 bookings carry a PaymentModel saying card-on-file capture-after-
 * completion was intended. Whether any money ever changed hands happened
 * outside this software — by check, by card over the phone, by invoice.
 * Labeling them "no payment required" would assert something false about every
 * one, and permanently: nothing later could distinguish a genuinely free job
 * from one whose money this system never saw.
 *
 * depositDueCents stays NULL for the same reason. Zero would claim these
 * bookings were evaluated by a deposit system that did not exist when they
 * were made.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\nHISTORICAL BOOKINGS -> LEGACY_UNTRACKED\n`);

  const all = await prisma.booking.findMany({
    select: { id: true, paymentModel: true, paymentState: true, depositDueCents: true, totalCents: true },
  });

  const byModel = new Map<string, number>();
  for (const b of all) byModel.set(b.paymentModel, (byModel.get(b.paymentModel) ?? 0) + 1);
  console.log(`  ${all.length} booking(s), by the arrangement they were made under:`);
  for (const [m, n] of byModel) console.log(`      ${m.padEnd(38)} ${n}`);
  console.log();

  const wrong = all.filter((b) => b.paymentState !== "LEGACY_UNTRACKED");
  const claimingZero = all.filter((b) => b.depositDueCents === 0);
  console.log(`  not yet LEGACY_UNTRACKED : ${wrong.length}`);
  console.log(`  falsely claiming a $0 deposit was evaluated : ${claimingZero.length}`);
  console.log();

  if (!apply) { console.log(`  Report only. Re-run with --apply.\n`); return; }

  if (wrong.length) {
    await prisma.booking.updateMany({
      where: { id: { in: wrong.map((b) => b.id) } },
      data: { paymentState: "LEGACY_UNTRACKED" },
    });
  }
  if (claimingZero.length) {
    await prisma.booking.updateMany({
      where: { id: { in: claimingZero.map((b) => b.id) } },
      data: { depositDueCents: null },
    });
  }

  const after = await prisma.booking.groupBy({ by: ["paymentState"], _count: true });
  console.log(`  ✓ after: ${after.map((a) => `${a.paymentState}=${a._count}`).join(", ")}`);
  console.log(`    totalCents untouched — this script never writes one.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
