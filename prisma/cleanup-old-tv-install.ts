/**
 * One-time cleanup: removes the old three-service TV Install structure
 * (tv-install-up-to-55 / tv-install-56-85 / tv-install-over-85) and their
 * question trees, which are being replaced by a single "tv-installation"
 * service with size as its first question instead of three separate
 * services the customer had to pre-guess between.
 *
 * Run this ONCE, before re-running db:seed and db:seed-questions:
 *   npx tsx prisma/cleanup-old-tv-install.ts
 *
 * Safe to run even if the old services don't exist (e.g. a fresh database)
 * — it just does nothing in that case.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const oldSlugs = ["tv-install-up-to-55", "tv-install-56-85", "tv-install-over-85"];

  for (const slug of oldSlugs) {
    const service = await prisma.service.findUnique({
      where: { slug },
      include: { questions: { include: { options: true } } },
    });

    if (!service) {
      console.log(`  – ${slug} not found, skipping`);
      continue;
    }

    await prisma.lineItem.deleteMany({ where: { serviceId: service.id } });
    // Quotes reference a service too — deleting the service without
    // handling these first is exactly the bug that caused a broken
    // foreign key later. Photos must go before their parent Quote.
    const quotes = await prisma.quote.findMany({ where: { serviceId: service.id } });
    for (const q of quotes) {
      await prisma.photo.deleteMany({ where: { quoteId: q.id } });
    }
    await prisma.quote.deleteMany({ where: { serviceId: service.id } });

    for (const q of service.questions) {
      await prisma.answerOption.deleteMany({ where: { questionId: q.id } });
    }
    await prisma.question.deleteMany({ where: { serviceId: service.id } });
    await prisma.service.delete({ where: { id: service.id } });

    console.log(`  ✓ Removed ${slug} and its question tree`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
