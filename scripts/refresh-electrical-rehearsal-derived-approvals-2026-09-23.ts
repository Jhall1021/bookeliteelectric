/**
 * Report or refresh the calculated-price approvals invalidated when the
 * checked platform labor baseline is distributed to the manual rehearsal
 * contractor.
 *
 * This deliberately uses decideDerivedPricingApproval rather than updating
 * fingerprints or totals directly. The stale-approval guard remains intact;
 * the rehearsal contractor simply approves the newly calculated basis through
 * the same application boundary as onboarding.
 *
 *   npx tsx scripts/refresh-electrical-rehearsal-derived-approvals-2026-09-23.ts
 *   npx tsx scripts/refresh-electrical-rehearsal-derived-approvals-2026-09-23.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { withContractor } from "../lib/tenantRoute";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { isRehearsalSlug } from "../lib/electrical/pilotScope";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const contractorIndex = process.argv.indexOf("--contractor");
const contractorSlug = contractorIndex >= 0 ? process.argv[contractorIndex + 1] : undefined;
const SERVICES = [
  "new-120v-outlet",
  "dedicated-120v-circuit-outlet",
  "electric-fireplace-circuit",
  "new-240v-appliance-circuit",
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  if (!contractorSlug) throw new Error("--contractor is required");
  if (!isRehearsalSlug(contractorSlug)) throw new Error(`refusing non-rehearsal contractor ${contractorSlug}`);

  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({
      where: { slug: contractorSlug },
      select: { id: true, slug: true },
    });
    if (!contractor) throw new Error(`${contractorSlug} does not exist`);

    const services = await db.service.findMany({
      where: { contractorId: contractor.id, slug: { in: [...SERVICES] } },
      select: {
        id: true,
        slug: true,
        active: true,
        pricingMethod: true,
      },
    });
    const approvals = await db.contractorDerivedPricingApproval.findMany({
      where: { contractorId: contractor.id, serviceId: { in: services.map((service) => service.id) } },
      select: { serviceId: true, approvedTotalCents: true, approvedAt: true },
    });
    const approvalByServiceId = new Map(approvals.map((approval) => [approval.serviceId, approval]));
    const bySlug = new Map(services.map((service) => [service.slug, service]));
    for (const slug of SERVICES) {
      const service = bySlug.get(slug);
      if (!service) throw new Error(`${slug} is not installed for ${contractor.slug}`);
      if (service.pricingMethod !== "DERIVED_RESOLVED_SCOPE") {
        throw new Error(`${slug} is ${service.pricingMethod}, not DERIVED_RESOLVED_SCOPE`);
      }
    }

    console.log(`\nELECTRICAL REHEARSAL DERIVED APPROVALS — ${apply ? "REFRESH" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractor.slug}`);
    console.log(`  services: ${SERVICES.length}\n`);

    for (const slug of SERVICES) {
      const service = bySlug.get(slug)!;
      const prior = approvalByServiceId.get(service.id);
      if (!apply) {
        console.log(prior
          ? `  would refresh ${slug}: currently $${(prior.approvedTotalCents / 100).toFixed(2)} approved ${prior.approvedAt.toISOString()}`
          : `  would approve ${slug}: no prior calculated-price approval`);
        continue;
      }
      const result = await withContractor(contractor.id, "test", (tenantDb) =>
        decideDerivedPricingApproval(
          tenantDb,
          { contractorId: contractor.id, userId: null },
          { action: "approve", serviceId: service.id },
        ));
      if (result.status !== 200 || result.body.approved !== true) {
        throw new Error(`${slug} approval refused: ${JSON.stringify(result.body)}`);
      }
      const nextTotal = Number(result.body.approvedTotalCents);
      console.log(prior
        ? `  refreshed ${slug}: $${(prior.approvedTotalCents / 100).toFixed(2)} -> $${(nextTotal / 100).toFixed(2)}`
        : `  approved ${slug}: $${(nextTotal / 100).toFixed(2)}`);
    }

    if (!apply) console.log("\n  Report only. Re-run with --apply to approve the current calculated bases.\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
