/**
 * Contract rehearsal — pass three.
 *
 * Runs the exact DDL the contract release will run, against real data, and
 * proves the resulting constraints actually reject what they are supposed to
 * reject. Then rolls the whole thing back.
 *
 * TWO MODES
 *
 *   --transactional   (default) Wrap everything in one transaction and ROLL
 *                     BACK at the end. Postgres DDL is transactional, so this
 *                     is safe to run against production: nothing survives.
 *                     What it proves: the DDL applies to the real data, and
 *                     every new constraint bites.
 *                     What it does NOT prove: that `prisma db push` produces
 *                     this DDL, or how it behaves.
 *
 *   --commit          Actually commit. Refuses to run unless
 *                     REHEARSAL_DATABASE_URL is set and is NOT the production
 *                     host, so this can only ever land on a clone/branch.
 *
 * The two are complementary. The transactional run is the one that can happen
 * immediately and against the real dataset; the committed run on a Neon branch
 * is the one that also exercises `prisma db push` end to end.
 *
 * ORDER MATTERS AND IS DELIBERATE
 *
 * The partial index is created AFTER the column changes, and asserted, rather
 * than assumed to survive them. A hand-made partial index was observed to
 * survive a no-op `db push`; nobody has shown it survives a push that alters
 * the same table, and this project does not run on "probably".
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const COMMIT = process.argv.includes("--commit");
const PROD_HOST = "ep-icy-hill-axkgrsjb";

const url = COMMIT ? process.env.REHEARSAL_DATABASE_URL : process.env.DATABASE_URL;
if (COMMIT) {
  if (!url) {
    console.error("\n  --commit needs REHEARSAL_DATABASE_URL (a Neon branch), not DATABASE_URL.\n");
    process.exit(1);
  }
  if (url.includes(PROD_HOST)) {
    console.error("\n  REFUSING: REHEARSAL_DATABASE_URL points at the production host.\n");
    process.exit(1);
  }
}

const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

let pass = 0, fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (cond) { pass++; console.log(`    ok   ${label}`); }
  else { fail++; console.log(`    FAIL ${label}${detail ? `\n           ${detail}` : ""}`); }
}

class Rollback extends Error {}

/** Columns contract makes NOT NULL, in the order the release applies them. */
const REQUIRE: [string, string][] = [
  ["Service", "services"],
  ["ServiceArea", "service_areas"],
  ["PricingSettings", "pricing_settings"],
  ["JobberConnection", "jobber_connections"],
  ["BusinessHours", "business_hours"],
  ["ContractorMaterialSettings", "contractor_material_settings"],
  ["Visit", "visits"],
  ["Customer", "customers"],
  ["Photo", "photos"],
  ["JobberCrewMember", "jobber_crew_members"],
];

const OPEN_VISIT_INDEX = "visits_open_per_contractor_session";
const ARRIVAL_UNIQUE = "arrival_windows_slot_unique";

