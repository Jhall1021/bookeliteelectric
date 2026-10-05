/**
 * Add the concealed-vs-Wiremold help step to installed Routing V2 outlet
 * trees. Report-only unless --apply is supplied.
 */
import { PrismaClient } from "@prisma/client";
import {
  migrateOutletToV2,
  OUTLET_SLUG,
  OUTLET_V2_KEYS,
} from "../prisma/seed-new-outlet-v2";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");

  const identity = await probe(targetUrl);
  if (
    identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT ||
    identity.lineage !== PRODUCTION_LINEAGE ||
    identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT
  ) {
    throw new Error(
      `Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`,
    );
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const targets = await db.service.findMany({
      where: {
        slug: OUTLET_SLUG,
        questions: { some: { key: OUTLET_V2_KEYS.method, options: { some: {} } } },
      },
      select: { id: true, active: true, contractor: { select: { slug: true } } },
      orderBy: { contractorId: "asc" },
    });
    if (targets.length === 0) throw new Error("No installed Routing V2 outlet trees were found.");

    console.log(`OUTLET WIRING-METHOD COMPARISON — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    for (const target of targets) {
      console.log(`  ${target.contractor.slug}: ${target.active ? "active" : "inactive"} (${target.id})`);
    }
    if (!apply) {
      console.log(`  Report only. Re-run with --apply to update ${targets.length} Routing V2 tree(s).`);
      return;
    }

    for (const target of targets) {
      await migrateOutletToV2(db, target.id);
      console.log(`  updated ${target.contractor.slug}`);
    }
    console.log(`  Published the comparison step to ${targets.length} installed tree(s).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
