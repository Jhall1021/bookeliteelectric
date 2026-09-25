/**
 * Replace the onboarding-test contractor's surface-raceway answers with the
 * prepared estimator baseline. Report only unless --apply is supplied.
 *
 * This is deliberately limited to one disposable test contractor and refuses
 * any database other than the stamped production database.
 */
import { PrismaClient } from "@prisma/client";
import {
  ELECTRICAL_PREPARED_SURFACE_RACEWAY_LABOR_KEYS,
  electricalPlatformLaborBaselineByOperation,
} from "../lib/electrical/platformLaborBaseline";
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
      select: { id: true, slug: true, name: true },
    });
    if (!contractor) throw new Error(`Contractor ${CONTRACTOR_SLUG} does not exist.`);

    const current = await db.contractorLaborOperationDecision.findMany({
      where: {
        contractorId: contractor.id,
        trade: "electrical",
        operationKey: { in: [...ELECTRICAL_PREPARED_SURFACE_RACEWAY_LABOR_KEYS] },
      },
      select: { operationKey: true, hoursPerUnit: true, source: true },
      orderBy: { operationKey: "asc" },
    });
    const currentByKey = new Map(current.map((row) => [row.operationKey, row]));

    console.log(`ELECTRICAL SURFACE-RACEWAY BASELINE — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  contractor: ${contractor.name} (${contractor.slug})`);
    console.log(`  target: ${identity.endpoint}`);

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const operationKey of ELECTRICAL_PREPARED_SURFACE_RACEWAY_LABOR_KEYS) {
      const baseline = electricalPlatformLaborBaselineByOperation.get(operationKey);
      if (!baseline) throw new Error(`Missing platform baseline for ${operationKey}`);
      const before = currentByKey.get(operationKey);
      const same = before?.hoursPerUnit === baseline.hoursPerUnit && before.source === "PLATFORM_BASELINE";
      if (same) {
        unchanged += 1;
        continue;
      }
      before ? updated += 1 : created += 1;
      console.log(`  ${operationKey}: ${before ? `${before.hoursPerUnit}h ${before.source}` : "missing"} -> ${baseline.hoursPerUnit}h PLATFORM_BASELINE`);
      if (!apply) continue;

      const basis = {
        kind: "PLATFORM_BASELINE",
        baselineStatus: baseline.status,
        sourceKeys: baseline.sourceKeys,
        note: baseline.note,
        contractorObservation: false,
        baselineDate: "2026-09-23",
        reconciliation: "SURFACE_RACEWAY_BOOK_BASELINE_2026-09-25",
      };
      await db.contractorLaborOperationDecision.upsert({
        where: {
          contractorId_trade_operationKey: {
            contractorId: contractor.id,
            trade: "electrical",
            operationKey,
          },
        },
        update: {
          hoursPerUnit: baseline.hoursPerUnit,
          source: "PLATFORM_BASELINE",
          basis,
          approvedAt: new Date(),
        },
        create: {
          contractorId: contractor.id,
          trade: "electrical",
          operationKey,
          hoursPerUnit: baseline.hoursPerUnit,
          source: "PLATFORM_BASELINE",
          basis,
        },
      });
    }

    console.log(`  ${apply ? "applied" : "would apply"}: ${created} create, ${updated} update, ${unchanged} unchanged`);
    if (!apply) console.log("  Report only. Re-run with --apply to reconcile this disposable test contractor.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