async function rehearse(tx: PrismaClient) {
  const raw = (sql: string) => tx.$executeRawUnsafe(sql);
  const q = <T>(sql: string) => tx.$queryRawUnsafe(sql) as Promise<T>;

  // Never let the rehearsal sit on a lock against live traffic.
  await raw(`SET LOCAL lock_timeout = '5s'`);
  await raw(`SET LOCAL statement_timeout = '60s'`);

  console.log("\n  STEP 4a — require every ownership column");
  for (const [model, table] of REQUIRE) {
    await raw(`ALTER TABLE "${table}" ALTER COLUMN "contractorId" SET NOT NULL`);
    const r = await q<{ nullable: string }[]>(
      `SELECT is_nullable AS nullable FROM information_schema.columns
       WHERE table_name='${table}' AND column_name='contractorId'`
    );
    ok(r[0]?.nullable === "NO", `${model}.contractorId is NOT NULL`, `got ${r[0]?.nullable}`);
  }

  console.log("\n  STEP 4b — crew identity moves to the compound unique");
  await raw(`ALTER TABLE jobber_crew_members DROP CONSTRAINT IF EXISTS "jobber_crew_members_jobberUserId_key"`);
  await raw(`DROP INDEX IF EXISTS "jobber_crew_members_jobberUserId_key"`);
  {
    const r = await q<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_indexes
       WHERE tablename='jobber_crew_members' AND indexname='jobber_crew_members_jobberUserId_key'`
    );
    ok(r[0].n === 0, "the global jobberUserId unique is gone");
  }
  {
    const r = await q<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_indexes
       WHERE tablename='jobber_crew_members'
         AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%contractorId%' AND indexdef ILIKE '%jobberUserId%'`
    );
    ok(r[0].n === 1, "the compound (contractorId, jobberUserId) unique remains", `found ${r[0].n}`);
  }

  console.log("\n  STEP 4c — drop the dead columns");
  await raw(`ALTER TABLE photos DROP COLUMN IF EXISTS "bookingId"`);
  await raw(`ALTER TABLE visits DROP COLUMN IF EXISTS "customerId"`);
  for (const [table, col] of [["photos", "bookingId"], ["visits", "customerId"]]) {
    const r = await q<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name='${table}' AND column_name='${col}'`
    );
    ok(r[0].n === 0, `${table}.${col} is gone`);
  }

  console.log("\n  STEP 4d — ArrivalWindow uniqueness");
  await raw(
    `ALTER TABLE arrival_windows ADD CONSTRAINT "${ARRIVAL_UNIQUE}"
     UNIQUE (date, "startTime", "endTime", "serviceAreaId")`
  );
  {
    const r = await q<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_constraint WHERE conname='${ARRIVAL_UNIQUE}'`
    );
    ok(r[0].n === 1, "the ArrivalWindow slot unique exists");
  }

  console.log("\n  STEP 5 — the OPEN-visit partial unique, created and ASSERTED");
  await raw(
    `CREATE UNIQUE INDEX "${OPEN_VISIT_INDEX}" ON visits ("contractorId","sessionId")
     WHERE status = 'OPEN'`
  );
  {
    const r = await q<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE indexname='${OPEN_VISIT_INDEX}'`
    );
    ok(r.length === 1, "the partial index exists");
    ok(/WHERE \(?status/i.test(r[0]?.indexdef ?? ""),
       "and is genuinely PARTIAL — scoped to status = 'OPEN'",
       r[0]?.indexdef);
  }

  // ---- adversarial: do the new constraints actually reject? --------------
  //
  // SAVEPOINTS, not bare inserts. In Postgres a failed statement aborts the
  // enclosing transaction, so the first rejected insert would poison every
  // check after it — the previous version of this script proved exactly one
  // constraint and then died, which looked like a constraint failure and was
  // actually a harness failure. Each probe now runs inside its own savepoint
  // and is rolled back to it whether it succeeded or failed.
  console.log("\n  ADVERSARIAL — each new constraint must actually reject");

  const contractor = await q<{ id: string }[]>(`SELECT id FROM contractors LIMIT 1`);
  const cid = contractor[0].id;

  /** Run `sql`, expecting it to be REJECTED. Always leaves the tx usable. */
  const mustReject = async (label: string, setup: string[], offending: string) => {
    await raw(`SAVEPOINT probe`);
    let rejected = false;
    try {
      for (const st of setup) await raw(st);
      await raw(offending);
    } catch {
      rejected = true;
    }
    try { await raw(`ROLLBACK TO SAVEPOINT probe`); } catch { /* already unwound */ }
    ok(rejected, label);
  };

  await mustReject(
    "a SECOND OPEN visit for the same (contractor, session) is REJECTED",
    [`INSERT INTO visits (id,"contractorId","sessionId",status,"createdAt")
      VALUES ('__reh_v1__','${cid}','__reh_sess__','OPEN',now())`],
    `INSERT INTO visits (id,"contractorId","sessionId",status,"createdAt")
     VALUES ('__reh_v2__','${cid}','__reh_sess__','OPEN',now())`
  );

  // The same session with a CHECKED_OUT visit must still be allowed — the
  // constraint is partial, and proving it rejects is only half the claim.
  {
    await raw(`SAVEPOINT probe2`);
    let allowed = true;
    try {
      await raw(`INSERT INTO visits (id,"contractorId","sessionId",status,"createdAt")
                 VALUES ('__reh_v3__','${cid}','__reh_sess2__','OPEN',now())`);
      await raw(`INSERT INTO visits (id,"contractorId","sessionId",status,"createdAt")
                 VALUES ('__reh_v4__','${cid}','__reh_sess2__','CHECKED_OUT',now())`);
      await raw(`INSERT INTO visits (id,"contractorId","sessionId",status,"createdAt")
                 VALUES ('__reh_v5__','${cid}','__reh_sess2__','CHECKED_OUT',now())`);
    } catch { allowed = false; }
    try { await raw(`ROLLBACK TO SAVEPOINT probe2`); } catch {}
    ok(allowed,
       "but MANY CHECKED_OUT visits on that same session are still allowed",
       "the partial index must not constrain historical visits");
  }

  {
    const area = await q<{ id: string }[]>(`SELECT id FROM service_areas LIMIT 1`);
    const aid = area[0].id;
    await mustReject(
      "a DUPLICATE ArrivalWindow slot is REJECTED",
      [`INSERT INTO arrival_windows (id,date,"startTime","endTime","serviceAreaId","capacityTotal","capacityBooked")
        VALUES ('__reh_w1__','2031-01-01','8:00 AM','11:00 AM','${aid}',4,0)`],
      `INSERT INTO arrival_windows (id,date,"startTime","endTime","serviceAreaId","capacityTotal","capacityBooked")
       VALUES ('__reh_w2__','2031-01-01','8:00 AM','11:00 AM','${aid}',4,0)`
    );
  }

  await mustReject(
    "a DUPLICATE (contractorId, jobberUserId) crew row is REJECTED",
    [`INSERT INTO jobber_crew_members (id,"contractorId","jobberUserId",name,"eligibleForWebsiteBookings","lastSyncedAt")
      VALUES ('__reh_c1__','${cid}','__reh_user__','probe',false,now())`],
    `INSERT INTO jobber_crew_members (id,"contractorId","jobberUserId",name,"eligibleForWebsiteBookings","lastSyncedAt")
     VALUES ('__reh_c2__','${cid}','__reh_user__','probe2',false,now())`
  );

  // The same Jobber user id under a DIFFERENT contractor must now be allowed —
  // that is the whole point of dropping the global unique.
  {
    const other = await q<{ id: string }[]>(
      `INSERT INTO contractors (id,slug,name,"createdAt","updatedAt")
       VALUES ('__reh_contractor__','__reh_slug__','Rehearsal probe',now(),now())
       RETURNING id`
    );
    await raw(`SAVEPOINT probe3`);
    let allowed = true;
    try {
      await raw(`INSERT INTO jobber_crew_members (id,"contractorId","jobberUserId",name,"eligibleForWebsiteBookings","lastSyncedAt")
                 VALUES ('__reh_c3__','${cid}','__reh_shared__','A',false,now())`);
      await raw(`INSERT INTO jobber_crew_members (id,"contractorId","jobberUserId",name,"eligibleForWebsiteBookings","lastSyncedAt")
                 VALUES ('__reh_c4__','${other[0].id}','__reh_shared__','B',false,now())`);
    } catch { allowed = false; }
    try { await raw(`ROLLBACK TO SAVEPOINT probe3`); } catch {}
    ok(allowed,
       "TWO contractors may now hold the SAME Jobber user id",
       "this is what dropping the global unique is for");
  }

  console.log("\n  (constraints still present after the adversarial probes)");
  {
    const r = await q<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='${OPEN_VISIT_INDEX}'`
    );
    ok(r[0].n === 1, "partial index intact");
    const c = await q<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_constraint WHERE conname='${ARRIVAL_UNIQUE}'`
    );
    ok(c[0].n === 1, "ArrivalWindow unique intact");
  }

  throw new Rollback();
}

async function main() {
  const target = (url ?? "").replace(/^.*@/, "").split("/")[0];
  console.log(`\nCONTRACT REHEARSAL — pass three`);
  console.log(`  mode:   ${COMMIT ? "COMMIT (clone only)" : "TRANSACTIONAL — everything rolls back"}`);
  console.log(`  target: ${target}`);

  if (COMMIT) {
    console.log(`\n  --commit is for a Neon branch and runs the real sequence.`);
    console.log(`  Not implemented as a rollback; run the release steps directly.\n`);
    process.exit(1);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await rehearse(tx as unknown as PrismaClient);
    }, { timeout: 120_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) {
      console.error(`\n  REHEARSAL ERROR:`, (e as Error).message.split("\n").slice(0, 4).join("\n  "));
      fail++;
    }
  }

  // Prove nothing survived.
  console.log("\n  ROLLBACK — production must be exactly as it was");
  {
    const r: { nullable: string }[] = await prisma.$queryRawUnsafe(
      `SELECT is_nullable AS nullable FROM information_schema.columns
       WHERE table_name='visits' AND column_name='contractorId'`
    );
    ok(r[0]?.nullable === "YES", "Visit.contractorId is nullable again");
  }
  {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name='photos' AND column_name='bookingId'`
    );
    ok(r[0].n === 1, "Photo.bookingId still exists");
  }
  {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname='${OPEN_VISIT_INDEX}'`
    );
    ok(r[0].n === 0, "the partial index did not survive");
  }
  {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_indexes
       WHERE indexname='jobber_crew_members_jobberUserId_key'`
    );
    ok(r[0].n === 1, "the global crew unique is back");
  }
  {
    const r: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM visits WHERE id LIKE '__reh_%'`
    );
    ok(r[0].n === 0, "no rehearsal probe visits remain");
    const c: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM contractors WHERE id LIKE '__reh_%'`
    );
    ok(c[0].n === 0, "no rehearsal probe contractor remains");
    const w: { n: number }[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM jobber_crew_members WHERE id LIKE '__reh_%'`
    );
    ok(w[0].n === 0, "no rehearsal probe crew rows remain");
  }

  console.log("\n" + "─".repeat(76));
  console.log(fail === 0
    ? `\n  ${pass} checks passed. The DDL applies cleanly and every constraint bites.\n`
    : `\n  ${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
