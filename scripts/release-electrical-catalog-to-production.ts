/**
 * The deliberately-production-targeted entry point for the Electrical
 * catalog/schema release — separate from scripts/init-preview-database.ts
 * ON PURPOSE. That script's own identity guard (`decideRemoteTarget`)
 * refuses outright the moment a target's endpoint equals production's
 * own — by design, "this script never writes there under any flag."
 * This script is the other side of that same line: it refuses to run
 * against anything EXCEPT the verified production identity, and never
 * restamps it.
 *
 *   REPORT ONLY (always safe, no writes):
 *     npx tsx scripts/release-electrical-catalog-to-production.ts \
 *       --target-url "$PRODUCTION_DATABASE_URL"
 *
 *   APPLY (writes Elite's electrical catalog; requires an owned recovery
 *   point acknowledged first):
 *     npx tsx scripts/release-electrical-catalog-to-production.ts \
 *       --target-url "$PRODUCTION_DATABASE_URL" \
 *       --recovery-point-confirmed <neon-branch-id-or-PITR-timestamp> \
 *       --i-confirm-this-is-production \
 *       --apply
 *
 * REVIEW OF 6b36b5f — every one of these five findings is a correction
 * from the FIRST version of this file, not a restatement of it:
 *
 * 1. IDENTITY WAS INSUFFICIENT. Checking only `database_identity.key`
 *    does not distinguish production from the designated Preview branch
 *    — a Neon branch inherits its parent's marker unchanged, so the
 *    Preview branch's `key` reads as the SAME "price2book-production"
 *    string. Fixed by reusing `scripts/_lineage.ts`'s own measured
 *    lineage (`PRODUCTION_LINEAGE`, the same tripwire constant the
 *    rehearsal guard already trusts) PLUS the fact a branch's marker was
 *    stamped for a DIFFERENT endpoint than the one actually connected —
 *    `_lineage.ts`'s own documented rule, inverted for this script's
 *    opposite purpose: a rehearsal target must be a branch (marker
 *    endpoint DIFFERS); a release target must be the original itself
 *    (marker endpoint MATCHES). Bound additionally to the exact known
 *    endpoint/database/project, so a wrong-but-still-"is the original"
 *    target (a materially different Neon project, say) is refused too.
 * 2. THE BOOKING/QUOTE GATE WAS INVENTED. It rewrote Joshua's own
 *    standing instruction — "No active contractors; existing test
 *    business data may be rebuilt" — into a claim about a "specific
 *    moment," which contradicts what was actually said: existing TEST
 *    bookings/quotes are exactly the disposable data that rule already
 *    covers, not evidence of "active customers." Removed outright, along
 *    with its doc comment. Real dependency checks (identity, schema,
 *    the pricing constraint) remain.
 * 3. THE SCHEMA DELTA WAS WRONG. The two custom-material columns
 *    (`CanonicalMaterial.ownerContractorId`/`ownerNormalizedName`)
 *    already belong to `main` — comparing against a LOCAL rehearsal
 *    database that already had this branch's full Electrical schema
 *    proved nothing about what production, which has never received any
 *    of this branch's schema, actually needs. The real delta is
 *    `main`'s schema vs. THIS branch's schema — 5 new tables, 5 new
 *    enums, and roughly a dozen altered/added columns; see
 *    `docs/design/electrical-preview-initialization-schema-release.sql`
 *    for the full, reviewed SQL (also summarized in
 *    `docs/design/electrical-preview-initialization.md` §20). This
 *    file's own preflight now re-derives that SAME comparison against
 *    the LIVE target at run time (`--from-url <target>` vs.
 *    `prisma/schema.prisma`, not an assumption carried over from local
 *    rehearsal), and compares it against the reviewed .sql file as a set
 *    of statement blocks (order-insensitive — proven by rehearsal that a
 *    live-database diff and a file-to-file diff order the SAME
 *    statements differently), refusing on ANY content difference — never
 *    assumes compatibility, and never applies a diff that wasn't the one
 *    reviewed.
 * 4. SUBPROCESS OUTPUT WASN'T SANITIZED. `execFileSync` with
 *    `stdio: "inherit"`, and a bare top-level `console.error(e)`, both
 *    reintroduce the exact credential-output class this engagement fixed
 *    for the Preview harnesses. Fixed by routing every subprocess call
 *    through `runCaptured`/`sanitizeSecrets`
 *    (`scripts/init-preview-database.ts`) and the top-level catch through
 *    `sanitizeForLog` (`scripts/_sanitizeOutput.ts`) — the SAME reused
 *    helpers, not new ones.
 * 5. THE RECOVERY COMMAND NAMED THE WRONG BRANCH. `--parent production`
 *    is Neon's own DEFAULT branch for this project
 *    (`br-weathered-heart-ayps5p7g`) — the misleadingly-named branch
 *    already proven, this same engagement, to carry a DIFFERENT lineage
 *    than the real production data. Fixed to name the explicit, verified
 *    branch id, `br-quiet-salad-ay74c7cx`.
 *
 * SCOPE — CORRECTED. The prior version claimed isolation by inspecting
 * only `resetElectricalTemplateTree`/`resetEliteSourceData`. The full
 * seed chain `rebuildElectricalCatalog` also runs (`SEED_STEPS` in
 * `scripts/rehearse-fresh-electrical-launch.ts`) DOES ALSO write to
 * shared, platform-wide tables — `CanonicalMaterial`/`CanonicalComponent`/
 * `CanonicalCategory` roles, in `prisma/seed-materials.ts`,
 * `prisma/seed-material-categories.ts`, `prisma/seed-component-labor-
 * evidence.ts`, `prisma/seed-low-voltage-and-sconces.ts`,
 * `prisma/seed-phase-f-material-roles.ts`,
 * `prisma/seed-phase-f-role-redesign.ts`,
 * `prisma/seed-routing-v2-material-roles.ts`,
 * `scripts/add-equipment-roles.ts` — confirmed by direct inspection of
 * every one of those eight files, every write BY KEY to the platform-
 * curated role catalog (`ownerContractorId IS NULL` by definition — a
 * contractor-owned custom material is identified by `ownerContractorId`
 * + `ownerNormalizedName`, a completely different, disjoint lookup path
 * these seeds never query, so none of this can ever touch a custom
 * material's own identity).
 *
 * Two of those eight — `seed-phase-f-role-redesign.ts` and
 * `seed-routing-v2-material-roles.ts` — are NOT purely additive: each
 * also deletes (or deactivates, when in use) a SHORT, HARDCODED,
 * EXPLICIT list of specific stale role keys (three retired conductor
 * roles in the latter; whatever `seed-phase-f-role-redesign.ts`'s own
 * `ADD`/cost-sweep finds unused, in the former) — and both run for real,
 * unconditionally or via `--apply` (`NEEDS_APPLY` in
 * `scripts/rehearse-fresh-electrical-launch.ts` forces `--apply` on
 * every `rebuildElectricalCatalog` run), not merely in a dry-run mode.
 * Both gate every delete behind an EXHAUSTIVE, cross-model live-
 * reference count first (`ContractorMaterial`/`CanonicalComponentMaterial`/
 * `AnswerOptionMaterial`/`ServiceMaterial`/`TemplateServiceMaterial`/
 * `TemplateAnswerOptionMaterial`/`MaterialBaselineVersion`, per role) —
 * a role with even one live reference, on ANY contractor of ANY trade,
 * is left alone and reported, never deleted. So this is not "never a
 * delete": it is delete-only-of-a-fixed-named-list-and-only-when-
 * provably-unreferenced-anywhere — safe by that construction, but a
 * real delete against the shared catalog nonetheless, and a stronger
 * claim than "additive" would be incorrect.
 *
 * `resetElectricalTemplateTree`/`resetEliteSourceData` remain the ONLY
 * UNCONDITIONAL deletes in the whole chain, scoped exactly as before:
 * `trade = "electrical"` template versions, and the ONE contractor slug
 * `elite-electric`'s own rows. Other trades' template trees, every
 * contractor's custom-material definitions, and owner access are
 * preserved — by the actual scope of every write in the chain, not
 * merely the two reset functions.
 *
 * FAILURE / RETRY: unchanged from the prior version — already proven,
 * not re-derived here. `rebuildElectricalCatalog` resets-then-rebuilds
 * unconditionally at the start of every call, so retrying this SAME
 * script IS the recovery path for a failed attempt. The recovery point
 * exists for when retrying is not the right answer.
 *
 * ORDER RELATIVE TO CANDIDATE BUILD/PROMOTION: unchanged. Run this
 * BEFORE promoting the application code build — every schema change in
 * the reviewed SQL is additive (new tables, new nullable/defaulted
 * columns, widened nullability), so currently-live production code is
 * unaffected by running this first.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runCaptured, sanitizeSecrets } from "./init-preview-database";
import { sanitizeForLog } from "./_sanitizeOutput";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const REVIEWED_SQL_PATH = "docs/design/electrical-preview-initialization-schema-release.sql";
const REVIEWED_SQL_SENTINEL = "-- BEGIN REVIEWED DIFF";

/** The reviewed SQL file carries a prose header above this sentinel; only what follows the header's closing blank line is the actual diff being compared/applied. */
function readReviewedDiffBody(): string {
  const full = readFileSync(REVIEWED_SQL_PATH, "utf8");
  const i = full.indexOf(REVIEWED_SQL_SENTINEL);
  if (i === -1) throw new Error(`refusing: ${REVIEWED_SQL_PATH} has no "${REVIEWED_SQL_SENTINEL}" sentinel — cannot isolate the reviewed diff from its header.`);
  const blankLine = full.indexOf("\n\n", i);
  if (blankLine === -1) throw new Error(`refusing: no blank line found after the sentinel in ${REVIEWED_SQL_PATH} — cannot find where the header ends and the diff begins.`);
  return full.slice(blankLine + 2).trim();
}

