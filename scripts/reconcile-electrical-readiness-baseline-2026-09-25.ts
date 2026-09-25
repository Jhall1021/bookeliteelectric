/**
 * Repair prepared-labor carry-forward and surface-route pricing for the
 * disposable electrical onboarding test contractor and canonical template.
 * Report-only unless --apply is supplied. Never approves or publishes price.
 */
import { PrismaClient } from "@prisma/client";
import { syncPreparedServiceLabor } from "../lib/electrical/syncPreparedServiceLabor";
import { installPreparedElectricalMaterialSystems } from "../lib/electrical/preparedMaterialSystems";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const CONTRACTOR_SLUG = "electrical-onboarding-test";
const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const SURFACE_SLUGS = [
  "surface-mounted-outlet",
  "surface-mounted-switch",
  "surface-mounted-fixture-box",
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production identity did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: CONTRACTOR_SLUG }, select: { id: true, name: true },
    });
    const [services, templateServices] = await Promise.all([
      db.service.findMany({
        where: { contractorId: contractor.id, slug: { in: [...SURFACE_SLUGS] } },
        select: { id: true, slug: true, pricingMethod: true, fieldLaborHours: true, wwtLaborHours: true },
        orderBy: { slug: "asc" },
      }),
      db.templateService.findMany({
        where: { key: { in: [...SURFACE_SLUGS] }, templateVersion: { trade: "electrical" } },
        select: { id: true, key: true, pricingMethod: true },
      }),
    ]);
    if (services.length !== SURFACE_SLUGS.length) {
      throw new Error(`Expected ${SURFACE_SLUGS.length} installed surface services; found ${services.length}.`);
    }
    console.log(`ELECTRICAL READINESS BASELINE — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  contractor: ${contractor.name} (${CONTRACTOR_SLUG})`);
    for (const service of services) {
      console.log(`  ${service.slug}: ${service.pricingMethod}; labor ${service.fieldLaborHours ?? "null"}/${service.wwtLaborHours ?? "null"}`);
    }
    console.log(`  template surface definitions: ${templateServices.length}`);
    if (!apply) return console.log("  Report only. Re-run with --apply; no price will be approved or published.");

    const result = await db.$transaction(async (tx) => {
      await tx.service.updateMany({
        where: { id: { in: services.map((service) => service.id) } },
        data: { pricingMethod: "DERIVED_RESOLVED_SCOPE", bookingType: "ADJUSTED" },
      });
      await tx.templateService.updateMany({
        where: { id: { in: templateServices.map((service) => service.id) } },
        data: { pricingMethod: "DERIVED_RESOLVED_SCOPE", bookingType: "ADJUSTED" },
      });
      await installPreparedElectricalMaterialSystems(tx, contractor.id);
      return syncPreparedServiceLabor(tx, contractor.id);
    });
    console.log(`  synchronized labor: ${result.updated} bounded; ${result.routeSpecific} route-specific; ${result.blocked} blocked`);
    console.log("  Reconciled. No service price was approved, published, or activated.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
