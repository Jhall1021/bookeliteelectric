/**
 * Proves the actual regression: verify-remote-launch-readiness.ts's
 * documented flags-only invocation must validate the DECLARED target
 * (--expect-endpoint/--expect-project/--expect-database/--production-url),
 * not whatever EXPECT_* / DATABASE_URL happen
 * to be set (or absent) in the calling shell's own ambient environment.
 *
 * Uses the exact exported pieces the orchestrator itself calls —
 * `buildEffectiveGuardEnv` and `assertLoopbackOrDesignatedRemoteTarget` —
 * with an injected identity reader so no real database or network call
 * happens; a non-loopback target never touches the `prisma` argument in
 * the remote branch, so a dummy stand-in is passed. This is a focused unit
 * test of the wiring itself, not a re-run of any harness or catalog build.
 *
 *   npx tsx scripts/verify-effective-guard-env-contract.ts
 */
import type { PrismaClient } from "@prisma/client";
import { assertLoopbackOrDesignatedRemoteTarget } from "./_remoteCompatibleGuard";
import { buildEffectiveGuardEnv } from "./_effectiveGuardEnv";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

const TARGET_URL = "postgresql://user@ep-designated-branch.c-5.us-east-2.aws.neon.tech:5432/rehearsal";
const DUMMY_PRISMA = {} as PrismaClient; // unused by the remote branch — never constructs a real connection

const PRODUCTION_URL = "postgresql://user@ep-production-host.c-5.us-east-2.aws.neon.tech:5432/prod";
const declaredIdentity = { endpoint: "ep-designated-branch", project: "designated-project", database: "rehearsal" };
const injectedReadIdentity = async () => declaredIdentity;
const injectedClassify = async () => ({ ok: true as const, reason: "injected: genuine branch of production", probe: {} as any });

console.log("\nEFFECTIVE GUARD ENV — flags-vs-ambient precedence contract\n");

async function main() {
  // ── 1. buildEffectiveGuardEnv: CLI flags win over conflicting ambient values ──
  {
    const ambient = {
      EXPECT_ENDPOINT: "some-stale-ambient-endpoint",
      EXPECT_PROJECT: "some-stale-ambient-project",
      EXPECT_DATABASE: "some_stale_ambient_db",
      PRODUCTION_DATABASE_URL: "postgresql://user@ambient-production-host/prod",
    } as Partial<NodeJS.ProcessEnv> as NodeJS.ProcessEnv;
    const effective = buildEffectiveGuardEnv(ambient, {
      expectEndpoint: "ep-designated-branch",
      expectProject: "designated-project",
      expectDatabase: "rehearsal",
      productionUrl: "postgresql://user@declared-production-host/prod",
    });
    ok("1a. an explicit --expect-endpoint overrides a conflicting ambient EXPECT_ENDPOINT", effective.EXPECT_ENDPOINT === "ep-designated-branch", effective.EXPECT_ENDPOINT);
    ok("1b. an explicit --expect-project overrides a conflicting ambient EXPECT_PROJECT", effective.EXPECT_PROJECT === "designated-project", effective.EXPECT_PROJECT);
    ok("1c. an explicit --expect-database overrides a conflicting ambient EXPECT_DATABASE", effective.EXPECT_DATABASE === "rehearsal", effective.EXPECT_DATABASE);
    ok("1d. an explicit --production-url overrides a conflicting ambient PRODUCTION_DATABASE_URL", effective.PRODUCTION_DATABASE_URL === "postgresql://user@declared-production-host/prod");
  }

  // ── 2. buildEffectiveGuardEnv: flags populate the guard env when ambient is EMPTY ──
  {
    const emptyAmbient = {} as NodeJS.ProcessEnv;
    const effective = buildEffectiveGuardEnv(emptyAmbient, {
      expectEndpoint: "ep-designated-branch",
      expectProject: "designated-project",
      expectDatabase: "rehearsal",
    });
    ok(
      "2. flags populate EXPECT_* even when the ambient environment carries none of them at all",
      effective.EXPECT_ENDPOINT === "ep-designated-branch" && effective.EXPECT_PROJECT === "designated-project" && effective.EXPECT_DATABASE === "rehearsal"
    );
  }

  // ── 3. THE REGRESSION ITSELF: the orchestrator's flags-only invocation must
  //       validate against the DECLARED target through the real guard function,
  //       even though ambient EXPECT_*/DATABASE_URL are absent or point elsewhere. ──
  {
    const ambientWithNothingDeclared = {} as NodeJS.ProcessEnv; // simulates a caller's shell with no EXPECT_*/PRODUCTION_DATABASE_URL set at all
    const effectiveEnv = buildEffectiveGuardEnv(ambientWithNothingDeclared, {
      expectEndpoint: "ep-designated-branch",
      expectProject: "designated-project",
      expectDatabase: "rehearsal",
      productionUrl: PRODUCTION_URL,
    });

    const decision = await assertLoopbackOrDesignatedRemoteTarget(DUMMY_PRISMA, TARGET_URL, effectiveEnv, {
      readIdentity: injectedReadIdentity,
      classify: injectedClassify,
    });
    ok("3. flags-only invocation validates the DECLARED target via the built effectiveEnv", decision.ok === true && (decision as any).mode === "remote", JSON.stringify(decision));

    // Proves what the bug actually did: passing raw ambient env (no flags copied in)
    // to the SAME guard call refuses, because EXPECT_* are simply absent from it.
    const oldBuggyDecision = await assertLoopbackOrDesignatedRemoteTarget(DUMMY_PRISMA, TARGET_URL, ambientWithNothingDeclared, {
      readIdentity: injectedReadIdentity,
      classify: injectedClassify,
    });
    ok(
      "3b. (the regression) passing raw ambient env directly — the OLD behavior — refuses the same declared target",
      oldBuggyDecision.ok === false,
      JSON.stringify(oldBuggyDecision)
    );
  }

  // ── 4. a genuinely WRONG declared target (flags point somewhere else) still refuses ──
  {
    const effectiveEnv = buildEffectiveGuardEnv({} as NodeJS.ProcessEnv, {
      expectEndpoint: "some-other-endpoint-entirely",
      expectProject: "designated-project",
      expectDatabase: "rehearsal",
      productionUrl: PRODUCTION_URL,
    });
    const decision = await assertLoopbackOrDesignatedRemoteTarget(DUMMY_PRISMA, TARGET_URL, effectiveEnv, {
      readIdentity: injectedReadIdentity,
      classify: injectedClassify,
    });
    ok("4. a declared --expect-endpoint that doesn't match the target's actual identity still refuses — this isn't a rubber stamp", decision.ok === false, JSON.stringify(decision));
  }

  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
