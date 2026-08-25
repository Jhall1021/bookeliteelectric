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
  const services = await prisma.service.count({ where: { contractorId: dummy.id } });

  console.log(`\n  ${dummy.name}`);
  console.log(`      ${materials} contractor material(s)`);
  console.log(`      ${services} service(s)`);

  if (services > 0) {
    console.error(
      `\n  Refusing — the dummy owns services. The test never creates any, so\n` +
        `  something else did. Look before deleting.\n`
    );
    process.exit(1);
    return;
  }

  if (!apply) {
    console.log(`\n  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  await prisma.contractorMaterial.deleteMany({ where: { contractorId: dummy.id } });
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
