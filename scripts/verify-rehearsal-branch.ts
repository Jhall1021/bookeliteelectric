/**
 * The rehearsal branch must actually mirror production.
 *
 * WHY THIS EXISTS
 *
 * A branch was created for the contract rehearsal and it was EMPTY — zero
 * tables. It had been pinned to a point in time before the schema existed,
 * and it lived in a Neon project that was not the one production runs on at
 * all. Nothing would have caught that: the rehearsal's only safety check was
 * "the URL is not the production host", which an empty branch passes
 * trivially.
 *
 * A rehearsal against an empty database does not fail — it SUCCEEDS,
 * vacuously. `db push` creates every table from scratch, the contracted
 * columns are all NOT NULL because there are no rows to violate anything, and
 * every constraint applies cleanly because there is no data. It would have
 * reported a clean rehearsal and proven nothing whatsoever.
 *
 * That is the worst failure mode available to a verification step: not a
 * false alarm, but a confident all-clear. So before rehearsing anything, prove
 * the branch is a real copy of the thing being rehearsed.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();

const branchUrl = process.env.REHEARSAL_DATABASE_URL;
const prodUrl = process.env.DATABASE_URL;

if (!branchUrl) {
  console.error("\n  REHEARSAL_DATABASE_URL is not set.\n");
  process.exit(1);
}
if (!prodUrl) {
  console.error("\n  DATABASE_URL is not set — nothing to compare the branch against.\n");
  process.exit(1);
}
if (branchUrl === prodUrl) {
  console.error("\n  REFUSING: REHEARSAL_DATABASE_URL and DATABASE_URL are the same database.\n");
  process.exit(1);
}

const branch = new PrismaClient({ datasources: { db: { url: branchUrl } } });
const prod = new PrismaClient({ datasources: { db: { url: prodUrl } } });

let fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (cond) console.log(`    ok   ${label}`);
  else { fail++; console.log(`    FAIL ${label}${detail ? `\n           ${detail}` : ""}`); }
}

/** Row counts that would make a vacuous rehearsal obvious. */
const PROFILE = [
  "contractors", "services", "visits", "line_items", "customers",
  "photos", "jobber_crew_members", "bookings", "quotes", "arrival_windows",
];

async function profile(p: PrismaClient) {
  const tables: { n: number }[] = await p.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`
  );
  const indexes: { n: number }[] = await p.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public'`
  );
  const rows: Record<string, number> = {};
  for (const t of PROFILE) {
    try {
      const r: { n: number }[] = await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`);
      rows[t] = r[0].n;
    } catch { rows[t] = -1; }
  }
  return { tables: tables[0].n, indexes: indexes[0].n, rows };
}

async function main() {
  const host = (u: string) => u.replace(/^.*@/, "").split(".")[0];
  console.log(`\nREHEARSAL BRANCH FITNESS`);
  console.log(`  branch:     ${host(branchUrl!)}`);
  console.log(`  production: ${host(prodUrl!)}\n`);

  const [b, p] = await Promise.all([profile(branch), profile(prod)]);

  console.log("  STRUCTURE");
  ok(b.tables > 0, "the branch has tables at all", `found ${b.tables}`);
  ok(b.tables === p.tables,
     `table count matches production (${p.tables})`, `branch has ${b.tables}`);
  ok(b.indexes === p.indexes,
     `index count matches production (${p.indexes})`, `branch has ${b.indexes}`);

  console.log("\n  DATA — a rehearsal on an empty copy proves nothing");
  let mismatched = 0;
  for (const t of PROFILE) {
    const same = b.rows[t] === p.rows[t];
    if (!same) mismatched++;
    console.log(
      `    ${same ? "ok  " : "FAIL"} ${t.padEnd(22)} branch ${String(b.rows[t]).padStart(5)}` +
      `   production ${String(p.rows[t]).padStart(5)}`
    );
  }
  if (mismatched) fail++;

  const anyRows = Object.values(b.rows).some((n) => n > 0);
  ok(anyRows, "the branch actually contains rows");

  console.log("\n" + "─".repeat(76));
  if (fail) {
    console.log(`\n  The branch is NOT a usable copy of production. Do not rehearse against it.\n`);
    console.log(`  A rehearsal on an empty or divergent branch does not fail — it passes`);
    console.log(`  vacuously, and reports a clean result that means nothing.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n  The branch mirrors production. Safe to rehearse.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(async () => { await branch.$disconnect(); await prod.$disconnect(); });
}
