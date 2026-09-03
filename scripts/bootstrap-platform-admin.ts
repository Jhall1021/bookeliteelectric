/**
 * The first platform administrator — bootstrap only.
 *
 *   npx tsx scripts/bootstrap-platform-admin.ts --user <userId> --expect <database key>
 *   npx tsx scripts/bootstrap-platform-admin.ts --user <userId> --expect <database key> --apply
 *
 * WHY THIS EXISTS
 *
 * PlatformAccess is the only thing that makes someone Price2Book staff, and
 * only staff will ever be able to grant it from inside the product. The first
 * grant therefore cannot come from the product. Every system has this moment
 * for its first administrator; the honest answer is a one-time operator step,
 * run knowingly by whoever holds the database credentials, that is never part
 * of the normal path and cannot be reached from the application.
 *
 * WHAT IT REFUSES, AND WHY
 *
 *   an email, or anything that looks like one   Identity is the user id.
 *                                                An email is how someone signs
 *                                                in, not who they are, and a
 *                                                bootstrap keyed on it is one
 *                                                typo from granting the
 *                                                platform to a stranger.
 *   a user that does not exist                   Better Auth owns User. This
 *                                                creates nothing; sign up first.
 *   an unverified user                           Staff must have proved control
 *                                                of their inbox like anyone else.
 *   any ACTIVE platform administrator            Then this is not a bootstrap.
 *                                                The product's own staff
 *                                                management is the path, and
 *                                                until it exists the answer is
 *                                                to build it, not to run this
 *                                                twice.
 *   a REVOKED grant for the target user          Revocation was a decision.
 *                                                Silently reinstating it under
 *                                                the name "bootstrap" would
 *                                                erase that decision without
 *                                                anyone having reversed it.
 *   a database that is not the one you named     `--expect` is required and is
 *                                                checked against the stamped
 *                                                DatabaseIdentity of the live
 *                                                endpoint, the same way
 *                                                verify-database-identity does.
 *                                                A URL is a claim; the stamp
 *                                                is the fact.
 *
 * Report-only by default. `--apply` writes ONE row, in a transaction that
 * re-checks the two refusals that could race, and then reads it back. The
 * grant carries `grantedByUserId: null` — the only grant that legitimately
 * has no granter, and the mark by which it can be told apart later.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./_env";

loadEnv();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Same reduction verify-database-identity uses; see its comment on `-pooler`. */
function liveEndpoint(u: string): string {
  const host = u.replace(/^.*@/, "").split("/")[0];
  return host.split(".")[0].replace(/-pooler$/, "");
}

export type BootstrapOutcome =
  | { kind: "REFUSED"; reason: string }
  | { kind: "DRY_RUN"; userId: string }
  | { kind: "GRANTED"; userId: string; platformAccessId: string };

function refuse(reason: string): BootstrapOutcome {
  console.log(`\n  REFUSED  ${reason}\n`);
  return { kind: "REFUSED", reason };
}

