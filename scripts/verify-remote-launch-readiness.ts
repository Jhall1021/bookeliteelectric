/**
 * The narrowly scoped launch verifier §9 of
 * docs/design/electrical-preview-initialization.md calls for — one command
 * for EACH of the two separate phases §9.6 requires kept apart:
 * initialization (before deployment) and verification (against an
 * already-deployed candidate). A verify run NEVER re-initializes the
 * catalog it is about to check.
 *
 *   npx tsx scripts/verify-remote-launch-readiness.ts --mode init \
 *     --target-url <url> [--expect-endpoint <e> --expect-project <p> --expect-database <d>] \
 *     [--production-url <production-connection-string>] --apply
 *
 *   npx tsx scripts/verify-remote-launch-readiness.ts --mode verify \
 *     --target-url <url> --base-url <deployed-app-origin> \
 *     [--expect-endpoint <e> --expect-project <p> --expect-database <d>] \
 *     [--production-url <production-connection-string>]
 *
 * `--mode init` runs ONLY `init-preview-database.ts` — the real 81-service
 * Electrical catalog, through its own unmodified identity guard (the
 * local-only stamp, or `decideRemoteTarget`'s exact endpoint/project/
 * database plus inherited-lineage check for a remote target, both
 * exported from that script and reused here, never reimplemented). It
 * never touches the browser harnesses.
 *
 * `--mode verify` (default) runs ONLY the two accepted browser harnesses —
 * `verify-integration-manual-routing-storefront-browser-flow.ts` (the
 * manual new-outlet route) and `verify-derived-scheduling-browser.ts`
 * (native no-deposit booking) — against an ALREADY-DEPLOYED candidate. It
 * NEVER calls `init-preview-database.ts`. Both harnesses build and tear
 * down their OWN supported-function contractor
 * (`scripts/_derivedStorefrontFixture.ts`'s `buildPricedDerivedContractor`)
 * — never a raw price/approval write, never a diagnostic-shell fixture.
 *
 * TARGET VERIFICATION HAPPENS ONCE, HERE, BEFORE EITHER HARNESS RUNS — via
 * `scripts/_remoteCompatibleGuard.ts`'s `assertLoopbackOrDesignatedRemoteTarget`,
 * the SAME shared helper `verify-integration-manual-routing-storefront-
 * browser-flow.ts` now also calls on its own (defense in depth for a
 * direct, non-orchestrated run of that script) — reused here rather than
 * re-derived, so there is exactly one implementation of "is this target
 * legitimate," not two that could silently drift apart.
 *
 * FOR A REMOTE TARGET, the deployed app's OWN identity is checked via the
 * already-shipped `app/api/deployment-identity` route — confirming its
 * reported database host matches the verified target BEFORE either
 * harness writes anything, and that no transactional/platform Resend key
 * is configured server-side (a local environment notice alone is not
 * evidence about the deployed server — §9.6 item 3's own correction).
 * `VERCEL_AUTOMATION_BYPASS_SECRET` must be set for this; its absence
 * refuses rather than skips.
 *
 * UNSUPPORTED OR SKIPPED VERIFICATION EXITS NONZERO. This script never
 * reports success after skipping the thing it was asked to prove — the
 * prior revision returned exit 0 after silently skipping both harnesses
 * for a remote target; that was wrong and is fixed here.
 *
 * NO REAL EMAIL/PROVIDER EFFECTS: for a loopback target, prints a notice
 * (never fails) if RESEND_API_KEY/PLATFORM_RESEND_API_KEY/JOBBER_CLIENT_ID/
 * STRIPE_SECRET_KEY are set in THIS process's own environment — a local
 * signal only, since there is no separate "deployment" to ask. For a
 * remote target, the deployed-identity check above is the real evidence.
 */
import { runCaptured, sanitizeSecrets } from "./init-preview-database";
import { assertLoopbackOrDesignatedRemoteTarget } from "./_remoteCompatibleGuard";
import { checkDeploymentIdentityResponse, describeTargetForLog } from "./_deployedIdentityCheck";
import { buildEffectiveGuardEnv } from "./_effectiveGuardEnv";
import { sanitizeForLog } from "./_sanitizeOutput";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const MODE = (value("mode") ?? "verify") as "init" | "verify";
const TARGET_URL = value("target-url");
const BASE_URL = value("base-url");
const EXPECT_ENDPOINT = value("expect-endpoint");
const EXPECT_PROJECT = value("expect-project");
const EXPECT_DATABASE = value("expect-database");
const PRODUCTION_URL = value("production-url");
const APPLY = flag("apply");

