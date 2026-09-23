/**
 * Publish the checked-in Electrical option-component baselines to the
 * designated rehearsal contractor. Labor and fallback material quantities
 * come from the original catalog authoring files; customer increments are
 * recomputed from this rehearsal's current economics and canonical material
 * recipes, never copied from the old $250/hour dollar constants.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { calculateMaterialSellCents } from "../lib/pricing";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";

type Baseline = { key: string; hours: number; fallbackMaterialCents: number; minutes: number; source: string };
const BASELINES: Baseline[] = [
  { key: "EXT_GFCI_RUN_ACCESSIBLE_UNDER_10", hours: 0, fallbackMaterialCents: 0, minutes: 0, source: "seed-exterior-gfci-routing.ts" },
  { key: "EXT_GFCI_RUN_ACCESSIBLE_10_20", hours: 0.25, fallbackMaterialCents: 720, minutes: 15, source: "seed-exterior-gfci-routing.ts" },
  { key: "EXT_GFCI_RUN_FINISHED_UNDER_10", hours: 0.5, fallbackMaterialCents: 0, minutes: 30, source: "seed-exterior-gfci-routing.ts" },
  { key: "EXT_GFCI_RUN_FINISHED_10_20", hours: 1, fallbackMaterialCents: 720, minutes: 60, source: "seed-exterior-gfci-routing.ts" },
  { key: "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE", hours: 0.75, fallbackMaterialCents: 0, minutes: 45, source: "seed-lighting-control.ts; conversion reuses the existing switch/outlet and the host service's base materials" },
  { key: "CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED", hours: 1.25, fallbackMaterialCents: 0, minutes: 75, source: "seed-lighting-control.ts; conversion reuses the existing switch/outlet and the host service's base materials" },
  { key: "SWITCH_POWER_RUN_ACCESSIBLE", hours: 1, fallbackMaterialCents: 2180, minutes: 60, source: "seed-lighting-control.ts" },
  { key: "SWITCH_POWER_RUN_FINISHED", hours: 1.5, fallbackMaterialCents: 2180, minutes: 90, source: "seed-lighting-control.ts" },
  { key: "LED_DIMMER_UPGRADE", hours: 0, fallbackMaterialCents: 3000, minutes: 0, source: "seed-lighting-control.ts" },
  { key: "SWITCHLEG_ACCESSIBLE_UNDER_10", hours: 1, fallbackMaterialCents: 3500, minutes: 60, source: "seed-lighting-control.ts" },
  { key: "SWITCHLEG_ACCESSIBLE_10_20", hours: 1.25, fallbackMaterialCents: 3500, minutes: 75, source: "seed-lighting-control.ts" },
  { key: "SWITCHLEG_FINISHED_UNDER_10", hours: 1.5, fallbackMaterialCents: 4500, minutes: 90, source: "seed-lighting-control.ts" },
  { key: "SWITCHLEG_FINISHED_10_20", hours: 2, fallbackMaterialCents: 4500, minutes: 120, source: "seed-lighting-control.ts" },
  { key: "NEW_CEILING_LIGHT_FINISHED", hours: 0.5, fallbackMaterialCents: 0, minutes: 30, source: "seed-content-fixes.ts" },
  { key: "NEW_CEILING_FAN_FINISHED", hours: 0.5, fallbackMaterialCents: 0, minutes: 30, source: "seed-content-fixes.ts" },
  { key: "NEW_WALL_SCONCE_FINISHED_ROUTE", hours: 0.75, fallbackMaterialCents: 0, minutes: 30, source: "seed-low-voltage-and-sconces.ts" },
  { key: "RECESSED_ADDITIONAL_ACCESSIBLE", hours: 0.35, fallbackMaterialCents: 3800, minutes: 20, source: "seed-recessed-lighting.ts" },
  { key: "RECESSED_FIRST_LIGHT_FINISHED", hours: 0.5, fallbackMaterialCents: 0, minutes: 30, source: "seed-recessed-lighting.ts" },
  { key: "RECESSED_ADDITIONAL_FINISHED", hours: 0.6, fallbackMaterialCents: 3800, minutes: 35, source: "seed-recessed-lighting.ts" },
];

const roundUp = (cents: number, increment: number) => increment > 0 ? Math.ceil(cents / increment) * increment : Math.round(cents);

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({ where: { slug: EXPECTED_CONTRACTOR }, select: { id: true } });
    if (!contractor) throw new Error(`${EXPECTED_CONTRACTOR} does not exist`);
    const settings = await db.pricingSettings.findUnique({ where: { contractorId: contractor.id } });
    if (!settings?.crewHourRateCents || settings.roundingIncrementCents === null) throw new Error("rehearsal pricing settings are incomplete");
    const crewHourRateCents = settings.crewHourRateCents;
    const roundingIncrementCents = settings.roundingIncrementCents;
    const components = await db.canonicalComponent.findMany({
      where: { key: { in: BASELINES.map(({ key }) => key) } },
      include: { materials: { include: { canonicalMaterial: true } } },
    });
    if (components.length !== BASELINES.length) {
      const found = new Set(components.map(({ key }) => key));
      throw new Error(`missing canonical components: ${BASELINES.filter(({ key }) => !found.has(key)).map(({ key }) => key).join(", ")}`);
    }
    const materialRows = await db.contractorMaterial.findMany({
      where: { contractorId: contractor.id }, select: { canonicalMaterialId: true, unitCostCents: true },
    });
    const costs = new Map(materialRows.map((row) => [row.canonicalMaterialId, row.unitCostCents]));
    const ownRows = await db.contractorComponent.findMany({
      where: { contractorId: contractor.id, canonicalComponentId: { in: components.map(({ id }) => id) } },
    });
    const own = new Map(ownRows.map((row) => [row.canonicalComponentId, row]));
    const canonical = new Map(components.map((row) => [row.key, row]));
    const proposals = BASELINES.map((baseline) => {
      const component = canonical.get(baseline.key)!;
      const recipeCost = component.materials.length
        ? component.materials.reduce((sum, line) => {
            const cost = costs.get(line.canonicalMaterialId);
            if (cost === undefined) throw new Error(`${baseline.key} has no contractor cost for ${line.canonicalMaterial.key}`);
            return sum + cost * line.quantity;
          }, 0)
        : baseline.fallbackMaterialCents;
      const approvedPriceCents = roundUp(
        baseline.hours * crewHourRateCents + calculateMaterialSellCents(recipeCost),
        roundingIncrementCents,
      );
      return { baseline, component, recipeCost, approvedPriceCents, current: own.get(component.id) };
    });

    console.log(`\nELECTRICAL REHEARSAL COMPONENT BASELINES — ${apply ? "PUBLISH" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${EXPECTED_CONTRACTOR}`);
    console.log(`  crew-hour rate: $${(crewHourRateCents / 100).toFixed(2)}\n`);
    for (const row of proposals) {
      const current = row.current;
      if (current?.addFieldLaborHours !== null && current?.addFieldLaborHours !== undefined
          && current.addFieldLaborHours !== row.baseline.hours) {
        throw new Error(`${row.baseline.key} already has different contractor labor; refusing to overwrite it`);
      }
      console.log(`  ${apply ? "publish" : "would publish"} ${row.baseline.key}: ${row.baseline.hours.toFixed(2)} hr, $${(row.recipeCost / 100).toFixed(2)} direct material -> $${(row.approvedPriceCents / 100).toFixed(2)}`);
    }
    if (!apply) { console.log(`\n  would publish ${proposals.length} component baselines; no change\n`); return; }

    await db.$transaction(async (tx) => {
      for (const row of proposals) {
        const notes = `PLATFORM_BASELINE_REHEARSAL 2026-09-23; ${row.baseline.source}; current rehearsal economics`;
        await tx.contractorComponent.upsert({
          where: { contractorId_canonicalComponentId: { contractorId: contractor.id, canonicalComponentId: row.component.id } },
          update: {
            addFieldLaborHours: row.baseline.hours,
            addMaterialCostCents: row.baseline.fallbackMaterialCents,
            addScheduleMinutes: row.baseline.minutes,
            approvedPriceCents: row.approvedPriceCents,
            notes,
          },
          create: {
            contractorId: contractor.id,
            canonicalComponentId: row.component.id,
            addFieldLaborHours: row.baseline.hours,
            addMaterialCostCents: row.baseline.fallbackMaterialCents,
            addScheduleMinutes: row.baseline.minutes,
            approvedPriceCents: row.approvedPriceCents,
            notes,
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log(`\n  published ${proposals.length} component baselines\n`);
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
