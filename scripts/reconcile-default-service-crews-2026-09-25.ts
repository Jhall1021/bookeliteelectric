/**
 * Make one electrician the prepared electrical-catalog baseline.
 *
 * Report-only unless --apply is supplied. The contractor write is deliberately
 * limited to the disposable onboarding test account. Established contractors'
 * staffing decisions are never overwritten. No price is approved or published.
 */
import { PrismaClient } from "@prisma/client";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const CONTRACTOR_SLUG = "electrical-onboarding-test";
const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");

  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({
      where: { slug: CONTRACTOR_SLUG },
      select: { id: true, name: true, slug: true },
    });
    if (!contractor) throw new Error(`Contractor ${CONTRACTOR_SLUG} does not exist.`);

    const [templateRows, contractorRows] = await Promise.all([
      db.templateService.findMany({
        where: { templateVersion: { trade: "electrical" }, laborCrewType: "ELECTRICIAN_AND_HELPER" },
        select: { id: true },
      }),
      db.service.findMany({
        where: {
          contractorId: contractor.id,
          tradeKey: "electrical",
          laborCrewType: "ELECTRICIAN_AND_HELPER",
        },
        select: { id: true, slug: true, active: true },
      }),
    ]);
    const active = contractorRows.filter((row) => row.active);

    console.log(`DEFAULT ELECTRICAL SERVICE CREWS — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  prepared template rows to change: ${templateRows.length}`);
    console.log(`  ${contractor.name} service rows to change: ${contractorRows.length}`);
    console.log(`  live service rows among them: ${active.length}`);

    if (!apply) {
      console.log("  Report only. Re-run with --apply after review; no price will be approved or published.");
      return;
    }
    if (active.length > 0) {
      throw new Error(`Refusing to change staffing for live test services: ${active.map((row) => row.slug).join(", ")}`);
    }

    await db.$transaction(async (tx) => {
      // Fixed SQL, guarded above by production identity. These defaults cover
      // rows created outside Prisma as well as new Prisma-created rows.
      await tx.$executeRawUnsafe('ALTER TABLE "services" ALTER COLUMN "laborCrewType" SET DEFAULT \'ELECTRICIAN\'');
      await tx.$executeRawUnsafe('ALTER TABLE "template_services" ALTER COLUMN "laborCrewType" SET DEFAULT \'ELECTRICIAN\'');
      await tx.templateService.updateMany({
        where: { id: { in: templateRows.map((row) => row.id) } },
        data: { laborCrewType: "ELECTRICIAN" },
      });
      await tx.service.updateMany({
        where: { id: { in: contractorRows.map((row) => row.id) } },
        data: {
          laborCrewType: "ELECTRICIAN",
          basePrice: null,
          whileWeThereBasePrice: null,
          publishedPriceApprovedAt: null,
        },
      });
      await tx.contractorDerivedPricingApproval.deleteMany({
        where: { serviceId: { in: contractorRows.map((row) => row.id) } },
      });
    });
    console.log("  Baseline updated. Changed test-account prices now require review; nothing was approved or published.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