if (MODE !== "init" && MODE !== "verify") {
  console.error(`\n  --mode must be "init" or "verify", got "${MODE}"\n`);
  process.exit(1);
}
if (!TARGET_URL || (MODE === "verify" && !BASE_URL)) {
  console.error(
    "\nUsage:\n" +
      "  npx tsx scripts/verify-remote-launch-readiness.ts --mode init --target-url <url>\n" +
      "    [--expect-endpoint <e> --expect-project <p> --expect-database <d>] [--production-url <url>] --apply\n" +
      "  npx tsx scripts/verify-remote-launch-readiness.ts --mode verify --target-url <url> --base-url <origin>\n" +
      "    [--expect-endpoint <e> --expect-project <p> --expect-database <d>] [--production-url <url>]\n"
  );
  process.exit(1);
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

const WATCHED_PROVIDER_VARS = ["RESEND_API_KEY", "PLATFORM_RESEND_API_KEY", "JOBBER_CLIENT_ID", "STRIPE_SECRET_KEY"];

async function checkDeployedIdentityAndNoSend(baseUrl: string, targetUrl: string): Promise<void> {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypass) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is not set — cannot confirm the deployed app's identity before verifying a remote target.");
  let res: Response;
  try {
    // redirect: "error" — refuse outright rather than follow. A redirect
    // response here could carry the bypass header (via this fetch's own
    // Authorization-adjacent header) to a destination this script never
    // verified; refusing is sufficient, per review.
    res = await fetch(`${baseUrl}/api/deployment-identity`, { headers: { "x-vercel-protection-bypass": bypass }, redirect: "error" });
  } catch (e) {
    throw new Error(
      `could not reach /api/deployment-identity without following a redirect (redirects are refused outright): ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!res.ok) throw new Error(`/api/deployment-identity returned ${res.status} — cannot confirm the deployed app's identity.`);
  const body = await res.json();
  const check = checkDeploymentIdentityResponse(body, targetUrl);
  if (!check.ok) throw new Error(check.reason);
  console.log(`  deployed app identity confirmed for ${describeTargetForLog(targetUrl)}, and no transactional/platform Resend key is configured server-side`);
}

function noticeLocalProviderVars(): void {
  const present = WATCHED_PROVIDER_VARS.filter((k) => !!process.env[k]);
  if (present.length) {
    console.log(`\n  NOTICE: ${present.join(", ")} set in this process's own environment (local signal only).\n`);
  } else {
    console.log(`\n  ${WATCHED_PROVIDER_VARS.join(", ")} all unset in this process.\n`);
  }
}

async function main() {
  console.log(`\nLAUNCH READINESS — mode: ${MODE}\n`);

  // The EFFECTIVE guard environment, built from the CLI flags this process
  // actually parsed, BEFORE the first guard call — not the ambient
  // process.env, which never carries --expect-*/--production-url at all
  // (those exist only as this script's own local consts until copied
  // somewhere). The prior revision passed plain process.env here and only
  // copied the flags into a LATER object used for the child harnesses, so
  // the documented flags-only invocation refused before ever reaching
  // them. Every later env (init, harnesses) is derived from this SAME
  // object, not rebuilt separately, so there is one verified configuration
  // used throughout, not several that could silently disagree.
  const effectiveEnv: NodeJS.ProcessEnv = buildEffectiveGuardEnv(process.env, {
    expectEndpoint: EXPECT_ENDPOINT,
    expectProject: EXPECT_PROJECT,
    expectDatabase: EXPECT_DATABASE,
    productionUrl: PRODUCTION_URL,
  });

  // Bound explicitly to --target-url, not the ambient DATABASE_URL a
  // caller's shell happens to have set (or not) — the prior revision's
  // bare `new PrismaClient()` read whatever process.env.DATABASE_URL was
  // at construction time, which is not necessarily the declared target.
  const prisma = new PrismaClient({ datasources: { db: { url: TARGET_URL as string } } });
  let decision;
  try {
    decision = await assertLoopbackOrDesignatedRemoteTarget(prisma, TARGET_URL as string, effectiveEnv, {});
  } finally {
    await prisma.$disconnect();
  }
  if (!decision.ok) {
    console.error(sanitizeForLog(`\n  REFUSED: ${decision.reason}\n`, [process.env.VERCEL_AUTOMATION_BYPASS_SECRET]));
    process.exitCode = 1;
    return;
  }
  console.log(`  target verified: ${decision.mode}`);

  if (MODE === "init") {
    const initArgs = ["tsx", "scripts/init-preview-database.ts", "--target-url", TARGET_URL as string];
    if (EXPECT_ENDPOINT) initArgs.push("--expect-endpoint", EXPECT_ENDPOINT);
    if (EXPECT_PROJECT) initArgs.push("--expect-project", EXPECT_PROJECT);
    if (EXPECT_DATABASE) initArgs.push("--expect-database", EXPECT_DATABASE);
    if (APPLY) initArgs.push("--apply");
    const initEnv: NodeJS.ProcessEnv = { ...effectiveEnv };
    if (decision.mode === "remote") initEnv.DATABASE_URL = PRODUCTION_URL ?? "";
    else delete initEnv.DATABASE_URL;
    runStep("init-preview-database.ts — full 81-service catalog", initArgs, initEnv);
    if (!APPLY) console.log("\n  --apply not passed — plan only, nothing written.\n");
    return;
  }

  // MODE === "verify" — never touches init-preview-database.ts. Checks the
  // deployed candidate's own identity before either harness writes
  // anything, for a remote target; a loopback target has no separate
  // "deployment" to independently confirm.
  if (decision.mode === "remote") {
    await checkDeployedIdentityAndNoSend(BASE_URL as string, TARGET_URL as string);
  } else {
    noticeLocalProviderVars();
  }

  const harnessEnv: NodeJS.ProcessEnv = { ...effectiveEnv, DATABASE_URL: TARGET_URL as string };

  runStep(
    "verify-integration-manual-routing-storefront-browser-flow.ts — manual new-outlet route",
    ["tsx", "scripts/verify-integration-manual-routing-storefront-browser-flow.ts"],
    { ...harnessEnv, BROWSER_FLOW_BASE_URL: BASE_URL as string }
  );

  runStep(
    "verify-derived-scheduling-browser.ts — native no-deposit booking",
    ["tsx", "scripts/verify-derived-scheduling-browser.ts"],
    { ...harnessEnv, BASE_URL: BASE_URL as string }
  );

  console.log(`\n  Both harnesses passed against ${BASE_URL}.\n`);
}

main().catch((e) => {
  // REVIEW OF c687467: top-level error output must never leak a raw
  // connection string (a thrown Prisma/fetch error can legitimately
  // embed one) or the bypass token.
  console.error(sanitizeForLog(e instanceof Error ? e.stack ?? e.message : String(e), [process.env.VERCEL_AUTOMATION_BYPASS_SECRET]));
  process.exitCode = 1;
});
