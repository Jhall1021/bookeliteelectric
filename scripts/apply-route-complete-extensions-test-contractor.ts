import { PrismaClient } from "@prisma/client";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { migrateRouteCompleteExtensions } from "../prisma/seed-route-complete-extensions";
import { migrateNewCeilingFanToV2 } from "../prisma/seed-new-ceiling-fan-v2";
import { acceptMaterialBaselineVersion, deriveUnitCost } from "../lib/materialCost";
import { FAN_LIGHT_SPEED_CONTROL_MATERIAL_KEY } from "../lib/electrical/ceilingFanControl";
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
    // Keep the canonical source catalog aligned with the production test
    // contractor so the next extracted template ships the same corrected fan
    // tree to every future electrical onboarding.
    await migrateNewCeilingFanToV2(db, "elite-electric");
    await migrateNewCeilingFanToV2(db, CONTRACTOR);
    const fanControl = await db.canonicalMaterial.findUniqueOrThrow({ where: { key: FAN_LIGHT_SPEED_CONTROL_MATERIAL_KEY }, select: { id: true } });
    let baseline = await db.materialBaselineVersion.findFirst({
      where: { canonicalMaterialId: fanControl.id, sourceLabel: "Lutron Maestro MACL-LFQH-WH fan control and light dimmer, The Home Depot", sourcedAt: new Date("2026-09-28T00:00:00.000Z") },
      select: { id: true },
    });
    if (!baseline) {
      const cost = deriveUnitCost({ packagePriceCents: 5997, packageQuantity: 1 });
      baseline = await db.materialBaselineVersion.create({
        data: {
          canonicalMaterialId: fanControl.id,
          unitCostCents: cost.unitCostCents,
          unitCostMilliCents: cost.unitCostMilliCents,
          packagePriceCents: 5997,
          packageQuantity: 1,
          packageUnit: "each",
          unit: "each",
          sourceLabel: "Lutron Maestro MACL-LFQH-WH fan control and light dimmer, The Home Depot",
          sourceUrl: "https://www.homedepot.com/b/Electrical-Wiring-Devices-Light-Controls-Fan-Controls/Lutron/White/Light/N-5yc1vZc32sZ1z0vm5fZ1z23xsrZ1z24k3a",
          specNote: "Combination single-pole ceiling-fan speed control and light dimmer; prepared national-retail starting cost",
          sourcedAt: new Date("2026-09-28T00:00:00.000Z"),
        },
        select: { id: true },
      });
    }
    const existingFanControlCost = await db.contractorMaterial.findUnique({
      where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: fanControl.id } },
      select: { id: true },
    });
    if (!existingFanControlCost) {
      const accepted = await acceptMaterialBaselineVersion(db, { contractorId: contractor.id, baselineVersionId: baseline.id }, {
        reason: "Prepared fan/light speed-control retail baseline for the test contractor",
        actor: "codex-production-test-migration",
      });
      if (!accepted.ok) throw new Error(`fan control baseline acceptance failed: ${accepted.code}`);
    }
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
