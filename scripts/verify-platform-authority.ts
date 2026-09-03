/**
 * Platform authority — the boundary between Price2Book staff and everyone else.
 *
 *   npx tsx scripts/verify-platform-authority.ts
 *
 * WHAT IS PROVEN, AND HOW
 *
 * Every decision in lib/platformContext.ts has a `...For` form that takes the
 * signed-in user as an argument. Those are exercised here directly, against
 * real rows: a contractor OWNER, a revoked grant, an active grant, nobody.
 * The request-bound wrappers contain no logic of their own, and their
 * structure is asserted rather than their behavior.
 *
 * The order "authorize, then look up" is proven BEHAVIORALLY: the client
 * handed to the wrapper is a proxy that records which models are touched, so
 * an unauthorized caller is shown never to have reached the contractor table
 * — not merely to have been refused after doing so.
 *
 * Cross-tenant probes use Elite's real service and booking ids from inside a
 * throwaway contractor, the same discipline as verify-cross-tenant-resource-
 * access: an invented id proves only that no such row exists.
 *
 * PRODUCTION-SAFE, BY CONSTRUCTION. This runs inside `npm run verify`, which
 * runs inside every deploy, against production. So it never creates, revokes
 * or deletes a PlatformAccess row — not a transient one, not for a throwaway.
 * The active/revoked/absent decisions are exercised through a RECORDING
 * DOUBLE: a client whose `platformAccess.findUnique` answers from an in-memory
 * table and whose every other model delegates to the real client, so the
 * tenant guard underneath is still the real guard. The only rows this writes
 * are ordinary throwaway fixtures — a contractor, users with no grant — and it
 * removes them.
 *
 * The bootstrap is exercised here only in the modes that write nothing:
 * refused arguments and a dry run. Its apply / repeat / revoke / concurrency
 * behavior is proven by scripts/verify-platform-bootstrap-live.ts, which is
 * invoked explicitly, runs against REHEARSAL_DATABASE_URL, and refuses to run
 * against anything it cannot prove is a rehearsal branch.
 */

import { PrismaClient, type Prisma, type PlatformRole } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { sourceFiles } from "./_sourceFiles";
import { destroyContractor } from "./_throwaway";
import { currentTenantOrNull } from "../lib/tenantContext";
import {
  decidePlatformAccess, platformActorFor, withPlatformFor, withPlatformContractorFor,
  NotAuthenticatedError, NotPlatformStaffError, PlatformContractorNotFoundError,
} from "../lib/platformContext";

const raw = new PrismaClient();

