/**
 * Remove the isolation test's dummy contractor.
 *
 *   npx tsx scripts/cleanup-isolation-test.ts            (report)
 *   npx tsx scripts/cleanup-isolation-test.ts --apply    (delete)
 *
 * The live test cleans up after itself when it completes. This is for when it
 * doesn't — a thrown error, a Ctrl+C, a connection drop.
 *
 * Deletes ONLY rows belonging to the dummy contractor, by id, and refuses to
 * run if the slug matches anything other than the test contractor.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DUMMY_SLUG = "test-isolation-dummy";
const DUMMY_SERVICE_SLUG = "test-isolation-dummy-service";

async function main() {
  const apply = process.argv.includes("--apply");

  const dummy = await prisma.contractor.findUnique({
    where: { slug: DUMMY_SLUG },
    select: { id: true, name: true, slug: true },
  });

  if (!dummy) {
    console.log(`\n  Nothing to clean up — no "${DUMMY_SLUG}" contractor.\n`);
    return;
  }

  // Belt and braces. The slug is the only thing identifying this as
  // disposable, so it is checked rather than assumed.
  if (dummy.slug !== DUMMY_SLUG) {
    console.error(`\n  Refusing: slug is "${dummy.slug}", not "${DUMMY_SLUG}".\n`);
    process.exit(1);
    return;
  }

  const materials = await prisma.contractorMaterial.count({ where: { contractorId: dummy.id } });
  const services = await prisma.service.findMany({
    where: { contractorId: dummy.id },
    select: { id: true, slug: true },
  });
  const serviceIds = services.map((s) => s.id);
  const questions = await prisma.question.findMany({
    where: { serviceId: { in: serviceIds } },
    select: { id: true },
  });
  const questionIds = questions.map((q) => q.id);
  const options = await prisma.answerOption.count({
    where: { questionId: { in: questionIds } },
  });

  console.log(`\n  ${dummy.name}`);
  console.log(`      ${materials} contractor material(s)`);
  console.log(`      ${services.length} service(s)`);
  console.log(`      ${questions.length} question(s), ${options} answer option(s)`);

  // The nested-read section creates exactly one service, under a known slug.
  // Anything else under this contractor was not put there by the test.
  const unexpected = services.filter((s) => s.slug !== DUMMY_SERVICE_SLUG);
  if (unexpected.length > 0) {
    console.error(
      `\n  Refusing — the dummy owns ${unexpected.length} service(s) the test never\n` +
        `  creates: ${unexpected.map((s) => s.slug).join(", ")}. Look before deleting.\n`
    );
    process.exit(1);
    return;
  }

  if (!apply) {
    console.log(`\n  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  // Dependency order: Question -> Service and AnswerOption -> Question both
  // restrict on delete, so the children go first.
  if (questionIds.length) {
    await prisma.answerOptionPhotoGroup.deleteMany({
      where: { answerOption: { questionId: { in: questionIds } } },
    });
    await prisma.answerOptionDisclaimer.deleteMany({
      where: { answerOption: { questionId: { in: questionIds } } },
    });
    await prisma.answerOptionComponent.deleteMany({
      where: { answerOption: { questionId: { in: questionIds } } },
    });
    await prisma.answerOption.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.questionDisclaimer.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  }
  if (serviceIds.length) {
    await prisma.pricingRule.deleteMany({ where: { serviceId: { in: serviceIds } } });
    await prisma.serviceMaterial.deleteMany({ where: { serviceId: { in: serviceIds } } });
    await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
  }
  await prisma.contractorMaterial.deleteMany({ where: { contractorId: dummy.id } });
  await prisma.contractorComponent.deleteMany({ where: { contractorId: dummy.id } });
  await prisma.contractor.delete({ where: { id: dummy.id } });

  const gone = (await prisma.contractor.findUnique({ where: { slug: DUMMY_SLUG } })) === null;
  console.log(`\n  ${gone ? "Removed." : "STILL PRESENT — investigate."}\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
