/**
 * The deliberately-production-targeted entry point for the Electrical
 * catalog/schema release — separate from scripts/init-preview-database.ts
 * ON PURPOSE. That script's own identity guard (`decideRemoteTarget`)
 * refuses outright the moment a target's endpoint equals production's
 * own — by design, "this script never writes there under any flag."
 * This script is the other side of that same line: it refuses to run
 * against anything EXCEPT the verified production identity, and never
 * restamps it (the inherited `database_identity` marker is read, never
 * written, exactly as `init-preview-database.ts`'s own remote path
 * already does for a Preview branch).
 *
 *   REPORT ONLY (always safe, no writes):
 *     npx tsx scripts/release-electrical-catalog-to-production.ts \
 *       --target-url "$PRODUCTION_DATABASE_URL" \
 *       --expect-identity-key price2book-production
 *
 *   APPLY (writes Elite's electrical catalog; requires an owned recovery
 *   point acknowledged first — see PREFLIGHT step 5 below):
 *     npx tsx scripts/release-electrical-catalog-to-production.ts \
 *       --target-url "$PRODUCTION_DATABASE_URL" \
 *       --expect-identity-key price2book-production \
 *       --recovery-point-confirmed <neon-branch-id-or-PITR-timestamp> \
 *       --i-confirm-this-is-production \
 *       --apply
 *
 * WHAT THIS DOES, IN ORDER
 *
 *   1. Read-only identity check: the target's own `database_identity`
 *      marker must already carry the key named by --expect-identity-key.
 *      Never stamps one — an unmarked target is refused, not adopted.
 *   2. Read-only active-business check: refuses if Elite already has any
 *      real Booking or Quote row. "No active contractors; disposable
 *      business data may be rebuilt" is this run's own explicit
 *      authorization for a specific moment, not a standing exemption —
 *      this checks it is STILL true against the actual target, rather
 *      than trusting a claim made before this exact run.
 *   3. Read-only schema-sync check (`prisma migrate diff`): refuses on
 *      ANY pending diff, expected or not — a real schema gap should be
 *      resolved deliberately, never masked by proceeding anyway.
 *   4. `services_price_requires_approval` installed, idempotently, if
 *      absent (scripts/install-price-approval-constraint.ts) — BEFORE
 *      construction runs, closing the exact gap that broke the first
 *      Preview attempt (see docs/design/electrical-preview-
 *      initialization.md §16). Never dropped, never weakened.
 *   5. Recovery-point acknowledgment: refuses --apply without
 *      --recovery-point-confirmed. This script cannot create a Neon
 *      branch or snapshot itself (a separate infrastructure write this
 *      preparation slice does not authorize) — it prints the exact
 *      command and requires the operator's own confirmation that they
 *      ran it, so there is always a concrete, owned rollback point
 *      before step 6.
 *   6. `rebuildElectricalCatalog(targetUrl)` — the SAME accepted function
 *      scripts/init-preview-database.ts already exports and this repo's
 *      own local rehearsals already proved end to end (82/82 services,
 *      clean retry, guard enforced) — reused verbatim, not reimplemented
 *      for production.
 *
 * SCOPE, ALREADY PROVEN BY THE FUNCTION THIS CALLS (not re-derived here):
 * `resetElectricalTemplateTree` only ever deletes TemplateVersion rows
 * where trade = "electrical" — Plumbing/HVAC template trees are never
 * touched. `resetEliteSourceData` is scoped to the ONE contractor slug
 * "elite-electric" — no other contractor's Service/Quote/LineItem rows,
 * no CanonicalMaterial row (custom materials, owned via
 * ownerContractorId, live on a completely separate table this never
 * queries), and no User/ContractorMembership row is ever read or
 * written. Owner access, other trades' catalogs, and every contractor's
 * custom-material definitions are preserved by construction, not by a
 * new check added here.
 *
 * FAILURE / RETRY: `rebuildElectricalCatalog` resets-then-rebuilds
 * unconditionally at the start of every call — a failed or interrupted
 * attempt leaves nothing that a second, identical invocation of this
 * SAME script does not already clean up on its own next run. There is
 * no separate resume/rollback path to build; retrying IS the recovery
 * path, exactly as already proven locally. The recovery point from step
 * 5 exists for the case retrying is not the right answer.
 *
 * ORDER RELATIVE TO CANDIDATE BUILD/PROMOTION: run this BEFORE promoting
 * the application code build that depends on the new catalog. The
 * schema change this release carries (CanonicalMaterial.ownerContractorId
 * / ownerNormalizedName) is purely additive, so the CURRENTLY-live
 * production code is unaffected by running this first — it simply never
 * reads the new columns. Promoting the new code build before this step
 * would risk it querying Electrical catalog rows that do not exist yet;
 * running this step first and confirming completion, THEN promoting,
 * is the safe order.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { fullEndpoint, rebuildElectricalCatalog } from "./init-preview-database";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const TARGET_URL = value("target-url");
const EXPECT_IDENTITY_KEY = value("expect-identity-key");
const RECOVERY_POINT_CONFIRMED = value("recovery-point-confirmed");
const CONFIRM_PRODUCTION = flag("i-confirm-this-is-production");
const APPLY = flag("apply");

if (!TARGET_URL || !EXPECT_IDENTITY_KEY) {
  console.error(
    "\nUsage:\n" +
      "  npx tsx scripts/release-electrical-catalog-to-production.ts --target-url <url> --expect-identity-key <key>\n" +
      "    [--recovery-point-confirmed <id-or-timestamp> --i-confirm-this-is-production --apply]\n"
  );
  process.exit(1);
}

async function readIdentityKey(databaseUrl: string): Promise<string | null> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const rows = await prisma.$queryRawUnsafe<{ key: string }[]>('select "key" from database_identity limit 1');
    return rows[0]?.key ?? null;
  } catch {
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

async function assertActiveBusinessAbsent(databaseUrl: string): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const elite = await prisma.contractor.findUnique({ where: { slug: "elite-electric" }, select: { id: true } });
    if (!elite) {
      console.log("  elite-electric does not exist yet on this target — nothing to protect, first install.");
      return;
    }
    const [bookings, quotes] = await Promise.all([
      prisma.booking.count({ where: { visit: { contractorId: elite.id } } }),
      prisma.quote.count({ where: { service: { contractorId: elite.id } } }),
    ]);
    if (bookings > 0 || quotes > 0) {
      throw new Error(
        `refusing: elite-electric already has ${bookings} booking(s) and ${quotes} quote(s) on this target. ` +
        `"No active contractors; disposable business data may be rebuilt" was authorized for a specific moment ` +
        `— this target no longer matches that description, and this script does not decide that judgment call itself.`
      );
    }
    console.log(`  elite-electric exists with 0 bookings and 0 quotes — matches the authorized "no active business" state.`);
  } finally {
    await prisma.$disconnect();
  }
}

function assertSchemaInSync(databaseUrl: string): void {
  const out = execFileSync(
    "npx",
    ["prisma", "migrate", "diff", "--from-url", databaseUrl, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { encoding: "utf8" }
  );
  if (!out.includes("-- This is an empty migration.")) {
    throw new Error(
      `refusing: the target's schema does not match prisma/schema.prisma. Resolve the diff deliberately before releasing:\n${out}`
    );
  }
  console.log("  schema is in sync with prisma/schema.prisma — no pending diff.");
}

function installPriceApprovalConstraint(databaseUrl: string): void {
  execFileSync("npx", ["tsx", "scripts/install-price-approval-constraint.ts"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "inherit" });
}

async function main() {
  console.log(`\nELECTRICAL CATALOG RELEASE — production-targeted entry point\n`);

  // Step 1: read-only identity check. Never stamps one.
  const observedKey = await readIdentityKey(TARGET_URL as string);
  if (observedKey !== EXPECT_IDENTITY_KEY) {
    console.error(`\n  REFUSED: target's database_identity key is "${observedKey ?? "(none)"}", expected "${EXPECT_IDENTITY_KEY}". Not restamping — an unmarked or wrongly-marked target is refused, not adopted.\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`  identity confirmed: database_identity.key = "${observedKey}" at ${fullEndpoint(TARGET_URL as string)}`);

  // Step 2: read-only active-business check, against the ACTUAL target, now.
  await assertActiveBusinessAbsent(TARGET_URL as string);

  // Step 3: read-only schema-sync check.
  assertSchemaInSync(TARGET_URL as string);

  if (!APPLY) {
    console.log(`\n  Report only — preflight passed. Re-run with --recovery-point-confirmed, --i-confirm-this-is-production, and --apply to write.\n`);
    return;
  }

  if (!CONFIRM_PRODUCTION) {
    console.error(`\n  REFUSED: --apply requires --i-confirm-this-is-production.\n`);
    process.exitCode = 1;
    return;
  }
  if (!RECOVERY_POINT_CONFIRMED) {
    console.error(
      `\n  REFUSED: --apply requires --recovery-point-confirmed <id-or-timestamp>.\n` +
      `  Create one first, e.g.:\n` +
      `    neon branches create --project-id <production-project-id> --parent production --name "pre-electrical-release-$(date +%Y%m%d-%H%M)"\n` +
      `  then pass its branch id (or a PITR timestamp you have independently confirmed) as --recovery-point-confirmed.\n`
    );
    process.exitCode = 1;
    return;
  }
  console.log(`  recovery point acknowledged: ${RECOVERY_POINT_CONFIRMED}`);

  // Step 4: install the constraint BEFORE construction — the exact ordering
  // that closed the Preview gap.
  installPriceApprovalConstraint(TARGET_URL as string);

  // Step 5 (was numbered 6 above; 5 is the recovery-point ack): the SAME
  // accepted, already-proven function. Not reimplemented.
  const result = await rebuildElectricalCatalog(TARGET_URL as string);
  console.log(`\n  RELEASE COMPLETE. Catalog fingerprint recorded above this run's own output.\n`);
  console.log(`  Next: promote the application code build, then verify through the normal hosted checks.\n`);
  void result;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
