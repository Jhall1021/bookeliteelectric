/**
 * One-time cleanup: removes the old two-service New Outlet structure
 * (new-120v-outlet-accessible / new-120v-outlet-finished-wall) and their
 * question trees, which are being replaced by a single "new-120v-outlet"
 * service with an internal adjusted-price branch.
 *
 * Run this ONCE, before re-running db:seed and db:seed-questions:
 *   npx tsx prisma/cleanup-old-new-outlet.ts
 *
 * Safe to run even if the old services don't exist (e.g. a fresh database)
 * — it just does nothing in that case.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const oldSlugs = ["new-120v-outlet-accessible", "new-120v-outlet-finished-wall"];

  for (const slug of oldSlugs) {
    const service = await prisma.service.findUnique({
      where: { slug },
      include: { questions: { include: { options: true } } },
    });

    if (!service) {
      console.log(`  – ${slug} not found, skipping`);
      continue;
    }

    // Delete any cart line items pointing at this service first (foreign
    // key constraint) — fine to lose in-progress test carts at this stage.
    await prisma.lineItem.deleteMany({ where: { serviceId: service.id } });

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
