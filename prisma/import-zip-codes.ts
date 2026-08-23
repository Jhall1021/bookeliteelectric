/**
 * Import the ZIP code reference table.
 *
 *   npx tsx prisma/import-zip-codes.ts path/to/zips.csv
 *   npx tsx prisma/import-zip-codes.ts path/to/zips.csv --state NJ
 *
 * This is reference data, not configuration — the whole table of ZIPs with
 * their town, county and state. A contractor then selects counties from it.
 *
 * WHY IMPORTED RATHER THAN SEEDED
 *
 * There are ~42,000 ZIP codes in the US and 721 in New Jersey alone. Hardcoding
 * even one state means a code change every time a contractor in another one
 * signs up, and it means this file goes stale silently — ZIPs are added and
 * retired every year.
 *
 * COLUMN NAMES
 *
 * Deliberately forgiving, because every ZIP dataset names its columns
 * differently. It looks for something like zip, city, county, state and type
 * in the header, in any order and any capitalisation. If it can't find the
 * first four it says so rather than importing nonsense.
 *
 * ON THE SOURCE FILE
 *
 * The CSV is NOT committed to the repo, and shouldn't be. Every usable ZIP
 * dataset is licensed for application use rather than redistribution — you
 * may load it into your own database and power your own product with it, but
 * shipping the file itself in a public repository is a different act with
 * different terms.
 *
 * So: import once into the database that serves the admin, keep this script
 * in the repo, leave the CSV out of it. After that, territory changes happen
 * by ticking counties in the admin — the reference table doesn't need
 * touching again.
 *
 * WHICH DATABASE
 *
 * Whichever DATABASE_URL points at. For Elite that's the production Neon
 * instance, the same one every other seed has been run against — so running
 * this locally does populate the live admin. Worth being deliberate about
 * rather than assuming.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

/** Split a CSV line, respecting quoted fields containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim().replace(/^"|"$/g, ""));
}

/** Find a column by any of several likely names. */
function findColumn(header: string[], candidates: string[]): number {
  const norm = header.map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  for (const c of candidates) {
    const i = norm.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

/** Normalise whatever the source calls a ZIP classification. */
function normaliseType(raw: string): string {
  const v = raw.toLowerCase();
  if (v.includes("po") && v.includes("box")) return "PO_BOX";
  if (v.includes("unique")) return "UNIQUE";
  if (v.includes("military") || v.includes("apo") || v.includes("fpo")) return "MILITARY";
  return "STANDARD";
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("\nUsage: npx tsx prisma/import-zip-codes.ts <file.csv> [--state NJ]\n");
    process.exit(1);
  }
  const stateFilterIdx = process.argv.indexOf("--state");
  const stateFilter =
    stateFilterIdx >= 0 ? process.argv[stateFilterIdx + 1]?.toUpperCase() : null;

  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error("That file has no rows.");
    process.exit(1);
  }

  const header = splitCsvLine(lines[0]);
  const cols = {
    zip: findColumn(header, ["zip", "zipcode", "zipcodes", "postalcode", "code"]),
    city: findColumn(header, ["city", "cityname", "primarycity", "town", "place"]),
    county: findColumn(header, ["county", "countyname", "countyfips"]),
    state: findColumn(header, ["state", "statecode", "stateabbr", "stateid"]),
    type: findColumn(header, ["type", "zipcodetype", "classification", "class"]),
    population: findColumn(header, ["population", "pop", "irs_estimated_population"]),
  };

  const missing = (["zip", "city", "county", "state"] as const).filter((k) => cols[k] < 0);
  if (missing.length) {
    console.error(`\nCouldn't find these columns: ${missing.join(", ")}`);
    console.error(`The file's header is: ${header.join(", ")}\n`);
    console.error(`Rename them, or use a dataset with zip, city, county and state.\n`);
    process.exit(1);
  }

  console.log(`\nReading ${file}`);
  console.log(`  ${lines.length - 1} row(s)${stateFilter ? `, keeping ${stateFilter}` : ""}\n`);

  const rows: {
    zip: string; city: string; county: string; state: string;
    type: string; population: number | null;
  }[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line);
    const zip = (f[cols.zip] ?? "").padStart(5, "0").slice(0, 5);
    if (!/^\d{5}$/.test(zip)) {
      skipped++;
      continue;
    }
    const state = (f[cols.state] ?? "").toUpperCase().slice(0, 2);
    if (stateFilter && state !== stateFilter) continue;
    // A ZIP can appear more than once when it straddles counties. First wins,
    // which matches how the source pages present a primary county.
    if (seen.has(zip)) continue;
    seen.add(zip);

    const popRaw = cols.population >= 0 ? f[cols.population]?.replace(/[^\d]/g, "") : "";
    rows.push({
      zip,
      city: f[cols.city] ?? "",
      // "Monmouth County" and "Monmouth" should not be two counties.
      county: (f[cols.county] ?? "").replace(/\s+county$/i, "").trim(),
      state,
      type: cols.type >= 0 ? normaliseType(f[cols.type] ?? "") : "STANDARD",
      population: popRaw ? parseInt(popRaw, 10) : null,
    });
  }

  if (rows.length === 0) {
    console.error("Nothing to import — check the state filter and the file.\n");
    process.exit(1);
  }

  // Chunked, because a single createMany of 42,000 rows times out.
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((r) =>
        prisma.zipCode.upsert({ where: { zip: r.zip }, update: r, create: r })
      )
    );
    written += chunk.length;
    process.stdout.write(`\r  imported ${written} of ${rows.length}`);
  }
  console.log();

  const byState = new Map<string, number>();
  for (const r of rows) byState.set(r.state, (byState.get(r.state) ?? 0) + 1);
  const counties = new Set(rows.map((r) => `${r.state}/${r.county}`));

  console.log(`\n  ${written} ZIP codes across ${counties.size} counties`);
  for (const [st, n] of [...byState].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`      ${st}  ${n}`);
  }
  if (skipped) console.log(`\n  ${skipped} row(s) skipped — no valid five-digit ZIP.`);

  // What the admin will actually show, from the database rather than from
  // the file — so a partial import or a column mismatch is visible here
  // instead of being discovered as a missing county later.
  const inDb = await prisma.zipCode.groupBy({
    by: ["state", "county"],
    _count: { zip: true },
    orderBy: [{ state: "asc" }, { county: "asc" }],
  });
  const byStateInDb = new Map<string, number>();
  for (const g of inDb) byStateInDb.set(g.state, (byStateInDb.get(g.state) ?? 0) + 1);

  console.log(`\n  The admin county selector will now show:\n`);
  for (const [st, n] of [...byStateInDb].sort()) {
    console.log(`      ${st}: ${n} counties`);
    if (n <= 25) {
      const names = inDb.filter((g) => g.state === st).map((g) => g.county);
      for (let i = 0; i < names.length; i += 4) {
        console.log(`          ${names.slice(i, i + 4).join(" · ")}`);
      }
    }
  }

  console.log(`\n  ServiceArea is unchanged — this is reference data, not the`);
  console.log(`  allowlist. Pick counties at /admin/service-area.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
