/**
 * Assert a database is in the CONTRACTED state.
 *
 * Reads the database catalog, never schema.prisma. The whole reason this
 * exists is that the schema file and the database disagreed once already and
 * nothing compared them.
 *
 * Runs against the Neon branch during rehearsal (--rehearsal) and against
 * production during the real release, unchanged.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();

const useRehearsal = process.argv.includes("--rehearsal");
const url = useRehearsal ? process.env.REHEARSAL_DATABASE_URL : process.env.DATABASE_URL;
if (useRehearsal && !url) {
  console.error("\n  REHEARSAL_DATABASE_URL is not set.\n");
  process.exit(1);
}
const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

let pass = 0, fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (cond) { pass++; console.log(`    ok   ${label}`); }
  else { fail++; console.log(`    FAIL ${label}${detail ? `\n           ${detail}` : ""}`); }
}

const REQUIRED_OWNER_TABLES = [
  "services", "service_areas", "pricing_settings", "jobber_connections",
  "business_hours", "contractor_material_settings", "visits", "customers",
  "photos", "jobber_crew_members",
];

const REQUIRED_INDEXES = [
  "services_contractorId_idx", "service_areas_contractorId_idx",
  "visits_contractorId_sessionId_status_idx", "customers_contractorId_idx",
  "photos_contractorId_idx", "arrival_windows_serviceAreaId_idx",
  "jobber_crew_members_contractorId_idx", "questions_serviceId_idx",
  "answer_options_questionId_idx", "line_items_visitId_idx", "quotes_serviceId_idx",
];

const OPEN_VISIT_INDEX = "visits_open_per_contractor_session";

async function main() {
  const host = (url ?? "").replace(/^.*@/, "").split("/")[0];
  console.log(`\nCONTRACTED STATE — verified against the database catalog`);
  console.log(`  target: ${host}\n`);

  console.log("  1. all ten contractorId columns are NOT NULL");
  for (const t of REQUIRED_OWNER_TABLES) {
    const r: { n: string }[] = await prisma.$queryRawUnsafe(
      `SELECT is_nullable AS n FROM information_schema.columns
       WHERE table_name='${t}' AND column_name='contractorId'`
    );
    ok(r[0]?.n === "NO", `${t}.contractorId NOT NULL`, `got ${r[0]?.n ?? "column missing"}`);
  }

  console.log("\n  2. every required tenant index exists");
  for (const i of REQUIRED_INDEXES) {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='${i}'`
    );
    ok(r[0].n === 1, i);
  }

  console.log("\n  3. crew identity");
  {
    const c: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_indexes
       WHERE tablename='jobber_crew_members' AND indexdef ILIKE '%UNIQUE%'
         AND indexdef ILIKE '%contractorId%' AND indexdef ILIKE '%jobberUserId%'`
    );
    ok(c[0].n === 1, "(contractorId, jobberUserId) UNIQUE exists");
    const g: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_indexes
       WHERE tablename='jobber_crew_members' AND indexdef ILIKE '%UNIQUE%'
         AND indexdef ILIKE '%jobberUserId%' AND indexdef NOT ILIKE '%contractorId%'`
    );
    ok(g[0].n === 0, "the old GLOBAL jobberUserId unique is gone", `found ${g[0].n}`);
  }

  console.log("\n  4. the OPEN-visit partial unique");
  {
    const r: { indexdef: string }[] = await prisma.$queryRawUnsafe(
      `SELECT indexdef FROM pg_indexes WHERE indexname='${OPEN_VISIT_INDEX}'`
    );
    ok(r.length === 1, "the partial index exists");
    ok(/UNIQUE/i.test(r[0]?.indexdef ?? ""), "and is UNIQUE");
    ok(/WHERE \(?status/i.test(r[0]?.indexdef ?? ""),
       "and is genuinely PARTIAL — scoped to status = 'OPEN'", r[0]?.indexdef);
  }

  console.log("\n  5. ArrivalWindow uniqueness");
  {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_indexes
       WHERE tablename='arrival_windows' AND indexdef ILIKE '%UNIQUE%'
         AND indexdef ILIKE '%startTime%' AND indexdef ILIKE '%serviceAreaId%'`
    );
    ok(r[0].n === 1, "the slot uniqueness exists");
  }

  console.log("\n  6. dead columns are absent");
  for (const [t, c] of [["photos", "bookingId"], ["visits", "customerId"]]) {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name='${t}' AND column_name='${c}'`
    );
    ok(r[0].n === 0, `${t}.${c} is gone`);
  }

  console.log("\n" + "─".repeat(76));
  console.log(fail === 0
    ? `\n  ${pass} checks passed. The database is in the contracted state.\n`
    : `\n  ${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