/**
 * `prisma migrate diff` orders its statement blocks by declared model order
 * when both sides are schema FILES, but by the live database's own
 * introspection order when one side is `--from-url` — proven by rehearsal:
 * the exact same statements, reordered, comparing this same reviewed SQL
 * against a freshly-pushed pre-release rehearsal target. A byte-exact
 * comparison would refuse every genuinely-matching target for this reason
 * alone, so blocks (split on blank lines) are compared as a set, not a
 * sequence — order-insensitive, content-sensitive.
 */
function normalizeDiffBlocks(sql: string): string[] {
  return sql.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).sort();
}

/** The known, reviewed checkpoint — never read from a caller-supplied flag, so a typo can't silently widen what this accepts. */
const EXPECTED = {
  endpoint: "ep-shy-butterfly-ay5t03di",
  database: "neondb",
  project: "bitter-bird-20565072",
  branchId: "br-quiet-salad-ay74c7cx",
} as const;

export type ExpectedIdentity = { endpoint: string; database: string; project: string; lineage: string };
export type ObservedIdentity = {
  endpoint: string;
  database: string;
  lineage: string | null;
  markerKey: string | null;
  markerEndpoint: string | null;
  project: string | null;
};

/**
 * Finding 1's fix, as a PURE function — no I/O, so it is directly
 * unit-testable with injected observations, per the review's own
 * instruction to "test with injected identities and owned local
 * fixtures, not shared-marker edits." The async wrapper below is the
 * only thing that ever touches a real database or the real EXPECTED
 * constant.
 *
 * A genuine production connection must show ALL of: the exact expected
 * endpoint, database name, and project (read from the marker, not
 * assumed), the expected lineage, AND a marker stamped for the SAME
 * endpoint actually connected to — the one fact a branch can never
 * share, since branching never restamps it.
 */
