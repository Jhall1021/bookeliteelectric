import { PrismaClient } from "@prisma/client";

// Standard Next.js singleton pattern — prevents exhausting Neon's
// connection limit from hot-reload creating a new client every save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
