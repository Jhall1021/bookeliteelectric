/**
 * The narrowly scoped launch verifier §9 of
 * docs/design/electrical-preview-initialization.md calls for — one command
 * chaining the pieces §9 already names as the accepted launch proof against
 * whichever target this run's own flags declare, reusing each piece's OWN
 * guard rather than reimplementing or weakening any of them.
 *
 *   1. scripts/init-preview-database.ts — the real 82-service Electrical
 *      catalog. Its own identity guard runs untouched: the local-only stamp
 *      for a loopback target, or `decideRemoteTarget`'s exact
 *      endpoint/project/database check plus the inherited-lineage
 *      classification for a remote one (both exported from that script,
 *      reused here, never reimplemented). This script never restamps
 *      anything and never second-guesses that guard's verdict.
 *   2. scripts/verify-integration-manual-routing-storefront-browser-flow.ts
 *      — the accepted manual new-outlet route.
 *   3. scripts/verify-derived-scheduling-browser.ts — native no-deposit
 *      booking: availability/capacity and the no-Stripe-contact proof.
 *
 * Both browser harnesses build and tear down their OWN supported-function
 * contractor (scripts/_derivedStorefrontFixture.ts's
 * buildPricedDerivedContractor — catalog install, writeMaterialCost,
 * declarePolicyMaterialQuantity, publishSuggestedPrice, activateService).
 * Never a raw price/approval write, never a diagnostic-shell fixture.
 *
 * STEP 1 ONLY RUNS FOR A REMOTE TARGET. For a loopback --target-url,
 * init-preview-database.ts's OWN local path builds a brand-new scratch
 * database, verifies it, and DROPS it before returning (its own §2 step
 * 12 — a self-contained rehearsal, never meant to leave anything behind).
 * Chaining steps 2/3 onto that would run them against a database that no
 * longer exists. So for loopback this script skips step 1 and runs steps
 * 2/3 directly against the given --target-url, which it treats as an
 * ALREADY-installed, persistent local catalog (the same kind
 * rehearse-fresh-electrical-launch.ts / init-preview-database.ts build
 * once and this repo's suites reuse across many runs) — proving the
 * two-harness COMPOSITION, not re-proving the from-scratch build, which is
 * already proven elsewhere. For a remote target, init-preview-database.ts
 * does NOT drop anything ("a real Preview target is left in place"), so
 * step 1 genuinely persists the catalog for steps 2/3 to use — but steps
 * 2/3 cannot run there yet; see below.
 *
 * REMOTE COMPATIBILITY FOR STEPS 2/3 IS A KNOWN, OPEN GAP — NOT PRETENDED
 * AWAY. Both browser harnesses call `assertDisposableLocalDatabase`
 * unconditionally (docs/design/electrical-preview-initialization.md §9.3
 * item 5, §9.6 item 4) — a loopback-only guard this script does not touch,
 * because rewriting it correctly needs testing against a real remote
 * target this session has no access to, and an unverified change to an
 * already-accepted safety guard is worse than an honest gap. Against a
 * remote --target-url, this script runs step 1 for real, then reports the
 * steps 2/3 gap instead of invoking scripts that would immediately
 * self-refuse.
 *
 *   npx tsx scripts/verify-remote-launch-readiness.ts \
 *     --target-url <url> --base-url <deployed-app-origin> \
 *     [--expect-endpoint <endpoint> --expect-project <project-id> --expect-database <name>] \
 *     [--production-url <production-connection-string>] \
 *     [--apply]
 *
 * `--expect-endpoint`/`--expect-project`/`--expect-database` are forwarded
 * to init-preview-database.ts UNCHANGED — this script does not duplicate or
 * enforce its own copy of "required once --target-url is not loopback."
 *
 * `--production-url` is ONLY the reference init-preview-database.ts's own
 * `decideRemoteTarget` measures production's lineage against for a REMOTE
 * `--target-url` (docs/design/electrical-preview-initialization.md §9.2,
 * Question A) — it is never the target itself, and is ignored for a
 * loopback `--target-url`. Omitting it on a remote run reproduces that
 * script's own clean refusal ("DATABASE_URL is not set..."), not a silent
 * skip.
 *
 * Without `--apply`: a remote target only prints step 1's plan (no writes);
 * a loopback target does nothing at all (steps 2/3 are real browser/booking
 * runs with no dry-run mode of their own — --apply is what authorizes
 * running them here).
 *
 * NO REAL EMAIL/PROVIDER EFFECTS: prints a notice (never fails the run) if
 * RESEND_API_KEY/PLATFORM_RESEND_API_KEY/JOBBER_CLIENT_ID/STRIPE_SECRET_KEY
 * are set in THIS process's own environment — a local signal only. This
 * process cannot inspect the deployed target's own environment; that
 * precondition is enforced on the Preview environment itself (§9.5).
 */
import { runCaptured, sanitizeSecrets } from "./init-preview-database";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const TARGET_URL = value("target-url");
const BASE_URL = value("base-url");
const EXPECT_ENDPOINT = value("expect-endpoint");
const EXPECT_PROJECT = value("expect-project");
const EXPECT_DATABASE = value("expect-database");
const PRODUCTION_URL = value("production-url");
const APPLY = flag("apply");

if (!TARGET_URL || !BASE_URL) {
  console.error(
    "\nUsage: npx tsx scripts/verify-remote-launch-readiness.ts --target-url <url> --base-url <deployed-app-origin>\n" +
      "         [--expect-endpoint <endpoint> --expect-project <project-id> --expect-database <name>]\n" +
      "         [--production-url <production-connection-string>] [--apply]\n"
  );
  process.exit(1);
}

