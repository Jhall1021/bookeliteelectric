import { PrismaClient } from "@prisma/client";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { migrateRouteCompleteExtensions } from "../prisma/seed-route-complete-extensions";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const CONTRACTOR = "electrical-onboarding-test";
const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const SLUGS = [
  "new-120v-outlet", "surface-mounted-switch",
  "new-ethernet-line", "new-coax-line", "new-video-doorbell-wiring", "new-ceiling-fan", "new-ceiling-light", "new-wall-sconce",
  "recessed-lighting", "new-exterior-lighting-locations",
] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: production lineage/marker guard failed`);
  }
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: CONTRACTOR }, select: { id: true } });
    const migrated = await migrateRouteCompleteExtensions(db, CONTRACTOR);
    for (const row of migrated) console.log(`tree ${row.slug}: ${row.questionCount} questions`);
    const services = await db.service.findMany({ where: { contractorId: contractor.id, slug: { in: [...SLUGS] } }, select: { id: true, slug: true } });
    for (const slug of SLUGS) {
      const service = services.find((candidate) => candidate.slug === slug);
      if (!service) throw new Error(`missing ${slug}`);
      const result = await decideDerivedPricingApproval(db, { contractorId: contractor.id }, { action: "approve", serviceId: service.id });
      if (result.status !== 200) throw new Error(`${slug} approval failed: ${JSON.stringify(result.body)}`);
      console.log(`approved ${slug}: ${JSON.stringify(result.body)}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
