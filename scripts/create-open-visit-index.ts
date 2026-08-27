/**
 * Create the OPEN-visit partial unique, then assert it exists.
 *
 * Prisma cannot express a partial unique index in schema.prisma, so this runs
 * explicitly AFTER `db push` rather than being part of it. It is never assumed
 * to have survived anything: the index is read back from pg_indexes and its
 * definition checked for the WHERE clause, because a unique index without the
 * predicate would silently forbid a session from ever having two visits at all.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const NAME = "visits_open_per_contractor_session";
const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const dupes: { n: number }[] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM (
       SELECT 1 FROM visits WHERE status='OPEN' AND "sessionId" IS NOT NULL
       GROUP BY "contractorId","sessionId" HAVING count(*) > 1) x`
  );
  console.log(`  rows violating the invariant: ${dupes[0].n}`);
  if (dupes[0].n !== 0) {
    console.log(`  ABORT — resolve them before creating the index.`);
    process.exitCode = 1;
    return;
  }
  if (apply) {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${NAME}"
       ON visits ("contractorId","sessionId") WHERE status = 'OPEN'`
    );
  }
  const r: { indexdef: string }[] = await prisma.$queryRawUnsafe(
    `SELECT indexdef FROM pg_indexes WHERE indexname='${NAME}'`
  );
  const exists = r.length === 1;
  const partial = /WHERE \(?status/i.test(r[0]?.indexdef ?? "");
  console.log(`  ${exists ? "ok  " : "FAIL"} index exists`);
  console.log(`  ${partial ? "ok  " : "FAIL"} index is PARTIAL`);
  if (r[0]) console.log(`       ${r[0].indexdef}`);
  process.exitCode = exists && partial ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
