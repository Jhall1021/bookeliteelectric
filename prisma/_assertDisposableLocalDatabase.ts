/**
 * Refuses to run against anything but an explicitly identified disposable
 * local database. Two independent checks, both required:
 *
 *   1. A structural fact about the connection string — `DATABASE_URL`
 *      resolves to a loopback host. True regardless of what any table says.
 *   2. A stamped identity row (ADR-013, scripts/verify-database-identity.ts)
 *      whose `key` starts with `local-` — an operator's explicit, recorded
 *      decision that THIS database is a disposable rehearsal one, the same
 *      mechanism `verify-database-identity.ts --stamp` writes, reused here
 *      rather than duplicated.
 *
 * Neither check alone is enough: a bare loopback check would pass against a
 * local Postgres somebody pointed at a restored production dump by mistake,
 * and a bare identity check would trust a stamp that could in principle be
 * copied along with the data it exists to catch copies of — the same class
 * of problem ADR-013 documents for Neon branches.
 *
 * Shared by every script in this repo that mutates a database outside the
 * normal seed/migrate chain and must never run against a shared or
 * production target: prisma/bootstrap-rehearsal-contractor.ts,
 * prisma/migrate-guided-flow-session-active-key.ts. An
 * `import.meta.url === pathToFileURL(...)` entrypoint guard says a script is
 * being run directly rather than imported — it says nothing about which
 * database the connected Prisma client points at, and is not a substitute
 * for this.
 */
import type { PrismaClient } from "@prisma/client";

export async function assertDisposableLocalDatabase(prisma: PrismaClient): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^.*@/, "").split(/[:/]/)[0];
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.error(
      `\n  REFUSING TO RUN: DATABASE_URL host is "${host || "(unset)"}", not a loopback address.\n` +
      `  This script mutates rows and must only ever run against a disposable local Postgres\n` +
      `  cluster — never a shared or production database.\n`
    );
    process.exit(1);
  }

  let identity: { key: string } | null;
  try {
    identity = await prisma.databaseIdentity.findUnique({ where: { id: "singleton" }, select: { key: true } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2021") {
      console.error(
        `\n  REFUSING TO RUN: this database has no DatabaseIdentity table at all — it has not\n` +
        `  been stamped, so it cannot be confirmed as a disposable rehearsal database. Run\n` +
        `  \`npx tsx scripts/verify-database-identity.ts --stamp --expect local-<name> --project local-disposable-not-neon\`\n` +
        `  first, once you have decided this connection is safe to write to.\n`
      );
      process.exit(1);
    }
    throw e;
  }
  if (!identity || !identity.key.startsWith("local-")) {
    console.error(
      `\n  REFUSING TO RUN: DATABASE_URL is a loopback address, but this database's stamped\n` +
      `  identity is ${identity ? `"${identity.key}"` : "MISSING"}, not a "local-*" key.\n` +
      `  A loopback host alone is not proof this is the disposable database this task owns —\n` +
      `  stamp it explicitly first with\n` +
      `  \`npx tsx scripts/verify-database-identity.ts --stamp --expect local-<name> --project local-disposable-not-neon\`.\n`
    );
    process.exit(1);
  }
  console.log(`  DATABASE TARGET CONFIRMED: loopback host, identity key "${identity.key}"\n`);
}
