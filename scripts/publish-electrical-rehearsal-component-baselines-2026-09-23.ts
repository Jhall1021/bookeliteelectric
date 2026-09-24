/**
 * Publish the checked-in Electrical option-component baselines to the
 * designated rehearsal contractor. Converted route and lighting increments
 * come from checked-in atomic labor packages. Customer prices are recomputed
 * from this rehearsal's current economics and canonical material recipes,
 * never copied from the old $250/hour dollar constants.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { calculateMaterialSellCents } from "../lib/pricing";
import { exteriorGfciRouteLaborPackageByComponent } from "../lib/electrical/exteriorGfciRouteLaborPackages";
import { fixtureRouteLaborPackageByComponent } from "../lib/electrical/fixtureRouteLaborPackages";
import { LIGHTING_CONTROL_CONVERSION_LABOR_PACKAGE } from "../lib/electrical/lightingControlConversionLaborPackage";
import { lightingControlLaborPackageByComponent } from "../lib/electrical/lightingControlLaborPackages";
import { recessedLightingComponentLaborPackageByComponent } from "../lib/electrical/recessedLightingComponentPackages";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";

type Baseline = { key: string; hours: number; fallbackMaterialCents: number; minutes: number; source: string; requiresMaterialRecipe?: boolean };
const atomicLightingBaseline = (key: string, fallbackMaterialCents: number): Baseline => {
  const labor = lightingControlLaborPackageByComponent.get(key);
  if (!labor) throw new Error(`${key} is missing its atomic lighting-control labor package`);
  return {
    key,
    hours: labor.laborHours,
    fallbackMaterialCents,
    minutes: labor.scheduleMinutes,
    source: `lightingControlLaborPackages.ts; ${labor.evidence}`,
  };
};
const atomicFixturePremiumBaseline = (key: string): Baseline => {
  const labor = fixtureRouteLaborPackageByComponent.get(key);
  if (!labor) throw new Error(`${key} is missing its atomic fixture-route labor package`);
  return {
    key,
    hours: labor.premiumHours,
    fallbackMaterialCents: 0,
    minutes: labor.premiumScheduleMinutes,
    source: `fixtureRouteLaborPackages.ts; ${labor.evidence}`,
  };
};
const atomicLightingConversionBaseline = (key: string): Baseline => {
  if (!(LIGHTING_CONTROL_CONVERSION_LABOR_PACKAGE.componentKeys as readonly string[]).includes(key)) {
    throw new Error(`${key} is not a switched-receptacle lighting conversion component`);
  }
  return {
    key,
    hours: LIGHTING_CONTROL_CONVERSION_LABOR_PACKAGE.laborHours,
    fallbackMaterialCents: 0,
    minutes: LIGHTING_CONTROL_CONVERSION_LABOR_PACKAGE.scheduleMinutes,
    source: `lightingControlConversionLaborPackage.ts; ${LIGHTING_CONTROL_CONVERSION_LABOR_PACKAGE.evidence}`,
  };
};
const atomicExteriorGfciBaseline = (key: string, fallbackMaterialCents: number): Baseline => {
  const labor = exteriorGfciRouteLaborPackageByComponent.get(key);
  if (!labor) throw new Error(`${key} is missing its routed exterior-GFCI atomic labor package`);
  return {
    key,
    hours: labor.incrementHours,
    fallbackMaterialCents,
    minutes: labor.incrementScheduleMinutes,
    source: `exteriorGfciRouteLaborPackages.ts; ${labor.evidence}`,
  };
};
const atomicRecessedLightingBaseline = (key: string): Baseline => {
  const labor = recessedLightingComponentLaborPackageByComponent.get(key);
  if (!labor) throw new Error(`${key} is missing its recessed-lighting atomic labor package`);
  return {
    key,
    hours: labor.incrementHours,
    fallbackMaterialCents: 0,
    minutes: labor.incrementScheduleMinutes,
    source: `recessedLightingComponentPackages.ts; ${labor.evidence}`,
    requiresMaterialRecipe: key !== "RECESSED_FIRST_LIGHT_FINISHED",
  };
};
const BASELINES: Baseline[] = [
  atomicExteriorGfciBaseline("EXT_GFCI_RUN_ACCESSIBLE_UNDER_10", 0),
  atomicExteriorGfciBaseline("EXT_GFCI_RUN_ACCESSIBLE_10_20", 720),
  atomicExteriorGfciBaseline("EXT_GFCI_RUN_FINISHED_UNDER_10", 0),
  atomicExteriorGfciBaseline("EXT_GFCI_RUN_FINISHED_10_20", 720),
  atomicLightingConversionBaseline("CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE"),
  atomicLightingConversionBaseline("CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED"),
  atomicLightingBaseline("SWITCH_POWER_RUN_ACCESSIBLE", 2180),
  atomicLightingBaseline("SWITCH_POWER_RUN_FINISHED", 2180),
  { key: "LED_DIMMER_UPGRADE", hours: 0, fallbackMaterialCents: 3000, minutes: 0, source: "seed-lighting-control.ts" },
  atomicLightingBaseline("SWITCHLEG_ACCESSIBLE_UNDER_10", 3500),
  atomicLightingBaseline("SWITCHLEG_ACCESSIBLE_10_20", 3500),
  atomicLightingBaseline("SWITCHLEG_FINISHED_UNDER_10", 4500),
  atomicLightingBaseline("SWITCHLEG_FINISHED_10_20", 4500),
  atomicFixturePremiumBaseline("NEW_CEILING_LIGHT_FINISHED"),
  atomicFixturePremiumBaseline("NEW_CEILING_FAN_FINISHED"),
  atomicFixturePremiumBaseline("NEW_WALL_SCONCE_FINISHED_ROUTE"),
  atomicRecessedLightingBaseline("RECESSED_ADDITIONAL_ACCESSIBLE"),
  atomicRecessedLightingBaseline("RECESSED_FIRST_LIGHT_FINISHED"),
  atomicRecessedLightingBaseline("RECESSED_ADDITIONAL_FINISHED"),
];

// Exact legacy or previously published values superseded by atomic component
// packages. Only these known rehearsal values may be replaced automatically;
// a contractor-edited value still refuses.
const SUPERSEDED_COMPONENT_HOURS = new Map<string, number>([
  ["SWITCH_POWER_RUN_ACCESSIBLE", 1],
  ["SWITCH_POWER_RUN_FINISHED", 1.5],
  ["SWITCHLEG_ACCESSIBLE_UNDER_10", 1],
  ["SWITCHLEG_ACCESSIBLE_10_20", 1.25],
  ["SWITCHLEG_FINISHED_UNDER_10", 1.5],
  ["SWITCHLEG_FINISHED_10_20", 2],
  ["NEW_CEILING_LIGHT_FINISHED", 0.5],
  ["NEW_CEILING_FAN_FINISHED", 0.5],
  ["NEW_WALL_SCONCE_FINISHED_ROUTE", 0.75],
  ["CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE", 0.75],
  ["CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED", 1.25],
  ["EXT_GFCI_RUN_ACCESSIBLE_UNDER_10", 0],
  ["EXT_GFCI_RUN_ACCESSIBLE_10_20", 0.25],
  ["EXT_GFCI_RUN_FINISHED_UNDER_10", 0.5],
  ["EXT_GFCI_RUN_FINISHED_10_20", 1],
  ["RECESSED_ADDITIONAL_ACCESSIBLE", 0.35],
  ["RECESSED_FIRST_LIGHT_FINISHED", 0.5],
  ["RECESSED_ADDITIONAL_FINISHED", 0.6],
]);

const roundUp = (cents: number, increment: number) => increment > 0 ? Math.ceil(cents / increment) * increment : Math.round(cents);
const sameHours = (left: number, right: number | undefined) => right !== undefined && Math.abs(left - right) < 1e-9;

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
      if (baseline.requiresMaterialRecipe && component.materials.length === 0) {
        throw new Error(`${baseline.key} requires its canonical physical material recipe; refusing a lump-sum fallback`);
      }
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
          && !sameHours(current.addFieldLaborHours, row.baseline.hours)
          && !sameHours(current.addFieldLaborHours, SUPERSEDED_COMPONENT_HOURS.get(row.baseline.key))) {
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
