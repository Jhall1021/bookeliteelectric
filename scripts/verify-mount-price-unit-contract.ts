/**
 * Traces the two TV-mount seed literals (`tilt-tv-mount`,
 * `articulating-tv-mount`) through the ACTUAL code that writes and
 * displays a price, to settle what `basePrice: 125` / `basePrice: 200` in
 * prisma/seed.ts's CATALOG literal were meant to mean.
 *
 * DB-free. Imports the real, unmodified functions — it does not reimplement
 * or re-type any of them:
 *
 *   - `c` and `CATALOG` from prisma/seed.ts — the exact conversion function
 *     and the exact literal, not a copy of either.
 *   - `formatCents` from lib/flow-types.ts — the function every customer-
 *     facing price actually renders through (via lib/servicePricingSummary.ts).
 *
 * WHAT THIS PROVES: the seed literal's `basePrice`/`whileWeThereBasePrice`
 * fields are DOLLARS (matching SeedService's own `// dollars` comment) that
 * get Math.round(dollars * 100)'d into cents at row-creation time, and that
 * round-trips back through the real display formatter to the same dollar
 * figure. That is the code-traced, intended relationship for these two
 * literals: 125 -> $125.00, 200 -> $200.00 — not $1.25/$2.00, and not a
 * pre-cents-convention literal needing a manual multiply.
 *
 * WHAT THIS DOES NOT PROVE: what is currently stored in any real database.
 * prisma/seed.ts's own upsert only writes `basePrice` on CREATE (`update: {}`
 * on an existing row) — so this literal has only ever been written once, if
 * at all, on whichever database first created these two rows. Since then,
 * `scripts/complete-mount-labor-inputs.ts`, a contractor's own price
 * approval, or `scripts/republish-legacy-approved-prices.ts` could each have
 * changed it. This script has no database connection and asserts nothing
 * about a live value — that stays explicitly unverified until a
 * tenant-scoped database read is available.
 */

import { c, CATALOG } from "../prisma/seed";
import { formatCents } from "../lib/flow-types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function findService(slug: string) {
  for (const cat of CATALOG) {
    const svc = cat.services.find((s) => s.slug === slug);
    if (svc) return svc;
  }
  return undefined;
}

console.log("\nMOUNT PRICE-UNIT CONTRACT — traced through prisma/seed.ts + lib/flow-types.ts\n");

const MOUNTS = [
  { slug: "tilt-tv-mount", expectDollars: 125 },
  { slug: "articulating-tv-mount", expectDollars: 200 },
];

for (const m of MOUNTS) {
  const svc = findService(m.slug);
  check(`${m.slug} is present in CATALOG`, !!svc);
  if (!svc) continue;

  // 1. The literal itself, read from the real array — not retyped.
  check(
    `${m.slug}: literal basePrice is ${m.expectDollars} (dollars, per SeedService's own comment)`,
    svc.basePrice === m.expectDollars,
    `got ${svc.basePrice}`
  );
  check(
    `${m.slug}: literal whileWeThereBasePrice matches basePrice`,
    svc.whileWeThereBasePrice === svc.basePrice
  );

  // 2. The REAL conversion the create-time writer applies
  //    (prisma/seed.ts: `basePrice: svc.basePrice ? c(svc.basePrice) : null`).
  const writtenCents = c(svc.basePrice!);
  check(
    `${m.slug}: c(${svc.basePrice}) writes ${m.expectDollars * 100} cents, not ${m.expectDollars} cents`,
    writtenCents === m.expectDollars * 100,
    `got ${writtenCents}`
  );
  // Guards against the two wrong readings this task explicitly warns against:
  check(`${m.slug}: c() output is NOT the raw literal treated as already-cents`, writtenCents !== svc.basePrice);
  check(`${m.slug}: c() output is NOT the literal x1 (i.e. cents-as-dollars, $${svc.basePrice! / 100})`, writtenCents !== svc.basePrice! * 1);

  // 3. The REAL customer-facing formatter, round-tripped back to dollars.
  const displayed = formatCents(writtenCents);
  check(
    `${m.slug}: formatCents(${writtenCents}) displays "$${m.expectDollars}", round-tripping to the original literal`,
    displayed === `$${m.expectDollars}`,
    `got ${displayed}`
  );
}

console.log(`\n${passed} passed, ${failed} failed.`);
console.log(
  `\nThis settles the INTENDED unit contract for these two literals. It does NOT verify what is\n` +
    `currently stored for either service in any real database — that requires a tenant-scoped\n` +
    `database read, not present here, and is not inferred from this result.\n`
);
if (failed) process.exit(1);
