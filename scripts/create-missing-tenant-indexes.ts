/**
 * Create the tenant indexes that expand was supposed to create.
 *
 * WHAT WENT WRONG
 *
 * The expand step's schema edit used ONE aggregate assertion for a dozen
 * separate replacements. Several silently no-oped, so the @@index and
 * @@unique lines never entered schema.prisma. `prisma db push` then reported
 * "already in sync" — truthfully, because the schema it was syncing did not
 * contain them. The gap survived a push, a build, a merge and a production
 * deploy, and was found only when the contract rehearsal asserted the
 * compound crew unique existed and it did not.
 *
 * Correctness was never affected: the guard filters by contractorId whether or
 * not an index exists, and the 144-check isolation harness passed throughout.
 * What was missing is performance (every guarded query sequential-scans) and
 * the compound unique the contract release depends on.
 *
 * WHY RAW SQL RATHER THAN `db push --accept-data-loss`
 *
 * Adding a unique constraint makes db push demand that flag, and the flag
 * applies to the WHOLE push — it would wave through any other destructive
 * change in the same diff, unreviewed. Naming each index explicitly here means
 * the exact DDL is visible, reviewable and individually asserted.
 *
 * Index names follow Prisma's own convention (`table_col_idx`,
 * `table_col_key`) so a later `db push` recognizes them as already present
 * rather than trying to create them again.
 *
 * Idempotent: IF NOT EXISTS throughout, and every index is verified to exist
 * afterwards by reading pg_indexes rather than by trusting the statement.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type Idx = { name: string; sql: string; why: string };

const INDEXES: Idx[] = [
  { name: "services_contractorId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "services_contractorId_idx" ON services ("contractorId")`,
    why: "Service — root of the service tree and of every derived model; never indexed" },
  { name: "service_areas_contractorId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "service_areas_contractorId_idx" ON service_areas ("contractorId")`,
    why: "ServiceArea — read on every checkout; never indexed" },
  { name: "visits_contractorId_sessionId_status_idx",
    sql: `CREATE INDEX IF NOT EXISTS "visits_contractorId_sessionId_status_idx" ON visits ("contractorId","sessionId",status)`,
    why: "Visit — the exact key every open-visit lookup uses" },
  { name: "customers_contractorId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "customers_contractorId_idx" ON customers ("contractorId")`,
    why: "Customer" },
  { name: "photos_contractorId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "photos_contractorId_idx" ON photos ("contractorId")`,
    why: "Photo — rooted Photo queries filter on it directly" },
  { name: "arrival_windows_serviceAreaId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "arrival_windows_serviceAreaId_idx" ON arrival_windows ("serviceAreaId")`,
    why: "ArrivalWindow — its derived-ownership path" },
  { name: "jobber_crew_members_contractorId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "jobber_crew_members_contractorId_idx" ON jobber_crew_members ("contractorId")`,
    why: "JobberCrewMember" },
  { name: "jobber_crew_members_contractorId_jobberUserId_key",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "jobber_crew_members_contractorId_jobberUserId_key" ON jobber_crew_members ("contractorId","jobberUserId")`,
    why: "the compound crew identity the contract release depends on" },
  { name: "questions_serviceId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "questions_serviceId_idx" ON questions ("serviceId")`,
    why: "Question — the hop its derived ownership travels through" },
  { name: "answer_options_questionId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "answer_options_questionId_idx" ON answer_options ("questionId")`,
    why: "AnswerOption — first hop of a three-hop ownership path" },
  { name: "line_items_visitId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "line_items_visitId_idx" ON line_items ("visitId")`,
    why: "LineItem — every cart read filters on it" },
  { name: "quotes_serviceId_idx",
    sql: `CREATE INDEX IF NOT EXISTS "quotes_serviceId_idx" ON quotes ("serviceId")`,
    why: "Quote — the hop its derived ownership travels through" },
];

async function main() {
  console.log(`\nMISSING TENANT INDEXES   ${APPLY ? "APPLY" : "DRY RUN (--apply to create)"}\n`);

  // The one index that can fail: verify its precondition first, separately.
  const dupes: { n: number }[] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM (
       SELECT 1 FROM jobber_crew_members
       GROUP BY "contractorId","jobberUserId" HAVING count(*) > 1) x`
  );
  console.log(`  duplicate (contractorId, jobberUserId) rows: ${dupes[0].n}`);
  if (dupes[0].n !== 0) {
    console.log(`\n  ABORT — the compound unique would fail. Resolve the duplicates first.\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`  -> the compound UNIQUE is safe to create\n`);

  for (const i of INDEXES) {
    const existing: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='${i.name}'`
    );
    if (existing[0].n > 0) { console.log(`  present  ${i.name}`); continue; }
    if (!APPLY) { console.log(`  would    ${i.name}\n             ${i.why}`); continue; }
    await prisma.$executeRawUnsafe(i.sql);
    console.log(`  CREATED  ${i.name}\n             ${i.why}`);
  }

  // Verify from the catalog, not from the fact the statements ran.
  console.log(`\n  VERIFY — read back from pg_indexes`);
  let missing = 0;
  for (const i of INDEXES) {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='${i.name}'`
    );
    const ok = r[0].n === 1;
    if (!ok) missing++;
    console.log(`    ${ok ? "ok     " : "MISSING"} ${i.name}`);
  }

  console.log("\n" + "─".repeat(76));
  if (!APPLY) { console.log(`\n  Dry run.\n`); return; }
  if (missing) { console.log(`\n  ${missing} index(es) MISSING after apply.\n`); process.exitCode = 1; }
  else console.log(`\n  All ${INDEXES.length} indexes present.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