function isLoopbackUrl(u: string): boolean {
  try {
    const host = new URL(u.includes("://") ? u : `postgres://${u}`).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

const WATCHED_PROVIDER_VARS = ["RESEND_API_KEY", "PLATFORM_RESEND_API_KEY", "JOBBER_CLIENT_ID", "STRIPE_SECRET_KEY"];

function noticeProviderEffects(): void {
  const present = WATCHED_PROVIDER_VARS.filter((k) => !!process.env[k]);
  if (present.length) {
    console.log(
      `\n  NOTICE: ${present.join(", ")} ${present.length === 1 ? "is" : "are"} set in THIS process's own ` +
        `environment. This script cannot inspect the deployed target's own environment from here — confirm ` +
        `separately (docs/design/electrical-preview-initialization.md §9.5) that the Preview target itself has ` +
        `these unset before trusting this run as a no-real-provider-effects proof.\n`
    );
  } else {
    console.log(`\n  ${WATCHED_PROVIDER_VARS.join(", ")} are all unset in this process — no local signal of a real provider effect.\n`);
  }
}

function runStep(label: string, cmdArgs: string[], env: NodeJS.ProcessEnv): void {
  console.log(`\n=== ${label} ===`);
  const result = runCaptured("npx", cmdArgs, env);
  const out = sanitizeSecrets(result.stdout);
  const err = sanitizeSecrets(result.stderr);
  if (out.trim()) console.log(out);
  if (err.trim()) console.error(err);
  if (result.code !== 0) throw new Error(`${label} exited with code ${result.code}`);
}

function runBrowserHarnesses(): void {
  runStep(
    "verify-integration-manual-routing-storefront-browser-flow.ts — manual new-outlet route",
    ["tsx", "scripts/verify-integration-manual-routing-storefront-browser-flow.ts"],
    { ...process.env, DATABASE_URL: TARGET_URL as string, BROWSER_FLOW_BASE_URL: BASE_URL as string }
  );

  runStep(
    "verify-derived-scheduling-browser.ts — native no-deposit booking",
    ["tsx", "scripts/verify-derived-scheduling-browser.ts"],
    { ...process.env, DATABASE_URL: TARGET_URL as string, BASE_URL: BASE_URL as string }
  );
}

async function main() {
  console.log(`\nLAUNCH READINESS — §9's accepted pieces, chained\n`);
  noticeProviderEffects();

  const remote = !isLoopbackUrl(TARGET_URL as string);
  console.log(`  target: ${remote ? "REMOTE" : "loopback (assumed already-installed catalog)"}\n`);

  if (!remote) {
    if (!APPLY) {
      console.log(`\n  --apply not passed — steps 2/3 are real browser/booking runs with no dry-run mode. Nothing executed.\n`);
      return;
    }
    console.log(
      `\n  Loopback target: step 1 (init-preview-database.ts) is skipped here — its own local path builds a ` +
        `scratch database and DROPS it before returning, leaving nothing for steps 2/3 to run against. This ` +
        `run treats --target-url as an already-installed catalog and proves the two-harness composition ` +
        `directly.\n`
    );
    runBrowserHarnesses();
    console.log(`\n  Both harnesses passed against ${BASE_URL}.\n`);
    return;
  }

  // Remote: step 1 genuinely persists the catalog on the target (init-
  // preview-database.ts never drops a remote target), so it runs for real
  // here, through its own unmodified identity guard.
  const initArgs = ["tsx", "scripts/init-preview-database.ts", "--target-url", TARGET_URL as string];
  if (EXPECT_ENDPOINT) initArgs.push("--expect-endpoint", EXPECT_ENDPOINT);
  if (EXPECT_PROJECT) initArgs.push("--expect-project", EXPECT_PROJECT);
  if (EXPECT_DATABASE) initArgs.push("--expect-database", EXPECT_DATABASE);
  if (APPLY) initArgs.push("--apply");

  // DATABASE_URL here is init-preview-database.ts's OWN production-reference
  // input for a remote target (its decideRemoteTarget/resolveTarget reads
  // it as `productionUrl`, never as the target) — NOT the target itself,
  // which travels only through --target-url.
  const initEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: PRODUCTION_URL ?? "" };

  runStep("1. init-preview-database.ts — full 82-service catalog", initArgs, initEnv);

  if (!APPLY) {
    console.log(`\n  --apply not passed — steps 2/3 need the catalog actually installed. Stopping after the plan above.\n`);
    return;
  }

  console.log(
    `\n  REMOTE TARGET — steps 2/3 not run here. verify-integration-manual-routing-storefront-browser-flow.ts ` +
      `and verify-derived-scheduling-browser.ts both call assertDisposableLocalDatabase unconditionally — their ` +
      `own loopback-only guard, kept intact rather than weakened by this script. Running them against this ` +
      `remote target would self-refuse immediately, not prove anything.\n` +
      `  Step 1's catalog install above already ran for real against this remote target, through its own ` +
      `endpoint/project/database and inherited-lineage checks.\n` +
      `  See docs/design/electrical-preview-initialization.md §9.3 item 5 and §9.6 item 4 for the exact gap: a ` +
      `real remote path for these two harnesses needs a conditional swap of assertDisposableLocalDatabase for ` +
      `init-preview-database.ts's own decideRemoteTarget check, gated behind explicit flags so the default ` +
      `local behavior is unchanged — not attempted here, since it cannot be verified without a real remote ` +
      `target this session has no access to.\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
