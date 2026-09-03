/**
 * The first-administrator bootstrap, actually run — on a rehearsal branch.
 *
 *   npm run verify:platform-live
 *   npx tsx scripts/verify-platform-bootstrap-live.ts
 *
 * NOT IN THE DEFAULT GATE, ON PURPOSE. `npm run verify` runs inside every
 * deploy against production and may never create, revoke or delete a
 * PlatformAccess row; scripts/verify-platform-authority.ts proves the
 * decisions with a recording double instead. This is the other half: the
 * apply, repeat, revoke and concurrency behavior that only a real database
 * can prove, run where a real grant is harmless.
 *
 * WHERE IT RUNS, PROVEN POSITIVELY
 *
 * The target is REHEARSAL_DATABASE_URL, and before anything else this asks
 * scripts/_lineage.ts the same question the contract rehearsal asks: is this
 * a branch of the current production lineage whose marker was stamped for a
 * DIFFERENT endpoint? Production fails that test by construction — its marker
 * names the endpoint it is on — and so does the archive, an unrelated
 * database, and one with no marker. Nothing is accepted for merely not being
 * production; it is accepted for being shown to be a branch of it. Then, belt
 * and braces, the target's endpoint must differ from DATABASE_URL's.
 *
 * The bootstrap is invoked in its rehearsal mode (`--rehearsal-branch-of`),
 * which asks the same lineage question again from inside the script, so the
 * script itself refuses the original even if this wrapper were bypassed.
 *
 * DESTRUCTIVE PREPARATION, AFTER THE PROOF AND ONLY THERE
 *
 * A branch of production inherits production's rows — including, once the
 * first real administrator exists, that administrator's PlatformAccess. Left
 * in place it would make the apply and concurrency proofs permanently
 * unreachable ("an administrator already exists"). So, after and only after
 * the target has been accepted as a rehearsal branch, this DELETES EVERY
 * PlatformAccess row on the branch as fixture setup, and says so with a
 * count. On a branch that is a copy, not a decision. Production cannot reach
 * this step: the deletion is performed by a function that re-derives its
 * permission from the same verdict and the same endpoint comparison, and
 * throws before touching anything if either is not what the proof required.
 *
 * CONCURRENCY
 *
 * Two bootstraps are started at the same instant against a database with no
 * administrator, from two separate connections. Exactly one may succeed. The
 * loser must be REFUSED — by the advisory lock making it see the winner's
 * commit, or by SERIALIZABLE isolation rolling it back — and the database
 * must hold exactly one grant afterwards.
 */

import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { loadEnv } from "./_env";
import { classifyRehearsalTarget, endpointOf, type Verdict } from "./_lineage";
import { bootstrapPlatformAdmin } from "./bootstrap-platform-admin";
import { platformActorFor } from "../lib/platformContext";

loadEnv();

const TARGET_VAR = "REHEARSAL_DATABASE_URL";
const target = process.env[TARGET_VAR];
const production = process.env.DATABASE_URL;

const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

/**
 * Remove the grants a branch inherited, so the bootstrap has a database with
 * no administrator to run against. Permission is re-derived here rather than
 * trusted from the caller: the verdict must be an acceptance, the target's
 * endpoint must differ from production's, and the client must be bound to
 * that same target endpoint. Any other state throws before a row is touched.
 */
async function clearInheritedGrants(
  db: PrismaClient, verdict: Verdict, targetUrl: string, productionUrl: string | undefined
): Promise<number> {
  if (!verdict.ok) throw new Error("refusing to clear grants: the target was not accepted as a rehearsal branch");
  if (!productionUrl) throw new Error("refusing to clear grants: production's endpoint is unknown");
  if (endpointOf(targetUrl) === endpointOf(productionUrl)) throw new Error("refusing to clear grants: the target is production's endpoint");
  if (verdict.probe.endpoint !== endpointOf(targetUrl)) throw new Error("refusing to clear grants: the verdict is for a different endpoint");
  if (verdict.probe.markerEndpoint === verdict.probe.endpoint) throw new Error("refusing to clear grants: the marker names this endpoint, so this is an original");
  const inherited = await db.platformAccess.findMany({ select: { userId: true, role: true, revokedAt: true, user: { select: { email: true } } } });
  if (inherited.length) {
    console.log(`  PREPARING  deleting ${inherited.length} PlatformAccess row(s) the branch inherited — rehearsal fixture setup, on a copy:`);
    for (const g of inherited) console.log(`             ${g.role}${g.revokedAt ? " (revoked)" : ""}  ${g.user.email}`);
  }
  const { count } = await db.platformAccess.deleteMany({});
  return count;
}
const USER_PREFIX = "test-platform-bootstrap-live";
const EMAIL_PREFIX = "p2b-verify-platform-live-";
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

