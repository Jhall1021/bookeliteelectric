/**
 * One-time cleanup: finds any Quote rows whose serviceId points at a
 * Service that no longer exists (an orphaned reference left behind by an
 * earlier cleanup script that deleted a service without checking for
 * quotes attached to it — e.g. a test quote submitted against an old TV
 * install tier before that tier was consolidated away) and removes them.
 *
 * Run this ONCE if `npx prisma db push` fails with a foreign key error on
 * the quotes table:
 *   npx tsx prisma/cleanup-orphaned-quotes.ts
 *
 * Safe to run any time — it only touches quotes with no valid service.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const quotes = await prisma.quote.findMany();
  const services = await prisma.service.findMany({ select: { id: true } });
  const validServiceIds = new Set(services.map((s) => s.id));

  let removed = 0;
  for (const q of quotes) {
    if (!validServiceIds.has(q.serviceId)) {
      console.log(`  – Removing orphaned quote ${q.id} (pointed at a deleted service)`);
      await prisma.photo.deleteMany({ where: { quoteId: q.id } });
      await prisma.quote.delete({ where: { id: q.id } });
      removed++;
    }
  }

  console.log(removed > 0 ? `Removed ${removed} orphaned quote(s).` : "No orphaned quotes found.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
