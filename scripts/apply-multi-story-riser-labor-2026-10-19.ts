/**
 * Install the owner-approved one-hour-per-floor multi-story riser allowance
 * for every electrical catalog that uses the affected circuit recipes.
 * Report only unless --apply is supplied.
 */
import { PrismaClient } from "@prisma/client";

import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { electricalPlatformLaborBaselineByOperation } from "../lib/electrical/platformLaborBaseline";
import { withContractor } from "../lib/tenantRoute";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const OPERATION_KEY = "ELEC_MULTI_STORY_RISER_TRANSITION";
const AFFECTED_SERVICE_SLUGS = ["dedicated-120v-circuit-outlet", "electric-fireplace-circuit"] as const;

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

  const baseline = electricalPlatformLaborBaselineByOperation.get(OPERATION_KEY);
  if (!baseline || baseline.status !== "OWNER_APPROVED_STARTING_VALUE" || baseline.hoursPerUnit !== 1) {
    throw new Error(`Missing the owner-approved one-hour baseline for ${OPERATION_KEY}.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractors = await db.contractor.findMany({
      where: { services: { some: { slug: { in: [...AFFECTED_SERVICE_SLUGS] } } } },
      select: {
        id: true,
        slug: true,
        name: true,
        services: {
          where: { slug: { in: [...AFFECTED_SERVICE_SLUGS] } },
          select: { id: true, slug: true, pricingMethod: true },
        },
      },
      orderBy: { slug: "asc" },
    });
    console.log(`MULTI-STORY RISER LABOR — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractors: ${contractors.length}`);

    for (const contractor of contractors) {
      const current = await db.contractorLaborOperationDecision.findUnique({
        where: { contractorId_trade_operationKey: {
          contractorId: contractor.id,
          trade: "electrical",
          operationKey: OPERATION_KEY,
        } },
        select: { hoursPerUnit: true, source: true },
      });
      const action = current ? `keep ${current.hoursPerUnit}h ${current.source}` : "create 1h PLATFORM_BASELINE";
      console.log(`  ${contractor.slug}: ${action}`);
      if (apply && !current) {
        await db.contractorLaborOperationDecision.create({
          data: {
            contractorId: contractor.id,
            trade: "electrical",
            operationKey: OPERATION_KEY,
            hoursPerUnit: 1,
            source: "PLATFORM_BASELINE",
            basis: {
              kind: "PLATFORM_BASELINE",
              baselineStatus: baseline.status,
              sourceKeys: baseline.sourceKeys,
              note: baseline.note,
              contractorObservation: false,
              baselineDate: "2026-10-19",
              reconciliation: "OWNER_APPROVED_MULTI_STORY_RISER_2026-10-19",
            },
          },
        });
      }

      const approvals = await db.contractorDerivedPricingApproval.findMany({
        where: {
          contractorId: contractor.id,
          serviceId: { in: contractor.services.map((service) => service.id) },
        },
        select: { serviceId: true, approvedTotalCents: true },
      });
      const approvalByServiceId = new Map(approvals.map((approval) => [approval.serviceId, approval]));
      for (const service of contractor.services) {
        const prior = approvalByServiceId.get(service.id);
        if (!prior) continue;
        console.log(`    ${service.slug}: ${apply ? "refreshing" : "would refresh"} calculated-price approval`);
        if (!apply) continue;
        const result = await withContractor(contractor.id, "test", (tenantDb) =>
          decideDerivedPricingApproval(
            tenantDb,
            { contractorId: contractor.id, userId: null },
            { action: "approve", serviceId: service.id },
          ));
        if (result.status !== 200 || result.body.approved !== true) {
          throw new Error(`${contractor.slug}/${service.slug} approval refused: ${JSON.stringify(result.body)}`);
        }
      }
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
