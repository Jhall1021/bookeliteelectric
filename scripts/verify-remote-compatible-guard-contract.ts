/**
 * Proves scripts/_remoteCompatibleGuard.ts's target decision — the guard
 * that replaced verify-integration-manual-routing-storefront-browser-
 * flow.ts's unconditional assertDisposableLocalDatabase call — refuses
 * production, a sibling/mismatched branch, and an undeclared target, and
 * accepts a genuinely designated one. Uses INJECTED readIdentity/classify
 * (the same injectability init-preview-database.ts's own decideRemoteTarget
 * already exposes and scripts/verify-init-preview-database-contract.ts
 * already exercises) — no real Neon connection, no network call, needed or
 * made. The local (loopback) path is proven separately, live, against the
 * real assertDisposableLocalDatabase, which this file does not touch or
 * re-test.
 *
 *   npx tsx scripts/verify-remote-compatible-guard-contract.ts
 *
 * Pure source plus one real local-Postgres call for the loopback case; no
 * DATABASE_URL override, no writes, no cleanup needed.
 */
import { PrismaClient } from "@prisma/client";
import { assertLoopbackOrDesignatedRemoteTarget } from "./_remoteCompatibleGuard";
import type { TargetIdentity } from "./init-preview-database";
import type { Verdict } from "./_lineage";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

const REMOTE_URL = "postgresql://user@ep-designated-branch.c-5.us-east-2.aws.neon.tech/rehearsal";
const PRODUCTION_URL = "postgresql://user@ep-shy-butterfly-ay5t03di.c-5.us-east-2.aws.neon.tech/prod";
const SIBLING_URL = "postgresql://user@ep-sibling-branch.c-5.us-east-2.aws.neon.tech/rehearsal";

const DESIGNATED_IDENTITY: TargetIdentity = { endpoint: "ep-designated-branch.c-5.us-east-2.aws.neon.tech", database: "rehearsal", project: "bitter-bird-20565072" };
const SIBLING_IDENTITY: TargetIdentity = { endpoint: "ep-sibling-branch.c-5.us-east-2.aws.neon.tech", database: "rehearsal", project: "bitter-bird-20565072" };

const acceptClassify = async (): Promise<Verdict> => ({ ok: true, reason: "a branch of price2book-production (canned)", probe: { endpoint: "", lineage: "x", markerKey: "price2book-production", markerEndpoint: "y" } });

// A fake prisma client is never actually used by these paths (only the
// loopback branch touches prisma, and these scenarios are all remote), but
// the function signature takes one — pass a real, unconnected instance.
const fakePrisma = new PrismaClient();

async function main() {
  console.log("\nREMOTE-COMPATIBLE GUARD — injected-identity contract\n");

  // ── 1. undeclared target: no EXPECT_* set ──────────────────────────────
  {
    const r = await assertLoopbackOrDesignatedRemoteTarget(fakePrisma, REMOTE_URL, { ...process.env });
    ok("1. an undeclared remote target refuses (no EXPECT_ENDPOINT/PROJECT/DATABASE)", !r.ok, JSON.stringify(r));
  }

  // ── 2. declared target IS production's own endpoint ────────────────────
  {
    const env = {
      ...process.env,
      EXPECT_ENDPOINT: "ep-shy-butterfly-ay5t03di.c-5.us-east-2.aws.neon.tech",
      EXPECT_PROJECT: "bitter-bird-20565072", EXPECT_DATABASE: "prod",
      PRODUCTION_DATABASE_URL: PRODUCTION_URL,
    };
    const r = await assertLoopbackOrDesignatedRemoteTarget(fakePrisma, PRODUCTION_URL, env);
    ok("2. a target naming production's OWN endpoint refuses, never treated as a branch", !r.ok, JSON.stringify(r));
  }

  // ── 3. declared identity does not match what's actually observed (a sibling branch) ──
  {
    const env = {
      ...process.env,
      EXPECT_ENDPOINT: "ep-designated-branch.c-5.us-east-2.aws.neon.tech", // declares the OTHER branch
      EXPECT_PROJECT: "bitter-bird-20565072", EXPECT_DATABASE: "rehearsal",
      PRODUCTION_DATABASE_URL: PRODUCTION_URL,
    };
    const r = await assertLoopbackOrDesignatedRemoteTarget(fakePrisma, SIBLING_URL, env, {
      readIdentity: async () => SIBLING_IDENTITY, // but this IS the sibling's own real identity
      classify: acceptClassify,
    });
    ok("3. a genuine sibling branch refuses when the declared endpoint doesn't match the one actually connected", !r.ok, JSON.stringify(r));
  }

  // ── 4. declared project does not match the observed marker (a plain mismatch) ──
  {
    const env = {
      ...process.env,
      EXPECT_ENDPOINT: "ep-designated-branch.c-5.us-east-2.aws.neon.tech",
      EXPECT_PROJECT: "some-other-project", EXPECT_DATABASE: "rehearsal",
      PRODUCTION_DATABASE_URL: PRODUCTION_URL,
    };
    const r = await assertLoopbackOrDesignatedRemoteTarget(fakePrisma, REMOTE_URL, env, {
      readIdentity: async () => DESIGNATED_IDENTITY,
      classify: acceptClassify,
    });
    ok("4. a declared project that disagrees with the target's own marker refuses", !r.ok, JSON.stringify(r));
  }

  // ── 5. a genuinely designated, correctly-declared branch is accepted ──
  {
    const env = {
      ...process.env,
      EXPECT_ENDPOINT: "ep-designated-branch.c-5.us-east-2.aws.neon.tech",
      EXPECT_PROJECT: "bitter-bird-20565072", EXPECT_DATABASE: "rehearsal",
      PRODUCTION_DATABASE_URL: PRODUCTION_URL,
    };
    const r = await assertLoopbackOrDesignatedRemoteTarget(fakePrisma, REMOTE_URL, env, {
      readIdentity: async () => DESIGNATED_IDENTITY,
      classify: acceptClassify,
    });
    ok("5. a genuinely designated, correctly-declared branch is accepted (mode: remote)", r.ok && r.mode === "remote", JSON.stringify(r));
  }

  // ── 6. the loopback path is untouched — real assertDisposableLocalDatabase, real local Postgres ──
  {
    const url = process.env.DATABASE_URL;
    if (url) {
      const p = new PrismaClient();
      const r = await assertLoopbackOrDesignatedRemoteTarget(p, url);
      ok("6. a loopback target still dispatches to the real local guard (mode: local)", r.ok && r.mode === "local", JSON.stringify(r));
      await p.$disconnect();
    } else {
      console.log("  6. · no DATABASE_URL set for this run — loopback dispatch not exercised live here");
    }
  }

  await fakePrisma.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
