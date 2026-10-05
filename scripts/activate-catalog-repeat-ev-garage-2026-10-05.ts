/**
 * Publish the catalog cleanup and bounded garage pricing requested during the
 * electrical-onboarding-test audit. Report-only unless --apply is supplied.
 */
import { PrismaClient } from "@prisma/client";

import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { migrateGarageOpenerToV2 } from "../prisma/seed-garage-opener-v2";
import { migrateLevel2EvCharger } from "../prisma/seed-level-2-ev-charger";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUG = "electrical-onboarding-test";

async function approve(db: PrismaClient, contractorId: string, serviceId: string, label: string) {
  const result = await decideDerivedPricingApproval(
    db,
    { contractorId, userId: null },
    { action: "approve", serviceId },
  );
  if (result.status !== 200) {
    throw new Error(`${label} was not ready for instant pricing: ${JSON.stringify(result.body)}`);
  }
}

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
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: CONTRACTOR_SLUG },
      select: { id: true },
    });
    const services = await db.service.findMany({
      where: {
        contractorId: contractor.id,
        slug: { in: ["level-2-ev-charger", "garage-door-opener-outlet", "fan-replacing-light"] },
      },
      select: { slug: true, name: true, pricingMethod: true },
      orderBy: { slug: "asc" },
    });
    console.log(`${CONTRACTOR_SLUG}: ${services.map((service) => `${service.slug} (${service.pricingMethod})`).join(", ")}`);
    if (!apply) {
      console.log("Report only. Re-run with --apply to publish and approve the bounded instant-price routes.");
      return;
    }

    await db.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaClient;
      await tx.service.updateMany({
        where: { contractorId: contractor.id, slug: "fan-replacing-light" },
        data: { name: "Remove Existing Light and Replace with Ceiling Fan" },
      });

      const garage = await migrateGarageOpenerToV2(scoped, CONTRACTOR_SLUG);
      await approve(scoped, contractor.id, garage.serviceId, "Garage-door opener outlet");

      const ev = await migrateLevel2EvCharger(scoped, CONTRACTOR_SLUG);
      await approve(scoped, contractor.id, ev.serviceId, "Hardwired Level 2 EV charger");
    }, { timeout: 120_000 });

    console.log("Published the fan name, garage-door opener flow, and bounded Level 2 EV charger pricing.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
