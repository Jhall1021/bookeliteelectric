/**
 * The cutover baseline — ADR-013 Phase 4.
 *
 * Captured while writes are frozen and the two databases are identical, so
 * that afterwards it is possible to answer the only question a rollback
 * depends on: DID ANY LEGITIMATE PRODUCTION WRITE LAND ON PRICE2BOOK?
 *
 * Without this, "nothing has changed" is a belief. With it, it is a diff.
 *
 * Before unfreeze: BookElite and Price2Book are identical.
 * After unfreeze:  BookElite is a frozen snapshot, Price2Book is the system
 *                  of record — and the migration is committed the moment real
 *                  writes begin accumulating.
 *
 *   --capture <file>   write the baseline
 *   --since   <file>   report what has changed on the destination since
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();

/** Tables that carry real production activity, in the order a human reads them. */
const WATCH = [
  "visits", "line_items", "bookings", "quotes", "customers", "photos",
  "service_queries", "arrival_windows", "services", "contractors",
  "jobber_crew_members", "session", "verification",
];

type Snap = { takenAt: string; counts: Record<string, number>; maxIds: Record<string, string> };

async function snap(url: string): Promise<Snap> {
  const p = new PrismaClient({ datasources: { db: { url } } });
  const counts: Record<string, number> = {};
  const maxIds: Record<string, string> = {};
  for (const t of WATCH) {
    try {
      const c = (await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}"`)) as { n: number }[];
      counts[t] = c[0].n;
      // Highest id, so a new row shows up even if another was deleted and the
      // count happens to land back where it started.
      const m = (await p.$queryRawUnsafe(`SELECT COALESCE(max(id::text), '-') AS m FROM "${t}"`)) as { m: string }[];
      maxIds[t] = m[0].m;
    } catch { counts[t] = -1; maxIds[t] = "(absent)"; }
  }
  await p.$disconnect();
  return { takenAt: new Date().toISOString(), counts, maxIds };
}

async function main() {
  const i = process.argv.indexOf("--capture");
  const j = process.argv.indexOf("--since");
  const dest = process.env.DESTINATION_DATABASE_URL ?? process.env.DATABASE_URL!;

  if (i >= 0) {
    const file = process.argv[i + 1];
    const [src, dst] = await Promise.all([snap(process.env.DATABASE_URL!), snap(dest)]);
    writeFileSync(file, JSON.stringify({ source: src, destination: dst }, null, 2));
    const same = WATCH.every((t) => src.counts[t] === dst.counts[t]);
    console.log(`\nCUTOVER BASELINE -> ${file}`);
    for (const t of WATCH) {
      const eq = src.counts[t] === dst.counts[t];
      console.log(`  ${eq ? "ok  " : "DIFF"} ${t.padEnd(22)} source ${String(src.counts[t]).padStart(5)}   dest ${String(dst.counts[t]).padStart(5)}`);
    }
    console.log(same
      ? `\n  Identical at the cutover point. Safe to unfreeze.\n`
      : `\n  NOT identical — do not unfreeze until this is understood.\n`);
    process.exitCode = same ? 0 : 1;
    return;
  }

  if (j >= 0) {
    const base = JSON.parse(readFileSync(process.argv[j + 1], "utf8")) as { destination: Snap };
    const now = await snap(dest);
    console.log(`\nCHANGES ON THE DESTINATION SINCE ${base.destination.takenAt}\n`);
    let moved = 0;
    for (const t of WATCH) {
      const d = now.counts[t] - base.destination.counts[t];
      const newRow = now.maxIds[t] !== base.destination.maxIds[t];
      if (d === 0 && !newRow) continue;
      moved++;
      console.log(`  ${t.padEnd(22)} ${d >= 0 ? "+" : ""}${d}${newRow ? "   (highest id moved)" : ""}`);
    }
    console.log(moved === 0
      ? `  nothing has changed\n\n  No legitimate writes have landed. A rollback to the frozen\n  BookElite database needs no reconciliation.\n`
      : `\n  ${moved} table(s) changed. Any rollback MUST preserve or reconcile these\n  first — they exist only on Price2Book.\n`);
    return;
  }

  console.error("usage: cutover-baseline.ts --capture <file> | --since <file>");
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
