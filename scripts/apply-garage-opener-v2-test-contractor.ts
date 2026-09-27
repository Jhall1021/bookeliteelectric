import { PrismaClient } from "@prisma/client";
import { acceptMaterialBaselineVersion } from "../lib/materialCost";
import { electricalPlatformLaborBaselineByOperation } from "../lib/electrical/platformLaborBaseline";
import { garageEmtOperationKeys } from "../lib/electrical/garageEmtAtomicLaborBridge";
import { GARAGE_EMT_ROLES } from "../lib/electrical/loadGarageEmtTakeoff";
import { migrateGarageOpenerToV2 } from "../prisma/seed-garage-opener-v2";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const CONTRACTOR_SLUG = "electrical-onboarding-test";
const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(url);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production identity did not match.`);
  }
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: CONTRACTOR_SLUG }, select: { id: true } });
    let materialCreates = 0;
    for (const role of Object.values(GARAGE_EMT_ROLES)) {
      const canonical = await db.canonicalMaterial.findUniqueOrThrow({ where: { key: role }, select: { id: true } });
      const existing = await db.contractorMaterial.findUnique({
        where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: canonical.id } },
        select: { id: true },
      });
      if (existing) continue;
      const baseline = await db.materialBaselineVersion.findFirst({
        where: { canonicalMaterialId: canonical.id }, orderBy: [{ sourcedAt: "desc" }, { createdAt: "desc" }], select: { id: true },
      });
      if (!baseline) throw new Error(`No material baseline exists for ${role}`);
      materialCreates++;
      if (apply) {
        const accepted = await acceptMaterialBaselineVersion(db, { contractorId: contractor.id, baselineVersionId: baseline.id }, {
          reason: "Prepared garage EMT material baseline for onboarding test contractor",
          actor: "codex-garage-emt-rollout",
        });
        if (!accepted.ok && accepted.code !== "ALREADY_RESOLVED") throw new Error(`${role}: ${accepted.code}`);
      }
    }

    let laborCreates = 0;
    for (const operationKey of garageEmtOperationKeys()) {
      const existing = await db.contractorLaborOperationDecision.findUnique({
        where: { contractorId_trade_operationKey: { contractorId: contractor.id, trade: "electrical", operationKey } },
        select: { id: true },
      });
      if (existing) continue; // preserve every value the user has edited
      const baseline = electricalPlatformLaborBaselineByOperation.get(operationKey);
      if (!baseline) throw new Error(`No labor baseline exists for ${operationKey}`);
      laborCreates++;
      if (apply) {
        await db.contractorLaborOperationDecision.create({
          data: {
            contractorId: contractor.id, trade: "electrical", operationKey,
            hoursPerUnit: baseline.hoursPerUnit, source: "PLATFORM_BASELINE",
            basis: { kind: "PLATFORM_BASELINE", baselineStatus: baseline.status, sourceKeys: baseline.sourceKeys, note: baseline.note, contractorObservation: false, baselineDate: "2026-09-27" },
          },
        });
      }
    }

    console.log(`garage opener V2 ${apply ? "apply" : "report"}: ${materialCreates} material rows, ${laborCreates} labor rows, existing contractor edits preserved`);
    if (apply) await migrateGarageOpenerToV2(db, CONTRACTOR_SLUG);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