export function checkGenuineProductionIdentity(observed: ObservedIdentity, expected: ExpectedIdentity): { ok: true } | { ok: false; reason: string } {
  if (observed.endpoint !== expected.endpoint) {
    return { ok: false, reason: `connected endpoint is "${observed.endpoint}", expected the exact designated production endpoint "${expected.endpoint}". A Preview or sibling branch has its own distinct endpoint even though it inherits the same marker key.` };
  }
  if (observed.database !== expected.database) {
    return { ok: false, reason: `connected database is "${observed.database}", expected "${expected.database}".` };
  }
  if (observed.lineage !== expected.lineage) {
    return { ok: false, reason: `measured lineage is "${observed.lineage ?? "(unreadable)"}", expected "${expected.lineage}". Refusing rather than trusting a stale constant.` };
  }
  if (!observed.markerKey) {
    return { ok: false, reason: `no database_identity marker at all. An unmarked target is refused, never adopted.` };
  }
  if (observed.markerEndpoint !== observed.endpoint) {
    return { ok: false, reason: `the marker was stamped for "${observed.markerEndpoint}", not the endpoint actually connected to ("${observed.endpoint}") — that is exactly what a BRANCH carrying an inherited marker looks like, not the original it was stamped for.` };
  }
  if (observed.project !== expected.project) {
    return { ok: false, reason: `marker's neonProject is "${observed.project ?? "(none)"}", expected "${expected.project}".` };
  }
  return { ok: true };
}