function bootstrap(args: string[]): { status: number; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", "scripts/bootstrap-platform-admin.ts", "--url-var", TARGET_VAR, ...args], { encoding: "utf8", stdio: "pipe" });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

async function main() {
  console.log(`\nPLATFORM BOOTSTRAP — LIVE, on a rehearsal branch\n`);
  if (!target) {
    console.error(`  REFUSING: ${TARGET_VAR} is not set. This runs only against a proven rehearsal branch.\n`);
    process.exit(1);
  }

  // ── where are we, really ──────────────────────────────────────────────
  const verdict = await classifyRehearsalTarget(target, production);
  console.log(`  target    ${verdict.probe.endpoint}  lineage=${verdict.probe.lineage ?? "unreadable"}  marker=${verdict.probe.markerKey ?? "none"}${verdict.probe.markerEndpoint ? ` @ ${verdict.probe.markerEndpoint}` : ""}`);
  if (!verdict.ok) {
    console.error(`  REFUSING (${verdict.code}): ${verdict.reason}\n`);
    process.exit(1);
  }
  if (production && endpointOf(production) === verdict.probe.endpoint) {
    console.error(`  REFUSING: ${TARGET_VAR} points at the same endpoint as DATABASE_URL.\n`);
    process.exit(1);
  }
  console.log(`  ACCEPTED  ${verdict.reason}\n`);
  const branchOf = verdict.probe.markerKey!;

  const db = new PrismaClient({ datasources: { db: { url: target } } });
  const userId = (tag: string) => `${USER_PREFIX}-${RUN}-${tag}`;
  const makeUser = (tag: string) => db.user.create({
    data: { id: userId(tag), email: `${EMAIL_PREFIX}${RUN}-${tag}@invalid.test`, name: `Bootstrap probe ${tag}`, emailVerified: true },
    select: { id: true, email: true },
  });
  const grantsFor = (id: string) => db.platformAccess.findUnique({ where: { userId: id } });
  const teardown = async () => {
    await db.user.deleteMany({ where: { id: { startsWith: `${USER_PREFIX}-${RUN}-` } } }).catch(() => {});
  };
  const sweep = async () => {
    const n = await db.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX }, NOT: { id: { startsWith: `${USER_PREFIX}-${RUN}-` } }, createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } } }).catch(() => ({ count: 0 }));
    if (n.count) console.log(`  (swept ${n.count} abandoned user(s))`);
  };

  try {
    await sweep();
    // This suite needs a database with no administrator. A branch inherits
    // production's grants, so they are cleared here — after the proof above,
    // through a function that re-checks it. See the header.
    const cleared = await clearInheritedGrants(db, verdict, target, production);
    ok(`0. the branch starts with no administrator (${cleared} inherited row(s) cleared as fixture setup)`,
      (await db.platformAccess.count()) === 0);

    const a = await makeUser("a");
    const b = await makeUser("b");
    const MODE = ["--rehearsal-branch-of", branchOf];

    // ── 1. the negative controls still hold in rehearsal mode ─────────────
    let r = bootstrap(["--user", a.id, "--expect", branchOf]);
    ok(`1. --expect refuses the branch, because it is not the original`, r.status === 1 && /un-restamped copy|stamped for/.test(r.out));
    r = bootstrap(["--user", a.id, "--rehearsal-branch-of", "some-other-database"]);
    ok(`   and rehearsal mode refuses a branch of the wrong database`, r.status === 1 && /branch of "/.test(r.out));

    // ── 2. dry run, apply, repeat ─────────────────────────────────────────
    r = bootstrap(["--user", a.id, ...MODE]);
    ok(`2. a dry run reports the grant and writes nothing`,
      r.status === 0 && /Nothing was changed/.test(r.out) && /Would grant PLATFORM_ADMIN/.test(r.out) && (await grantsFor(a.id)) === null);
    r = bootstrap(["--user", a.id, ...MODE, "--apply"]);
    const granted = await grantsFor(a.id);
    ok(`   --apply grants exactly one PLATFORM_ADMIN, by nobody`,
      r.status === 0 && /GRANTED/.test(r.out) && granted?.role === "PLATFORM_ADMIN" && granted.grantedByUserId === null && granted.revokedAt === null);
    ok(`   and reports the target it read back`, new RegExp(`user\\s+${a.id} <${a.email}>`).test(r.out));
    const actor = await platformActorFor(db, a);
    ok(`   the grant the bootstrap wrote is the grant the boundary reads`, actor.userId === a.id && actor.role === "PLATFORM_ADMIN");
    r = bootstrap(["--user", a.id, ...MODE, "--apply"]);
    ok(`   running it again for the same user is refused`, r.status === 1 && /already holds active/.test(r.out));
    r = bootstrap(["--user", b.id, ...MODE, "--apply"]);
    ok(`   and for anyone else, because an administrator now exists`,
      r.status === 1 && /active platform administrator already exists/.test(r.out) && (await grantsFor(b.id)) === null);
    ok(`   with still exactly one grant`, (await db.platformAccess.count()) === 1);

    // ── 3. revocation is a decision the bootstrap does not undo ───────────
    await db.platformAccess.update({ where: { userId: a.id }, data: { revokedAt: new Date() } });
    r = bootstrap(["--user", a.id, ...MODE, "--apply"]);
    ok(`3. a revoked grant is not reinstated`, r.status === 1 && /revoked/.test(r.out) && (await grantsFor(a.id))?.revokedAt !== null);
    r = bootstrap(["--user", a.id, ...MODE]);
    ok(`   not even as a dry run`, r.status === 1 && /revoked/.test(r.out));
    r = bootstrap(["--user", b.id, ...MODE, "--apply"]);
    ok(`   while a first grant to someone else is still a bootstrap`, r.status === 0 && (await grantsFor(b.id))?.revokedAt === null);

    // ── 4. two operators at the same instant ──────────────────────────────
    await db.platformAccess.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
    const c = await makeUser("c");
    const d = await makeUser("d");
    const conn1 = new PrismaClient({ datasources: { db: { url: target } } });
    const conn2 = new PrismaClient({ datasources: { db: { url: target } } });
    const opts = (id: string) => ({ userId: id, apply: true, databaseUrl: target, rehearsalBranchOf: branchOf, productionUrl: production });
    const [o1, o2] = await Promise.all([bootstrapPlatformAdmin(conn1, opts(c.id)), bootstrapPlatformAdmin(conn2, opts(d.id))]);
    await conn1.$disconnect(); await conn2.$disconnect();
    const outcomes = [o1.kind, o2.kind].sort().join("+");
    const grants = await db.platformAccess.findMany({ where: { userId: { in: [c.id, d.id] } } });
    ok(`4. two simultaneous bootstraps: exactly one is granted`, outcomes === "GRANTED+REFUSED", outcomes);
    ok(`   and the database holds exactly one grant`, grants.length === 1 && grants[0].revokedAt === null, `${grants.length} grant(s)`);
    const loser = o1.kind === "REFUSED" ? o1 : o2;
    ok(`   the loser was told why`, loser.kind === "REFUSED" && /committed first|gained a grant|serialization/.test(loser.reason), loser.kind === "REFUSED" ? loser.reason : "");
    // Same pair again, twice more: a lock that only worked once would show here.
    let stable = true;
    for (let i = 0; i < 2 && stable; i++) {
      await db.platformAccess.deleteMany({ where: { userId: { in: [c.id, d.id] } } });
      const k1 = new PrismaClient({ datasources: { db: { url: target } } });
      const k2 = new PrismaClient({ datasources: { db: { url: target } } });
      const [p1, p2] = await Promise.all([bootstrapPlatformAdmin(k1, opts(d.id)), bootstrapPlatformAdmin(k2, opts(c.id))]);
      await k1.$disconnect(); await k2.$disconnect();
      const n = await db.platformAccess.count({ where: { userId: { in: [c.id, d.id] } } });
      stable = [p1.kind, p2.kind].sort().join("+") === "GRANTED+REFUSED" && n === 1;
    }
    ok(`   and it holds on repetition`, stable);
  } finally {
    await teardown();
    const left = await db.platformAccess.count({ where: { user: { email: { startsWith: EMAIL_PREFIX } } } });
    ok(`5. teardown left no probe grant behind`, left === 0, `${left} left`);
    await db.$disconnect();
  }

  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  One bootstrap, once, where a real grant is harmless.\n`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
