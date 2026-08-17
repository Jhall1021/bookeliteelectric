/**
 * One-time cleanup: removes the old three-package recessed lighting
 * structure (recessed-lighting-4 / recessed-lighting-6 / recessed-lighting-8)
 * which is being replaced by a single "recessed-lighting" service priced
 * per fixture, with quantity discounts handled by the cart itself.
 *
 * Run this ONCE, before re-running db:seed and db:seed-questions:
 *   npx tsx prisma/cleanup-old-recessed-lighting.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const oldSlugs = ["recessed-lighting-4", "recessed-lighting-6", "recessed-lighting-8"];

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

    console.log(`  ✓ Removed ${slug}`);
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