async function assertIsGenuineProductionTarget(targetUrl: string): Promise<void> {
  const p = await probe(targetUrl);
  const observedDatabase = new URL(targetUrl).pathname.replace(/^\//, "");

  const prisma = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  let observedProject: string | null;
  try {
    const rows = await prisma.$queryRawUnsafe<{ neonProject: string | null }[]>('select "neonProject" from database_identity limit 1');
    observedProject = rows[0]?.neonProject ?? null;
  } finally {
    await prisma.$disconnect();
  }

  const observed: ObservedIdentity = { endpoint: p.endpoint, database: observedDatabase, lineage: p.lineage, markerKey: p.markerKey, markerEndpoint: p.markerEndpoint, project: observedProject };
  const expected: ExpectedIdentity = { ...EXPECTED, lineage: PRODUCTION_LINEAGE };
  const verdict = checkGenuineProductionIdentity(observed, expected);
  if (!verdict.ok) throw new Error(`refusing: ${verdict.reason}`);

  console.log(`  identity confirmed: this IS the designated production target — endpoint=${observed.endpoint} database=${observed.database} project=${observed.project} lineage=${observed.lineage}, marker stamped for this same endpoint (not a branch).`);
}

/**
 * Finding 3's fix. Never assumes what the diff is — re-derives it fresh
 * against the ACTUAL live target, every run, and refuses on ANY
 * difference from the reviewed SQL (the checked-in .sql file this same
 * release applies), whether the live target has drifted further, less
 * far, or sideways from what was reviewed. A non-empty-but-different diff
 * is refused exactly like an empty one — "there is SOME diff" is not the
 * bar; "it is THIS diff" is.
 */
export function assertSchemaMatchesReviewedDiff(databaseUrl: string): void {
  const result = runCaptured("npx", ["prisma", "migrate", "diff", "--from-url", databaseUrl, "--to-schema-datamodel", "prisma/schema.prisma", "--script"], process.env);
  const out = sanitizeSecrets(result.stdout);
  const err = sanitizeSecrets(result.stderr);
  if (result.code !== 0) {
    throw new Error(`refusing: could not compute the schema diff against the live target (exit ${result.code}):\n${out}\n${err}`);
  }
  const reviewedBlocks = normalizeDiffBlocks(readReviewedDiffBody());
  const liveBlocks = normalizeDiffBlocks(out);
  if (JSON.stringify(liveBlocks) !== JSON.stringify(reviewedBlocks)) {
    const reviewedSet = new Set(reviewedBlocks);
    const liveSet = new Set(liveBlocks);
    const missing = reviewedBlocks.filter((b) => !liveSet.has(b));
    const extra = liveBlocks.filter((b) => !reviewedSet.has(b));
    throw new Error(
      `refusing: the live target's actual schema diff does not match the reviewed SQL at ${REVIEWED_SQL_PATH}. ` +
      `This target has drifted from what was reviewed — resolve that deliberately before releasing, never apply blind.\n\n` +
      `--- reviewed but not present on live target ---\n${missing.join("\n\n") || "(none)"}\n` +
      `--- present on live target but not reviewed ---\n${extra.join("\n\n") || "(none)"}\n` +
      `${err}`
    );
  }
  console.log(`  schema diff against the live target recomputed fresh — same statements as the reviewed SQL at ${REVIEWED_SQL_PATH}, order aside.`);
}

function installPriceApprovalConstraint(databaseUrl: string): void {
  const result = runCaptured("npx", ["tsx", "scripts/install-price-approval-constraint.ts"], { ...process.env, DATABASE_URL: databaseUrl });
  const out = sanitizeSecrets(result.stdout);
  const err = sanitizeSecrets(result.stderr);
  if (out.trim()) console.log(out);
  if (err.trim()) console.error(err);
  if (result.code !== 0) throw new Error(`install-price-approval-constraint.ts exited with code ${result.code}`);
}

function applyReviewedSchemaSql(databaseUrl: string): void {
  const result = runCaptured("npx", ["prisma", "db", "execute", "--url", databaseUrl, "--file", "docs/design/electrical-preview-initialization-schema-release.sql"], process.env);
  const out = sanitizeSecrets(result.stdout);
  const err = sanitizeSecrets(result.stderr);
  if (out.trim()) console.log(out);
  if (err.trim()) console.error(err);
  if (result.code !== 0) throw new Error(`applying the reviewed schema SQL exited with code ${result.code}`);
}

export type Options = { targetUrl: string; apply: boolean; confirmProduction: boolean; recoveryPointConfirmed?: string };

export async function main(opts: Options) {
  console.log(`\nELECTRICAL CATALOG RELEASE — production-targeted entry point\n`);

  await assertIsGenuineProductionTarget(opts.targetUrl);
  assertSchemaMatchesReviewedDiff(opts.targetUrl);

  if (!opts.apply) {
    console.log(`\n  Report only — preflight passed. Re-run with --recovery-point-confirmed, --i-confirm-this-is-production, and --apply to write.\n`);
    return;
  }

  if (!opts.confirmProduction) {
    console.error(`\n  REFUSED: --apply requires --i-confirm-this-is-production.\n`);
    process.exitCode = 1;
    return;
  }
  if (!opts.recoveryPointConfirmed) {
    console.error(
      `\n  REFUSED: --apply requires --recovery-point-confirmed <id-or-timestamp>.\n` +
      `  Create one first, e.g.:\n` +
      `    neon branches create --project-id ${EXPECTED.project} --parent ${EXPECTED.branchId} --name "pre-electrical-release-$(date +%Y%m%d-%H%M)"\n` +
      `  then pass its branch id (or a PITR timestamp you have independently confirmed) as --recovery-point-confirmed.\n`
    );
    process.exitCode = 1;
    return;
  }
  console.log(`  recovery point acknowledged: ${opts.recoveryPointConfirmed}`);

  // The reviewed, main-to-candidate schema SQL — applied first, additive
  // only, before any catalog data is written.
  applyReviewedSchemaSql(opts.targetUrl);

  // Install the constraint BEFORE construction — the exact ordering that
  // closed the Preview gap.
  installPriceApprovalConstraint(opts.targetUrl);

  // The SAME accepted, already-proven function. Not reimplemented.
  const { rebuildElectricalCatalog } = await import("./init-preview-database");
  await rebuildElectricalCatalog(opts.targetUrl);
  console.log(`\n  RELEASE COMPLETE. Catalog fingerprint recorded above this run's own output.\n`);
  console.log(`  Next: promote the application code build, then verify through the normal hosted checks.\n`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(`--${name}`);
  const value = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const targetUrl = value("target-url");
  if (!targetUrl) {
    console.error("\nUsage:\n  npx tsx scripts/release-electrical-catalog-to-production.ts --target-url <url>\n    [--recovery-point-confirmed <id-or-timestamp> --i-confirm-this-is-production --apply]\n");
    process.exit(1);
  } else {
    main({
      targetUrl,
      apply: flag("apply"),
      confirmProduction: flag("i-confirm-this-is-production"),
      recoveryPointConfirmed: value("recovery-point-confirmed"),
    }).catch((e) => {
      console.error(sanitizeForLog(e instanceof Error ? e.stack ?? e.message : String(e)));
      process.exitCode = 1;
    });
  }
}
