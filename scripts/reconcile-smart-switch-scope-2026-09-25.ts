/**
 * Reconcile the fixed prepared scope for a customer-supplied smart switch.
 *
 * The service is one-electrician work and always includes basic app pairing.
 * Report only unless --apply is supplied. The write is limited to the
 * disposable onboarding test contractor and canonical electrical template
 * rows; it does not approve or publish a customer price.
 */
import { PrismaClient } from "@prisma/client";
import { CONNECTED_DEVICE_POLICY_KEYS } from "../lib/electrical/connectedDeviceLaborFacts";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const CONTRACTOR_SLUG = "electrical-onboarding-test";
const SERVICE_KEY = "customer-supplied-smart-switch";
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
      select: { id: true, slug: true, name: true },
    });
    if (!contractor) throw new Error(`Contractor ${CONTRACTOR_SLUG} does not exist.`);

    const [services, templateServices, policyLinks] = await Promise.all([
      db.service.findMany({
        where: { contractorId: contractor.id, slug: SERVICE_KEY },
        select: {
          id: true, slug: true, laborCrewType: true, basePrice: true,
          whileWeThereBasePrice: true, publishedPriceApprovedAt: true,
        },
      }),
      db.templateService.findMany({
        where: { key: SERVICE_KEY, templateVersion: { trade: "electrical" } },
        select: { id: true, laborCrewType: true, templateVersion: { select: { version: true } } },
      }),
      db.templateServicePolicy.findMany({
        where: {
          templateService: { key: SERVICE_KEY, templateVersion: { trade: "electrical" } },
          templatePolicyDefinition: { key: CONNECTED_DEVICE_POLICY_KEYS.commissioning },
        },
        select: { id: true, templateService: { select: { templateVersion: { select: { version: true } } } } },
      }),
    ]);
    if (services.length !== 1) throw new Error(`Expected exactly one ${SERVICE_KEY} service for ${CONTRACTOR_SLUG}; found ${services.length}.`);
    if (templateServices.length === 0) throw new Error(`No electrical template rows found for ${SERVICE_KEY}.`);

    const serviceUpdates = services.filter((row) => row.laborCrewType !== "ELECTRICIAN");
    const templateUpdates = templateServices.filter((row) => row.laborCrewType !== "ELECTRICIAN");
    console.log(`SMART-SWITCH FIXED SCOPE — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  contractor: ${contractor.name} (${contractor.slug})`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor crew updates: ${serviceUpdates.length}`);
    console.log(`  template crew updates: ${templateUpdates.length}`);
    console.log(`  optional commissioning links to remove: ${policyLinks.length}`);
    console.log(`  existing prices remain untouched: primary ${services[0].basePrice ?? "unset"}, while-there ${services[0].whileWeThereBasePrice ?? "unset"}, approved ${services[0].publishedPriceApprovedAt ? "yes" : "no"}`);

    if (!apply) {
      console.log("  Report only. Re-run with --apply to reconcile the fixed smart-switch scope.");
      return;
    }

    await db.$transaction(async (tx) => {
      await tx.service.updateMany({
        where: { id: { in: serviceUpdates.map((row) => row.id) } },
        data: { laborCrewType: "ELECTRICIAN" },
      });
      await tx.templateService.updateMany({
        where: { id: { in: templateUpdates.map((row) => row.id) } },
        data: { laborCrewType: "ELECTRICIAN" },
      });
      await tx.templateServicePolicy.deleteMany({
        where: { id: { in: policyLinks.map((row) => row.id) } },
      });
    });
    console.log("  Reconciled crew assignment and fixed included-programming scope; no price was approved or published.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
