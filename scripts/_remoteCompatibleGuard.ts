/**
 * The loopback-or-designated-remote guard for browser harnesses that
 * currently call `assertDisposableLocalDatabase` unconditionally
 * (docs/design/electrical-preview-initialization.md §9.3 item 5, §9.6 item
 * 4). DEFAULT BEHAVIOR IS UNCHANGED: a loopback target still goes through
 * `assertDisposableLocalDatabase` exactly as before — same function, same
 * process-exiting refusal. Opting into a REMOTE target requires explicit
 * declaration (`EXPECT_ENDPOINT`/`EXPECT_PROJECT`/`EXPECT_DATABASE`, plus
 * `PRODUCTION_DATABASE_URL` for the lineage reference) and is verified
 * through `init-preview-database.ts`'s own exported `decideRemoteTarget` —
 * the exact endpoint/project/database check plus inherited-lineage
 * classification that script already uses, reused here, never
 * reimplemented or weakened.
 *
 * `PRODUCTION_DATABASE_URL` is a SEPARATE name from `DATABASE_URL`
 * deliberately: `DATABASE_URL` is this harness's own target (the database
 * every write in the script goes to), while `decideRemoteTarget` needs a
 * REFERENCE connection to production to measure its lineage against — the
 * same distinction `verify-remote-launch-readiness.ts`'s own
 * `--production-url` documents.
 *
 * This does not replace `resetRefusal` (`lib/electrical/pilotScope.ts`),
 * which already works correctly for both local and remote targets via the
 * same endpoint-vs-marker comparison — it stays exactly where it runs
 * today, after this guard, checking the fixture SLUG itself.
 */
import type { PrismaClient } from "@prisma/client";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";
import { decideRemoteTarget, readTargetIdentity } from "./init-preview-database";
import { classifyRehearsalTarget } from "./_lineage";

export type GuardOutcome = { ok: true; mode: "local" | "remote" } | { ok: false; reason: string };

function isLoopbackUrl(u: string): boolean {
  try {
    const host = new URL(u.includes("://") ? u : `postgres://${u}`).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

export async function assertLoopbackOrDesignatedRemoteTarget(
  prisma: PrismaClient,
  targetUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: {
    readIdentity?: typeof readTargetIdentity;
    classify?: typeof classifyRehearsalTarget;
  } = {}
): Promise<GuardOutcome> {
  if (isLoopbackUrl(targetUrl)) {
    await assertDisposableLocalDatabase(prisma); // exits the process on failure, exactly as it always has
    return { ok: true, mode: "local" };
  }

  const decision = await decideRemoteTarget({
    targetUrl,
    expectEndpoint: env.EXPECT_ENDPOINT,
    expectProject: env.EXPECT_PROJECT,
    expectDatabase: env.EXPECT_DATABASE,
    productionUrl: env.PRODUCTION_DATABASE_URL,
    readIdentity: deps.readIdentity ?? readTargetIdentity,
    classify: deps.classify ?? classifyRehearsalTarget,
  });
  if (!decision.ok) return { ok: false, reason: decision.reason };
  return { ok: true, mode: "remote" };
}
