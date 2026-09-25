/**
 * Apply the owner's reviewed electrical starting labor values to the current
 * disposable onboarding test contractor. Report only unless --apply is used.
 * Existing real contractors are intentionally out of scope.
 */
import { PrismaClient } from "@prisma/client";
import {
  ELECTRICAL_OWNER_APPROVED_STARTING_MINUTES_2026_09_25,
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
      where: { slug: CONTRACTOR_SLUG }, select: { id: true, slug: true, name: true },
    });
    if (!contractor) throw new Error(`Contractor ${CONTRACTOR_SLUG} does not exist.`);
    const operationKeys = Object.keys(ELECTRICAL_OWNER_APPROVED_STARTING_MINUTES_2026_09_25).sort();
    const current = await db.contractorLaborOperationDecision.findMany({
      where: { contractorId: contractor.id, trade: "electrical", operationKey: { in: operationKeys } },
      select: { operationKey: true, hoursPerUnit: true, source: true },
    });
    const currentByKey = new Map(current.map((row) => [row.operationKey, row]));
    let created = 0, updated = 0, unchanged = 0;
    console.log(`ELECTRICAL OWNER STARTING LABOR — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  contractor: ${contractor.name} (${contractor.slug})`);
    console.log(`  target: ${identity.endpoint}`);
    for (const operationKey of operationKeys) {
      const baseline = electricalPlatformLaborBaselineByOperation.get(operationKey);
      if (!baseline || baseline.status !== "OWNER_APPROVED_STARTING_VALUE") {
        throw new Error(`Missing owner-approved platform baseline for ${operationKey}.`);
      }
      const before = currentByKey.get(operationKey);
      const sameHours = before
        ? Math.abs(before.hoursPerUnit - baseline.hoursPerUnit) < 1e-9
        : false;
      const same = sameHours && before?.source === "PLATFORM_BASELINE";
      if (same) { unchanged += 1; continue; }
      before ? updated += 1 : created += 1;
      console.log(`  ${operationKey}: ${before ? `${Number((before.hoursPerUnit * 60).toFixed(6))} min ${before.source}` : "missing"} -> ${baseline.hoursPerUnit * 60} min PLATFORM_BASELINE`);
      if (!apply) continue;
      await db.contractorLaborOperationDecision.upsert({
        where: { contractorId_trade_operationKey: { contractorId: contractor.id, trade: "electrical", operationKey } },
        update: {
          hoursPerUnit: baseline.hoursPerUnit, source: "PLATFORM_BASELINE",
          basis: {
            kind: "PLATFORM_BASELINE", baselineStatus: baseline.status,
            sourceKeys: baseline.sourceKeys, note: baseline.note,
            contractorObservation: false, baselineDate: "2026-09-25",
            reconciliation: "OWNER_REVIEWED_STARTING_LABOR_2026-09-25",
          },
          approvedAt: new Date(),
        },
        create: {
          contractorId: contractor.id, trade: "electrical", operationKey,
          hoursPerUnit: baseline.hoursPerUnit, source: "PLATFORM_BASELINE",
          basis: {
            kind: "PLATFORM_BASELINE", baselineStatus: baseline.status,
            sourceKeys: baseline.sourceKeys, note: baseline.note,
            contractorObservation: false, baselineDate: "2026-09-25",
            reconciliation: "OWNER_REVIEWED_STARTING_LABOR_2026-09-25",
          },
        },
      });
    }
    console.log(`  ${apply ? "applied" : "would apply"}: ${created} create, ${updated} update, ${unchanged} unchanged`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
