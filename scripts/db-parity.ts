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

/** Each dimension is a labeled map: key -> canonical description. */
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
    // changes comparison and sort behavior without changing any label.
    val: (r) => r.v,
  },
];

/**
 * Physical column slots dropped before each live column, per table.
 *
 * Postgres never renumbers `pg_attribute.attnum`: dropping a column leaves a
 * permanent hole and every later column keeps its original slot. A dump and
 * restore rebuilds the table contiguously, so a FAITHFUL copy of a table that
 * has ever had a column dropped legitimately reports lower ordinal positions.
 *
 * That is the only ordinal divergence tolerated, and it is COMPUTED rather
 * than waved through: the exemption applies to a column only when the source
 * position minus the holes before it equals the destination position exactly.
 * A genuinely reordered table still fails, because no number of holes explains
 * a swap.
 */
async function droppedBefore(client: PrismaClient): Promise<Record<string, number>> {
  const rows = (await client.$queryRawUnsafe(
    `SELECT c.relname AS t, a.attnum, a.attname, a.attisdropped
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0
     ORDER BY c.relname, a.attnum`
  )) as { t: string; attnum: number; attname: string; attisdropped: boolean }[];

  const out: Record<string, number> = {};
  const holes: Record<string, number> = {};
  for (const r of rows) {
    if (r.attisdropped) { holes[r.t] = (holes[r.t] ?? 0) + 1; continue; }
    out[`${r.t}.${r.attname}`] = holes[r.t] ?? 0;
  }
  return out;
}

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

/** True only when the ONLY difference is a position shift equal to the holes. */
function explainedByDroppedColumns(
  key: string,
  sourceVal: string,
  destVal: string,
  holes: Record<string, number>
): boolean {
  const m = /^(.*) \| pos=(\d+)$/.exec(sourceVal);
  const n = /^(.*) \| pos=(\d+)$/.exec(destVal);
  if (!m || !n) return false;
  // Everything except position must be byte-identical.
  if (m[1] !== n[1]) return false;
  const gap = holes[key];
  if (gap === undefined || gap === 0) return false;
  return Number(m[2]) - gap === Number(n[2]);
}

/**
 * A checksum of every row in every table.
 *
 * Row COUNTS prove the right number of rows arrived; they say nothing about
 * whether the values in them survived. A copy that silently truncated a text
 * column, shifted a timestamp's timezone, or rounded a numeric would pass a
 * count check unchanged — and none of the structural dimensions would notice
 * either, because the structure would be perfect.
 *
 * Each row is cast to text and the sorted set hashed, so the result is
 * independent of physical row order (which a dump/restore never preserves and
 * which carries no meaning in a relational table).
 *
 * `database_identity` is excluded BY DESIGN and is the only exclusion: it is
 * the one table the two databases are supposed to disagree about, because a
 * copy that still claimed its parent's identity would be the dangerous case
 * this whole marker exists to catch.
 */
const CONTENT_EXCLUDED = new Set(["database_identity"]);

async function contentHashes(client: PrismaClient): Promise<Record<string, string>> {
  const tables = (await client.$queryRawUnsafe(
    `SELECT table_name AS t FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`
  )) as { t: string }[];
  const out: Record<string, string> = {};
  for (const { t } of tables) {
    if (CONTENT_EXCLUDED.has(t)) { out[t] = "(excluded: identity is meant to differ)"; continue; }
    const r = (await client.$queryRawUnsafe(
      `SELECT COALESCE(md5(string_agg(x, '' ORDER BY x)), 'empty') AS h
       FROM (SELECT t::text AS x FROM "${t}" t) s`
    )) as { h: string }[];
    out[t] = r[0].h;
  }
  return out;
}

function compare(
  label: string,
  a: Record<string, string>,
  b: Record<string, string>,
  holes?: Record<string, number>
) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const diffs: string[] = [];
  let exempt = 0;
  for (const k of keys) {
    if (!(k in b)) diffs.push(`MISSING FROM DESTINATION   ${k}\n        source: ${a[k]}`);
    else if (!(k in a)) diffs.push(`EXTRA IN DESTINATION       ${k}\n        dest:   ${b[k]}`);
    else if (a[k] !== b[k]) {
      if (holes && explainedByDroppedColumns(k, a[k], b[k], holes)) { exempt++; continue; }
      diffs.push(`DIFFERENT                  ${k}\n        source: ${a[k]}\n        dest:   ${b[k]}`);
    }
  }
  if (exempt) {
    console.log(`  note  ${exempt} column(s) sit lower in the destination purely because the`);
    console.log(`        source carries dropped-column holes a dump/restore cannot reproduce.`);
    console.log(`        Type, nullability and default identical; shift equals the hole count.`);
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

  const holes = await droppedBefore(source);

  for (const q of QUERIES) {
    const [a, b] = await Promise.all([dimension(source, q), dimension(dest, q)]);
    compare(q.name, a.rows, b.rows, q.name === "COLUMNS" ? holes : undefined);
  }

  const [ra, rb] = await Promise.all([rowCounts(source), rowCounts(dest)]);
  compare("ROW COUNTS", ra, rb);

  const [ca, cb] = await Promise.all([contentHashes(source), contentHashes(dest)]);
  compare("CONTENT", ca, cb);

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