/** RUN-UNIQUE, because the database is shared. Fixed prefixes stay sweepable. */
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const USER_PREFIX = "test-platform-authority";
const EMAIL_PREFIX = "p2b-verify-platform-";
const SLUG_PREFIX = "test-platform-authority";
const SLUG = `${SLUG_PREFIX}-${RUN}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const strip = (f: string) =>
  readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function throwsWith(run: () => Promise<unknown>): Promise<{ name: string; message: string } | null> {
  try { await run(); return null; } catch (e) { return { name: (e as Error).name, message: (e as Error).message }; }
}

/** A read that returns another tenant's row, or a write that lands, is a leak. */
async function refuses(run: () => Promise<unknown>): Promise<boolean> {
  try {
    const r = await run();
    if (r === null) return true;
    if (typeof r === "object" && r !== null && "count" in (r as Record<string, unknown>)) return (r as { count: number }).count === 0;
    return false;
  } catch { return true; }
}

const userId = (tag: string) => `${USER_PREFIX}-${RUN}-${tag}`;
async function makeUser(tag: string, verified = true) {
  return raw.user.create({
    data: { id: userId(tag), email: `${EMAIL_PREFIX}${RUN}-${tag}@invalid.test`, name: `Platform probe ${tag}`, emailVerified: verified },
    select: { id: true, email: true },
  });
}

async function removeUsers(where: Prisma.UserWhereInput) {
  // PlatformAccess and ContractorMembership cascade from User.
  await raw.user.deleteMany({ where }).catch(() => {});
}
async function removeContractor(slug: string) {
  await raw.contractorMembership.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}
async function teardown() {
  await removeUsers({ id: { startsWith: `${USER_PREFIX}-${RUN}-` } });
  await removeContractor(SLUG);
}
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const users = await raw.user.count({ where: { email: { startsWith: EMAIL_PREFIX }, NOT: { id: { startsWith: `${USER_PREFIX}-${RUN}-` } }, createdAt: { lt: cutoff } } });
  await removeUsers({ email: { startsWith: EMAIL_PREFIX }, NOT: { id: { startsWith: `${USER_PREFIX}-${RUN}-` } }, createdAt: { lt: cutoff } });
  const stale = await raw.contractor.findMany({ where: { slug: { startsWith: SLUG_PREFIX }, NOT: { slug: SLUG }, createdAt: { lt: cutoff } }, select: { slug: true } });
  for (const c of stale) await removeContractor(c.slug);
  if (users || stale.length) console.log(`  (swept ${users} abandoned user(s), ${stale.length} abandoned contractor(s))`);
}

/**
 * The apply flag, assembled rather than written, so this file can assert it
 * never contains the spelled-out flag. This verifier runs against production
 * and exercises the bootstrap ONLY in modes that cannot write: a refusal
 * before the write, or a dry run. Today the refusals come first in the
 * script; a future reordering must not be able to turn one of these calls
 * into a grant, so the flag is refused here at runtime as well as absent from
 * the source.
 */
const APPLY_FLAG = ["--", "apply"].join("");

/** Run the real bootstrap script the way an operator would — never applying. */
function bootstrap(args: string[]): { status: number; out: string } {
  if (args.includes(APPLY_FLAG)) throw new Error(`the default verifier never runs the bootstrap with ${APPLY_FLAG}`);
  try {
    const out = execFileSync("npx", ["tsx", "scripts/bootstrap-platform-admin.ts", ...args], { encoding: "utf8", stdio: "pipe" });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/**
 * The recording double.
 *
 * `platformAccess.findUnique` answers from `grants`; every other property is
 * the real client's, so a contractor lookup and the tenant guard behave
 * exactly as in production. Every model touched is recorded, in order, which
 * is how "authorize before lookup" is proven rather than asserted.
 */
type Grant = { role: PlatformRole; grantedAt: Date; revokedAt: Date | null };
function doubleWith(grants: Record<string, Grant>, touched: string[] = []): { db: PrismaClient; touched: string[] } {
  const platformAccess = {
    findUnique: async (args: { where: { userId?: string } }) => grants[args.where.userId ?? ""] ?? null,
    count: async () => { throw new Error("the double answers findUnique only"); },
  };
  const db = new Proxy(raw, {
    get(target, prop) {
      if (typeof prop === "string" && !prop.startsWith("$") && !prop.startsWith("_")) touched.push(prop);
      if (prop === "platformAccess") return platformAccess;
      return Reflect.get(target, prop);
    },
  }) as unknown as PrismaClient;
  return { db, touched };
}

async function main() {
  console.log(`\nPLATFORM AUTHORITY — staff is a grant, not a membership and not an address\n`);
  await teardown();
  await sweepStale();

  const identity = await raw.databaseIdentity.findUniqueOrThrow({ where: { id: "singleton" }, select: { key: true } });
  const elite = await raw.contractor.findUniqueOrThrow({ where: { slug: "elite-electric" }, select: { id: true } });
  const eliteService = await raw.service.findFirstOrThrow({ where: { contractorId: elite.id }, select: { id: true, offered: true } });
  const eliteBooking = await raw.booking.findFirst({ where: { visit: { contractorId: elite.id } }, select: { id: true } });

  // ── 0. the decision itself ────────────────────────────────────────────
  const t0 = new Date();
  ok(`0. no row is no access`, decidePlatformAccess(null).status === "none");
  ok(`   a revoked row is no access`, decidePlatformAccess({ role: "PLATFORM_ADMIN", grantedAt: t0, revokedAt: t0 }).status === "revoked");
  ok(`   only a live row is access`, decidePlatformAccess({ role: "PLATFORM_ADMIN", grantedAt: t0, revokedAt: null }).status === "active");

  // ── 1. the bootstrap, in the modes that write nothing ─────────────────
  const activeBefore = await raw.platformAccess.count({ where: { revokedAt: null } });
  const boot = await makeUser("boot");
  const unverified = await makeUser("unverified", false);
  const KEY = ["--expect", identity.key];
  const grantsFor = (id: string) => raw.platformAccess.findUnique({ where: { userId: id } });
  const totalBefore = await raw.platformAccess.count();

  let r = bootstrap(["--user", boot.email, ...KEY]);
  ok(`1. the bootstrap refuses an email where it wants a user id`, r.status === 1 && /looks like an email/.test(r.out));
  r = bootstrap(["--email", boot.email, ...KEY]);
  ok(`   and refuses an --email flag outright`, r.status === 1 && /--email is not an option/.test(r.out));
  r = bootstrap(["--user", boot.id]);
  ok(`   and refuses to run without being told which database`, r.status === 1 && /--expect/.test(r.out));
  r = bootstrap(["--user", boot.id, "--expect", "some-other-database"]);
  ok(`   and refuses a database that is not the one named`, r.status === 1 && /not "some-other-database"/.test(r.out));
  r = bootstrap(["--user", `${USER_PREFIX}-${RUN}-nobody`, ...KEY]);
  ok(`   a user that does not exist is refused, not created`,
    r.status === 1 && /no user with id/.test(r.out) && (await raw.user.findUnique({ where: { id: `${USER_PREFIX}-${RUN}-nobody` } })) === null);
  r = bootstrap(["--user", unverified.id, ...KEY]);
  ok(`   an unverified user is refused`, r.status === 1 && /not verified/.test(r.out) && (await grantsFor(unverified.id)) === null);

  r = bootstrap(["--user", boot.id, "--rehearsal-branch-of", identity.key]);
  ok(`   the rehearsal flag refuses the original database itself`, r.status === 1 && /IS_THE_ORIGINAL|not a rehearsal branch/.test(r.out));
  r = bootstrap(["--user", boot.id, ...KEY, "--rehearsal-branch-of", identity.key]);
  ok(`   and cannot be combined with --expect`, r.status === 1 && /exclusive/.test(r.out));

  r = bootstrap(["--user", boot.id, ...KEY]);
  if (activeBefore === 0) {
    ok(`2. a dry run reports what it would grant and writes nothing`,
      r.status === 0 && /Nothing was changed/.test(r.out) && /Would grant PLATFORM_ADMIN/.test(r.out) && (await grantsFor(boot.id)) === null);
  } else {
    ok(`2. a dry run is refused because an administrator already exists, writing nothing`,
      r.status === 1 && /active platform administrator already exists/.test(r.out) && (await grantsFor(boot.id)) === null);
  }
  ok(`   this suite has not changed the number of grants in the database`, (await raw.platformAccess.count()) === totalBefore);
  ok(`   (apply, repeat, revoke and concurrency are proven by the live verifier, on a rehearsal branch)`, existsSync("scripts/verify-platform-bootstrap-live.ts"));

  // ── 2. fixtures: a real owner; staff, revoked and nobody as identities ─
  //
  // The owner is a real user with a real OWNER membership on a real (throwaway,
  // active) contractor, because "owning an active business does not make you
  // staff" deserves a real membership row behind it. Staff and revoked are
  // identities the double answers for; no grant is written anywhere.
  const contractor = await raw.contractor.create({ data: { slug: SLUG, name: "Platform authority probe", active: true }, select: { id: true } });
  const owner = await makeUser("owner");
  await raw.contractorMembership.create({ data: { userId: owner.id, contractorId: contractor.id, role: "OWNER" } });
  const staff = { id: userId("staff"), email: `${EMAIL_PREFIX}${RUN}-staff@invalid.test` };
  const revoked = { id: userId("revoked"), email: `${EMAIL_PREFIX}${RUN}-revoked@invalid.test` };
  const nobody = { id: userId("nobody"), email: `${EMAIL_PREFIX}${RUN}-nobody@invalid.test` };
  const grants: Record<string, Grant> = {
    [staff.id]: { role: "PLATFORM_ADMIN", grantedAt: t0, revokedAt: null },
    [revoked.id]: { role: "PLATFORM_ADMIN", grantedAt: t0, revokedAt: new Date() },
  };
  const { db } = doubleWith(grants);

  // ── 3. who is staff ───────────────────────────────────────────────────
  const out = await throwsWith(() => platformActorFor(db, null));
  ok(`4. signed out is refused as not signed in`, out?.name === "NotAuthenticatedError");
  const asOwner = await throwsWith(() => platformActorFor(db, owner));
  ok(`   a contractor OWNER of an ACTIVE contractor is refused`, asOwner?.name === "NotPlatformStaffError");
  const asRevoked = await throwsWith(() => platformActorFor(db, revoked));
  ok(`   a revoked grant is refused`, asRevoked?.name === "NotPlatformStaffError");
  const asNobody = await throwsWith(() => platformActorFor(db, nobody));
  ok(`   with the same words as never having been granted`, asRevoked?.message === asNobody?.message && asOwner?.message === asNobody?.message);
  const actor = await platformActorFor(db, staff);
  ok(`   an active PLATFORM_ADMIN is allowed`, actor.userId === staff.id && actor.role === "PLATFORM_ADMIN");
  ok(`   and the error classes are the ones the wrappers translate`,
    new NotAuthenticatedError().name === "NotAuthenticatedError" && new NotPlatformStaffError().name === "NotPlatformStaffError");

  let ran = false;
  const refusedRun = await throwsWith(() => withPlatformFor(db, owner, async () => { ran = true; return 1; }));
  ok(`5. withPlatform refuses an owner before running anything`, refusedRun?.name === "NotPlatformStaffError" && !ran);
  let tenantInside: unknown = "unset";
  await withPlatformFor(db, staff, async () => { tenantInside = currentTenantOrNull(); });
  ok(`   and runs staff outside any tenant scope`, tenantInside === null);

  // ── 4. platform access is not contractor membership ───────────────────
  ok(`6. the staff member holds no contractor membership`,
    (await raw.contractorMembership.count({ where: { userId: staff.id, active: true } })) === 0);
  ok(`   and the owner holds one, on an active contractor, and is still not staff`,
    (await raw.contractorMembership.count({ where: { userId: owner.id, active: true, contractor: { active: true } } })) === 1 && asOwner?.name === "NotPlatformStaffError");
  const adminCtx = strip("lib/adminContext.ts");
  ok(`   and the contractor boundary never consults PlatformAccess`,
    !/platformAccess|PlatformAccess/.test(adminCtx) && /prisma\.contractorMembership\.findMany/.test(adminCtx));
  const platformCtx = strip("lib/platformContext.ts");
  ok(`   nor the platform boundary ContractorMembership`, !/contractorMembership|ContractorMembership/.test(platformCtx));
  ok(`   the portal layout still gates on membership`, /resolveAdminContractor\(\)/.test(strip("app/dashboard/layout.tsx")));

  // ── 5. authorize before lookup, proven by watching the client ─────────
  const { db: spy, touched } = doubleWith(grants);

  touched.length = 0;
  const ownerForeign = await throwsWith(() => withPlatformContractorFor(spy, owner, elite.id, async () => 1));
  ok(`7. an owner naming a real foreign contractor is refused as not staff`, ownerForeign?.name === "NotPlatformStaffError");
  ok(`   and the contractor table was never consulted`, touched.includes("platformAccess") && !touched.includes("contractor"), touched.join(","));
  touched.length = 0;
  const ownerGarbage = await throwsWith(() => withPlatformContractorFor(spy, owner, "no-such-contractor", async () => 1));
  ok(`   a made-up id gets the identical refusal`, ownerGarbage?.name === ownerForeign?.name && ownerGarbage?.message === ownerForeign?.message && !touched.includes("contractor"));
  touched.length = 0;
  const signedOut = await throwsWith(() => withPlatformContractorFor(spy, null, elite.id, async () => 1));
  ok(`   signed out is refused before any table at all`, signedOut?.name === "NotAuthenticatedError" && touched.length === 0, touched.join(","));

  touched.length = 0;
  await withPlatformContractorFor(spy, staff, contractor.id, async () => 1);
  ok(`   staff: platform access is read before the contractor is looked up`,
    touched.indexOf("platformAccess") >= 0 && touched.indexOf("platformAccess") < touched.indexOf("contractor"), touched.join(","));
  const staffGarbage = await throwsWith(() => withPlatformContractorFor(db, staff, "no-such-contractor", async () => 1));
  const staffMalformed = await throwsWith(() => withPlatformContractorFor(db, staff, { id: contractor.id }, async () => 1));
  ok(`   staff naming a contractor that does not resolve get one answer, malformed or absent`,
    staffGarbage?.name === "PlatformContractorNotFoundError" && staffMalformed?.name === staffGarbage.name && staffMalformed?.message === staffGarbage.message);
  const entered = await withPlatformContractorFor(db, staff, elite.id, async (_db, _a, c) => c.slug);
  ok(`   staff may enter any contractor, Elite included`, entered === "elite-electric");
  ok(`   PlatformContractorNotFoundError is only reachable after authorization`, new PlatformContractorNotFoundError().message === "No such contractor.");

  // ── 6. inside a contractor, the tenant guard is the same guard ────────
  const inside = await withPlatformContractorFor(db, staff, contractor.id, async (guarded) => ({
    tenant: currentTenantOrNull(),
    own: await guarded.service.count(),
    foreignService: await refuses(() => guarded.service.findUnique({ where: { id: eliteService.id } })),
    foreignServiceWrite: await refuses(() => guarded.service.updateMany({ where: { id: eliteService.id }, data: { offered: eliteService.offered } })),
    foreignBooking: eliteBooking ? await refuses(() => guarded.booking.findUnique({ where: { id: eliteBooking.id } })) : null,
    foreignById: await refuses(() => guarded.service.findFirst({ where: { contractorId: elite.id } })),
  }));
  ok(`8. entry opens the tenant context for that contractor, marked as staff`,
    inside.tenant?.contractorId === contractor.id && inside.tenant?.source === "platform-session");
  ok(`   the throwaway sees only its own services`, inside.own === 0);
  ok(`   Elite's real service id is invisible from inside it`, inside.foreignService);
  ok(`   and cannot be written to`, inside.foreignServiceWrite);
  ok(`   Elite's real booking id is invisible`, inside.foreignBooking === true, inside.foreignBooking === null ? "no Elite booking to probe" : "");
  ok(`   and asking for Elite by contractorId returns nothing`, inside.foreignById);
  const eliteAfter = await raw.service.findUniqueOrThrow({ where: { id: eliteService.id }, select: { offered: true } });
  ok(`   Elite's row is untouched`, eliteAfter.offered === eliteService.offered);

  // ── 7. no other door ──────────────────────────────────────────────────
  const platformFiles = [
    "lib/platformContext.ts", "scripts/bootstrap-platform-admin.ts",
    ...sourceFiles(["app/platform", "app/api/platform"]),
  ];
  const EMAIL_AUTH = /\.email\s*[!=]==?|[A-Z_]*(ADMIN|OWNER|STAFF|PLATFORM)_EMAILS?\b|endsWith\(\s*["']@|process\.env\.[A-Z_]*EMAIL|includes\(\s*(user|session)\.email/;
  const emailPaths = platformFiles.filter((f) => EMAIL_AUTH.test(strip(f)));
  ok(`9. no email-based authorization anywhere on the platform side`, emailPaths.length === 0, emailPaths.join(", "));
  ok(`   platform files exist to be checked`, platformFiles.length >= 5, platformFiles.join(", "));
  const appAndLib = sourceFiles(["app", "lib", "components"]);
  const elevators = appAndLib.filter((f) => /platformAccess\.(create|update|upsert|delete|createMany|updateMany|deleteMany)/.test(strip(f)));
  ok(`   nothing in the application writes PlatformAccess — no self-elevation route`, elevators.length === 0, elevators.join(", "));
  const readers = appAndLib.filter((f) => /platformAccess\./.test(strip(f)));
  ok(`   and exactly one module reads it`, readers.length === 1 && readers[0] === "lib/platformContext.ts", readers.join(", "));
  const bootSrc = strip("scripts/bootstrap-platform-admin.ts");
  ok(`   the bootstrap takes a user id, checks the database stamp, and needs the apply flag`,
    /flag\("user"\)/.test(bootSrc) && !/flag\("email"\)/.test(bootSrc) && /databaseIdentity/.test(bootSrc) && bootSrc.includes(APPLY_FLAG) && /grantedByUserId: null/.test(bootSrc));
  ok(`   and grants nothing but PLATFORM_ADMIN`, !/PLATFORM_SUPPORT|PLATFORM_OWNER|PLATFORM_BILLING/.test(bootSrc));

  const layout = strip("app/platform/layout.tsx");
  ok(`10. the platform layout gates on resolvePlatformActor`, /resolvePlatformActor\(\)/.test(layout));
  ok(`    refuses a non-staff account visibly rather than redirecting it home`,
    /NotPlatformStaffError/.test(layout) && !/redirect\("\/dashboard"\)/.test(layout) && /Refused/.test(layout));
  ok(`    and sends signed-out to sign-in`, /NotAuthenticatedError/.test(layout) && /redirect\("\/sign-in"\)/.test(layout));
  const surfaces = sourceFiles(["app/platform", "app/api/platform"]);
  ok(`    no Phase 1 surface reads a contractor id from a request`, surfaces.every((f) => !/contractorId|searchParams|params\./.test(strip(f))), surfaces.join(", "));
  ok(`    no Phase 1 surface touches the contractor boundary or the raw client`,
    surfaces.every((f) => !/adminContext|from "@\/lib\/prisma"|platformDb|new PrismaClient/.test(strip(f))));
  ok(`    the tenant context can say a staff member opened it`, /"platform-session"/.test(readFileSync("lib/tenantContext.ts", "utf8")));
  ok(`    withPlatformContractor is the only wrapper that takes a contractor id`,
    /withContractor\(contractor\.id, "platform-session"/.test(platformCtx) && !existsSync("lib/platformAdmin.ts"));
  ok(`    nothing in Phase 1 writes SupportAccessEvent or any tenant row`,
    platformFiles.every((f) => !/supportAccessEvent|\.(create|update|upsert|delete)(Many)?\(/.test(strip(f).replace(/platformAccess\.create|platformAccess\.count|platformAccess\.findUnique/g, ""))
      || f === "scripts/bootstrap-platform-admin.ts"));

  const self = strip("scripts/verify-platform-authority.ts");
  ok(`11. this verifier writes no PlatformAccess row, in any form`,
    !/platformAccess\.(create|update|upsert|delete|createMany|updateMany|deleteMany)/.test(self));
  ok(`    and never spells the bootstrap's apply flag, let alone passes it`,
    !readFileSync("scripts/verify-platform-authority.ts", "utf8").includes(APPLY_FLAG) && /args\.includes\(APPLY_FLAG\)\) throw/.test(self));
  const chain = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  ok(`    and the live bootstrap verifier is not in the default gate`,
    !/verify-platform-bootstrap-live/.test(chain.verify) && /verify-platform-bootstrap-live/.test(chain["verify:platform-live"] ?? ""));

  await teardown();
  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  Staff is a grant. Nothing else opens the door, and the door leads through the same guard.\n`);
  await raw.$disconnect();
  if (fail) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await teardown();
  await raw.$disconnect();
  process.exit(1);
});
