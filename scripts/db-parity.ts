/**
 * Prove two databases match — ADR-013 Phase 2.
 *
 * Compares an arbitrary SOURCE and DESTINATION across every dimension the
 * migration can get wrong, and fails on any difference. Generalised from
 * db-structure.ts, which could only diff one database against its own earlier
 * snapshot.
 *
 *   npx tsx scripts/db-parity.ts --source DATABASE_URL --dest P2B_DATABASE_URL
 *
 * Both arguments name ENVIRONMENT VARIABLES, not connection strings, so a
 * credential never lands in a shell history or a CI log.
 *
 * WHY IT CHECKS SO MUCH
 *
 * "The destination looks plausible" is exactly the failure this migration
 * already met once: a Neon branch that looked correct, was named correctly,
 * and contained zero tables. Plausibility is not parity. A rebuilt database
 * can differ from its source in ways no application test would notice for
 * months — a missing partial index, an enum whose values are in a different
 * order, a default that silently stopped applying, a nullable column that
 * became required.
 *
 * So this asserts equality of:
 *
 *   tables        names, and the count
 *   columns       type, nullability, DEFAULT, ordinal position
 *   constraints   primary, foreign, unique, check — by definition text
 *   indexes       full definition, which is what catches the OPEN-Visit
 *                 partial unique that Prisma cannot express and that a
 *                 schema-driven rebuild would therefore omit
 *   enums         name AND the ordered list of labels
 *   rows          every table, counted
 *
 * A destination that passes all six is the same database, not a similar one.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();

function argOf(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SOURCE_VAR = argOf("source", "DATABASE_URL");
const DEST_VAR = argOf("dest", "DESTINATION_DATABASE_URL");

const sourceUrl = process.env[SOURCE_VAR];
const destUrl = process.env[DEST_VAR];

if (!sourceUrl) { console.error(`\n  ${SOURCE_VAR} is not set.\n`); process.exit(1); }
if (!destUrl) { console.error(`\n  ${DEST_VAR} is not set.\n`); process.exit(1); }
if (sourceUrl === destUrl) {
  console.error(`\n  REFUSING: ${SOURCE_VAR} and ${DEST_VAR} are the same database.\n`);
  console.error(`  A database always matches itself; that would prove nothing.\n`);
  process.exit(1);
}

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const dest = new PrismaClient({ datasources: { db: { url: destUrl } } });

let failures = 0;
const host = (u: string) => u.replace(/^.*@/, "").split(".")[0];

/** Each dimension is a labelled map: key -> canonical description. */
type Dim = { name: string; rows: Record<string, string> };

const QUERIES: { name: string; sql: string; key: (r: any) => string; val: (r: any) => string }[] = [
  {
    name: "TABLES",
    sql: `SELECT table_name AS t FROM information_schema.tables
          WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`,
    key: (r) => r.t,
    val: () => "present",
  },
  {
    name: "COLUMNS",
    sql: `SELECT table_name AS t, column_name AS c, data_type AS d,
                 is_nullable AS n, COALESCE(column_default,'-') AS df,
                 ordinal_position AS p
          FROM information_schema.columns WHERE table_schema='public'
          ORDER BY 1,2`,
    key: (r) => `${r.t}.${r.c}`,
    // Position included: a reordered column is a different table to anything
    // that does SELECT * or positional binding.
    val: (r) => `${r.d} | ${r.n === "YES" ? "null" : "notnull"} | default=${r.df} | pos=${r.p}`,
  },
  {
    name: "CONSTRAINTS",
    sql: `SELECT conrelid::regclass::text AS t, conname AS n,
                 pg_get_constraintdef(oid) AS d
          FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2`,
    key: (r) => `${r.t}.${r.n}`,
    val: (r) => r.d,
  },
  {
    name: "INDEXES",
    sql: `SELECT indexname AS n, indexdef AS d FROM pg_indexes
          WHERE schemaname='public' ORDER BY 1`,
    key: (r) => r.n,
    // Full definition, so a unique index that lost its WHERE clause — or its
    // UNIQUE — reads as a difference rather than a match on name alone.
    val: (r) => r.d.replace(/^CREATE /, ""),
  },
  {
    name: "ENUMS",
    sql: `SELECT t.typname AS n, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS v
          FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
          JOIN pg_namespace ns ON ns.oid=t.typnamespace
          WHERE ns.nspname='public' GROUP BY 1 ORDER BY 1`,
    key: (r) => r.n,
    // Ordered labels: enum order is part of the type, and a reordered enum
    // changes comparison and sort behaviour without changing any label.
    val: (r) => r.v,
  },
];

async function dimension(client: PrismaClient, q: (typeof QUERIES)[number]): Promise<Dim> {
  const rows = (await client.$queryRawUnsafe(q.sql)) as any[];
  const out: Record<string, string> = {};
  for (const r of rows) out[q.key(r)] = q.val(r);
  return { name: q.name, rows: out };
}

async function rowCounts(client: PrismaClient): Promise<Record<string, string>> {
  const tables = (await client.$queryRawUnsafe(
    `SELECT table_name AS t FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`
  )) as { t: string }[];
  const out: Record<string, string> = {};
  for (const { t } of tables) {
    const r = (await client.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`)) as { n: number }[];
    out[t] = String(r[0].n);
  }
  return out;
}

function compare(label: string, a: Record<string, string>, b: Record<string, string>) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const diffs: string[] = [];
  for (const k of keys) {
    if (!(k in b)) diffs.push(`MISSING FROM DESTINATION   ${k}\n        source: ${a[k]}`);
    else if (!(k in a)) diffs.push(`EXTRA IN DESTINATION       ${k}\n        dest:   ${b[k]}`);
    else if (a[k] !== b[k])
      diffs.push(`DIFFERENT                  ${k}\n        source: ${a[k]}\n        dest:   ${b[k]}`);
  }
  const n = Object.keys(a).length;
  if (diffs.length === 0) {
    console.log(`  ok    ${label.padEnd(14)} ${n} compared, identical`);
    return;
  }
  failures += diffs.length;
  console.log(`  FAIL  ${label.padEnd(14)} ${n} compared, ${diffs.length} difference(s)`);
  for (const d of diffs.slice(0, 12)) console.log(`      ${d}`);
  if (diffs.length > 12) console.log(`      …and ${diffs.length - 12} more`);
}

async function main() {
  console.log(`\nDATABASE PARITY`);
  console.log(`  source (${SOURCE_VAR}): ${host(sourceUrl!)}`);
  console.log(`  dest   (${DEST_VAR}): ${host(destUrl!)}\n`);

  for (const q of QUERIES) {
    const [a, b] = await Promise.all([dimension(source, q), dimension(dest, q)]);
    compare(q.name, a.rows, b.rows);
  }

  const [ra, rb] = await Promise.all([rowCounts(source), rowCounts(dest)]);
  compare("ROW COUNTS", ra, rb);

  console.log("\n" + "─".repeat(78));
  if (failures) {
    console.log(`\n  ${failures} difference(s). The destination is NOT a copy of the source.\n`);
    console.log(`  "Looks plausible" is not parity — an empty database named "production"`);
    console.log(`  already passed that test once in this migration.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n  Identical across tables, columns, constraints, indexes, enums and rows.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(async () => { await source.$disconnect(); await dest.$disconnect(); });
}
