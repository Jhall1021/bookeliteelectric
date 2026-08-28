import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./_env";
loadEnv();
(async () => {
  const src = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
  const dst = new PrismaClient({ datasources: { db: { url: process.env.REHEARSAL_DATABASE_URL! } } });
  await dst.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS database_identity (
     id text PRIMARY KEY DEFAULT 'singleton', key text NOT NULL, "neonProject" text NOT NULL,
     "neonEndpoint" text NOT NULL, note text, "stampedAt" timestamp(3) NOT NULL DEFAULT now())`);
  const row = await src.databaseIdentity.findUniqueOrThrow({ where: { id: "singleton" } });
  await dst.databaseIdentity.upsert({ where: { id: "singleton" },
    update: { key: row.key, neonProject: row.neonProject, neonEndpoint: row.neonEndpoint },
    create: { key: row.key, neonProject: row.neonProject, neonEndpoint: row.neonEndpoint } });
  console.log(`  branch now carries the SOURCE's marker verbatim (endpoint=${row.neonEndpoint})`);
  await src.$disconnect(); await dst.$disconnect();
})();
