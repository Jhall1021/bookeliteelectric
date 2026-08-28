import { PrismaClient } from "@prisma/client";
import { writeFreezeExtension } from "./writeFreeze";

// Standard Next.js singleton pattern — prevents exhausting Neon's
// connection limit from hot-reload creating a new client every save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The write freeze wraps the BASE client, so it covers everything derived
 * from it — the tenant-guarded client, interactive transactions, and the
 * unguarded paths classified as exceptions. See lib/writeFreeze.ts.
 *
 * Off unless WRITE_FREEZE is set, so this is inert in normal operation.
 */
function build(): PrismaClient {
  return new PrismaClient().$extends(writeFreezeExtension) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? build();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
