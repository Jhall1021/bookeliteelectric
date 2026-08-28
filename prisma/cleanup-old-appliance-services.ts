/**
 * One-time cleanup: removes services dropped during the Appliance
 * Installation category rebuild:
 *   - range-hood-replacement (removed from the catalog entirely, per client)
 *   - new-range-circuit / new-dryer-circuit (superseded — customers needing
 *     a genuinely new circuit are now directed to the Dedicated Circuits
 *     category instead of a duplicate service here)
 *
 * Run this ONCE, before re-running db:seed and db:seed-questions:
 *   npx tsx prisma/cleanup-old-appliance-services.ts
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

async function main() {
  const oldSlugs = ["range-hood-replacement", "new-range-circuit", "new-dryer-circuit"];

  for (const slug of oldSlugs) {
    const service = await prisma.service.findUnique({
      where: await serviceSlugKey(prisma, slug),
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