export async function bootstrapPlatformAdmin(
  prisma: PrismaClient,
  opts: { userId: string | undefined; expect: string | undefined; apply: boolean; databaseUrl: string | undefined }
): Promise<BootstrapOutcome> {
  console.log(`\nBOOTSTRAP — first platform administrator`);
  console.log(opts.apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  // ── the arguments, before anything is read ────────────────────────────
  if (process.argv.includes("--email")) {
    return refuse(`--email is not an option. This takes --user <userId>; identity is the id, never the address.`);
  }
  if (!opts.userId) return refuse(`--user <userId> is required.`);
  if (opts.userId.includes("@")) {
    return refuse(`"${opts.userId}" looks like an email address. This takes a user id, never an email.`);
  }
  if (!opts.expect) {
    return refuse(`--expect <database key> is required: say which database you mean, e.g. price2book-production.`);
  }
  if (!opts.databaseUrl) return refuse(`DATABASE_URL is not set.`);

  // ── the database, before the user is looked up ────────────────────────
  const endpoint = liveEndpoint(opts.databaseUrl);
  const identity = await prisma.databaseIdentity.findUnique({ where: { id: "singleton" } });
  console.log(`  database          endpoint=${endpoint}  stamped=${identity ? `${identity.key} @ ${identity.neonEndpoint}` : "UNSTAMPED"}`);
  if (!identity) return refuse(`this database carries no identity marker. Stamp it first (verify-database-identity --stamp).`);
  if (identity.neonEndpoint !== endpoint) {
    return refuse(`the marker was stamped for ${identity.neonEndpoint} but we are connected to ${endpoint} — an un-restamped copy.`);
  }
  if (identity.key !== opts.expect) {
    return refuse(`this database is "${identity.key}", not "${opts.expect}".`);
  }

  // ── the target ────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, email: true, name: true, emailVerified: true, createdAt: true },
  });
  console.log(`  target user       ${opts.userId}`);
  if (!user) return refuse(`no user with id "${opts.userId}". This creates nothing — the person signs up first.`);
  console.log(`                    ${user.name} <${user.email}>  verified=${user.emailVerified}  since ${user.createdAt.toISOString().slice(0, 10)}`);
  if (!user.emailVerified) return refuse(`that user has not verified their email. Staff prove their inbox like anyone else.`);

  const existing = await prisma.platformAccess.findUnique({ where: { userId: user.id } });
  const activeAdmins = await prisma.platformAccess.count({ where: { revokedAt: null } });
  console.log(`  existing grant    ${existing ? `${existing.role} granted ${existing.grantedAt.toISOString().slice(0, 10)}${existing.revokedAt ? `, REVOKED ${existing.revokedAt.toISOString().slice(0, 10)}` : ", active"}` : "none"}`);
  console.log(`  active admins     ${activeAdmins}`);

  if (existing?.revokedAt) {
    return refuse(`that user's platform access was revoked on ${existing.revokedAt.toISOString().slice(0, 10)}. Bootstrap does not reinstate a revoked grant.`);
  }
  if (existing) {
    return refuse(`that user already holds active ${existing.role}. Nothing to bootstrap.`);
  }
  if (activeAdmins > 0) {
    return refuse(`an active platform administrator already exists. This is not a bootstrap; grant access through the product.`);
  }

  if (!opts.apply) {
    console.log(`\n  Would grant PLATFORM_ADMIN to ${user.id} (${user.email}). Nothing was changed. Re-run with --apply.\n`);
    return { kind: "DRY_RUN", userId: user.id };
  }

  // ── the grant, re-checked inside the transaction ──────────────────────
  let created: { id: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const nowActive = await tx.platformAccess.count({ where: { revokedAt: null } });
      if (nowActive > 0) throw new Error("RACE: an active platform administrator appeared");
      const nowExisting = await tx.platformAccess.findUnique({ where: { userId: user.id } });
      if (nowExisting) throw new Error("RACE: the target user gained a grant");
      return tx.platformAccess.create({
        data: { userId: user.id, role: "PLATFORM_ADMIN", grantedByUserId: null },
        select: { id: true },
      });
    });
  } catch (e) {
    return refuse(`nothing was written — ${(e as Error).message}`);
  }

  // Read back rather than reprinting what was sent.
  const check = await prisma.platformAccess.findUniqueOrThrow({
    where: { id: created.id },
    select: { role: true, grantedAt: true, grantedByUserId: true, revokedAt: true, user: { select: { id: true, email: true } } },
  });
  console.log(`\n  GRANTED — read back from the database:`);
  console.log(`      user        ${check.user.id} <${check.user.email}>`);
  console.log(`      role        ${check.role}`);
  console.log(`      granted     ${check.grantedAt.toISOString()}  by ${check.grantedByUserId ?? "nobody — bootstrap"}`);
  console.log(`      revoked     ${check.revokedAt ? check.revokedAt.toISOString() : "no"}\n`);
  return { kind: "GRANTED", userId: check.user.id, platformAccessId: created.id };
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const prisma = new PrismaClient();
  bootstrapPlatformAdmin(prisma, {
    userId: flag("user"),
    expect: flag("expect"),
    apply: process.argv.includes("--apply"),
    databaseUrl: process.env.DATABASE_URL,
  })
    .then((out) => { process.exitCode = out.kind === "REFUSED" ? 1 : 0; })
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
