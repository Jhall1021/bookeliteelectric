/**
 * Builds the guard environment `verify-remote-launch-readiness.ts` checks a
 * remote target against — from the CLI flags it actually parsed, not the
 * ambient process.env, which never carries --expect-endpoint, --expect-
 * project, --expect-database, or --production-url at all (those exist only
 * as that script's own local consts until copied
 * somewhere). This is called ONCE, before the first guard check, and the
 * SAME resulting object is what init/harness envs are derived from — so
 * there is one verified configuration used throughout, not several that
 * could silently disagree.
 *
 * Extracted to its own module so the flags-vs-ambient precedence is
 * directly unit-testable without spawning the orchestrator (which would
 * mean re-running a catalog init or the browser harnesses just to prove
 * this ordering — see scripts/verify-effective-guard-env-contract.ts).
 */
export type EffectiveGuardFlags = {
  expectEndpoint?: string;
  expectProject?: string;
  expectDatabase?: string;
  productionUrl?: string;
};

export function buildEffectiveGuardEnv(base: NodeJS.ProcessEnv, flags: EffectiveGuardFlags): NodeJS.ProcessEnv {
  const effectiveEnv: NodeJS.ProcessEnv = { ...base };
  if (flags.expectEndpoint) effectiveEnv.EXPECT_ENDPOINT = flags.expectEndpoint;
  if (flags.expectProject) effectiveEnv.EXPECT_PROJECT = flags.expectProject;
  if (flags.expectDatabase) effectiveEnv.EXPECT_DATABASE = flags.expectDatabase;
  if (flags.productionUrl) effectiveEnv.PRODUCTION_DATABASE_URL = flags.productionUrl;
  return effectiveEnv;
}
