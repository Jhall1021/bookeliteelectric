/**
 * Publish the fan finished-route diagrams and the concealed-vs-Wiremold help
 * choice to the electrical template owner and onboarding test catalog.
 *
 * Report only by default. Pass --apply after the production identity guard.
 */
import { PrismaClient } from "@prisma/client";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import {
  FAN_ROUTE_METHOD_HELP_KEY,
  migrateNewCeilingFanToV2,
} from "../prisma/seed-new-ceiling-fan-v2";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`refusing ${identity.endpoint}: production lineage/marker guard failed`);
  }

  const apply = process.argv.includes("--apply");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    for (const contractorSlug of CONTRACTORS) {
      const service = await db.service.findFirst({
        where: { slug: "new-ceiling-fan", contractor: { slug: contractorSlug } },
        select: { id: true },
      });
      if (!service) throw new Error(`${contractorSlug}/new-ceiling-fan was not found`);
      console.log(`${contractorSlug}/new-ceiling-fan: ${apply ? "will publish" : "ready for"} finished-route guides`);
      if (!apply) continue;
      await migrateNewCeilingFanToV2(db, contractorSlug);
      if (contractorSlug === "electrical-onboarding-test") {
        const result = await decideDerivedPricingApproval(
          db,
          { contractorId: (await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } })).id },
          { action: "approve", serviceId: service.id },
        );
        if (result.status !== 200) throw new Error(`fan approval failed: ${JSON.stringify(result.body)}`);
      }
    }

    if (apply) {
      const count = await db.question.count({
        where: {
          key: FAN_ROUTE_METHOD_HELP_KEY,
          service: { slug: "new-ceiling-fan", contractor: { slug: { in: [...CONTRACTORS] } } },
        },
      });
      if (count !== CONTRACTORS.length) throw new Error(`expected ${CONTRACTORS.length} fan comparison questions; found ${count}`);
      console.log("Fan finished-route guides published.");
    } else {
      console.log("Report only. Re-run with --apply to publish the guarded catalog update.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
