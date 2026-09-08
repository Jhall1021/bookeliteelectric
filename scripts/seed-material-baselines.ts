/**
 * Seeds Material Baseline Pricing with a small, genuinely sourced starter
 * set — six of Electrical's canonical roles, each priced from a real,
 * dated, linkable retail listing looked up for this seed. Nothing here is
 * invented or copied from Elite's own figures — see docs/MATERIAL-SUPPLIER-CATALOG.md
 * and the "No borrowed defaults" rule in docs/design/platform-admin.md,
 * which this data is sourced independently of, on purpose.
 *
 * IDEMPOTENT. Re-running this does not duplicate a row: a baseline is
 * skipped if the same canonical role already has one with the same source
 * label and sourced date. A price that genuinely moved is a NEW row with a
 * later sourcedAt — see MaterialBaselineVersion's own doc comment on why
 * nothing here is ever updated in place.
 *
 *   npx tsx scripts/seed-material-baselines.ts
 */
import { PrismaClient } from "@prisma/client";
import { deriveUnitCost } from "../lib/materialCost";

const prisma = new PrismaClient();

const SOURCED_AT = new Date("2026-09-08");

type Seed = {
  key: string;
  unit: string;
  sourceLabel: string;
  sourceUrl: string;
  specNote: string;
} & (
  | { unitCostCents: number }
  | { packagePriceCents: number; packageQuantity: number }
);

const SEEDS: Seed[] = [
  {
    key: "WIRE_12_2",
    unit: "ft",
    sourceLabel: "Southwire 250 ft. 12/2 W/G Romex SIMpull, The Home Depot",
    sourceUrl: "https://www.homedepot.com/p/Southwire-250-ft-12-2-2-Solid-Romex-SIMpull-CU-NM-B-W-G-Wire-55048455/202316262",
    specNote: "12 AWG, 2 conductor + ground, solid copper NM-B, 250 ft roll",
    packagePriceCents: 30458,
    packageQuantity: 250,
  },
  {
    key: "WIRE_14_2",
    unit: "ft",
    sourceLabel: "Southwire 250 ft. 14/2 W/G Romex SIMpull, The Home Depot",
    sourceUrl: "https://www.homedepot.com/p/Southwire-250-ft-14-2-Romex-SIMpull-Solid-NM-B-W-G-Wire-28827469/202019377",
    specNote: "14 AWG, 2 conductor + ground, solid copper NM-B, 250 ft roll — regular price, before any promotional card discount",
    packagePriceCents: 11400,
    packageQuantity: 250,
  },
  {
    key: "GFCI_WEATHER_RESISTANT",
    unit: "each",
    sourceLabel: "Leviton GFWT1, 15A weather-resistant GFCI outlet, white, The Home Depot",
    sourceUrl: "https://www.homedepot.com/p/Leviton-15-Amp-125-Volt-Duplex-Self-Test-Tamper-Resistant-Weather-Resistant-GFCI-Outlet-White-GFWT1-KW-R92-GFWT1-0KW/205996792",
    specNote: "15A/125V, self-test, tamper- and weather-resistant, single unit",
    unitCostCents: 2048,
  },
  {
    key: "BREAKER_SINGLE_POLE",
    unit: "each",
    sourceLabel: "Square D Homeline HOM120CP, 20A single-pole, 8-pack, The Home Depot",
    sourceUrl: "https://www.homedepot.com/p/Square-D-Homeline-20-Amp-Single-Pole-Circuit-Breaker-8-Pack-HOM120CP8/305300942",
    specNote: "20A single-pole, Homeline/CSED-compatible panel — priced per unit from an 8-pack; a different amperage or panel family is a different role, not this one",
    packagePriceCents: 4780,
    packageQuantity: 8,
  },
  {
    key: "BOX_OLD_WORK",
    unit: "each",
    sourceLabel: "Carlon B120R, 1-gang 20 cu. in. old-work switch/outlet box, The Home Depot",
    sourceUrl: "https://www.homedepot.com/p/Carlon-1-Gang-20-cu-in-Electrical-PVC-Old-Work-Electrical-Switch-and-Outlet-Box-B120R-B120R/202077323",
    specNote: "1-gang, 20 cu. in., PVC, integral clamps, old-work (retrofit) — not new-work",
    unitCostCents: 449,
  },
  {
    key: "SMOKE_CO_COMBO",
    unit: "each",
    sourceLabel: "Kidde 21031529, hardwired smoke/CO combo, AA battery backup, The Home Depot",
    sourceUrl: "https://www.homedepot.com/p/Kidde-Hardwired-Combination-Smoke-and-Carbon-Monoxide-Detector-with-Interconnected-Alarm-and-LED-Warning-Lights-21031529/328175571",
    specNote: "Hardwired, interconnectable, AA battery backup, LED warning lights",
    unitCostCents: 6497,
  },
];

async function main() {
  console.log(`\nSEEDING MATERIAL BASELINE PRICING — ${SEEDS.length} sourced starting costs\n`);
  let created = 0, skipped = 0, missing = 0;

  for (const seed of SEEDS) {
    const canonical = await prisma.canonicalMaterial.findUnique({ where: { key: seed.key }, select: { id: true } });
    if (!canonical) {
      console.log(`  ✗ ${seed.key} — no such CanonicalMaterial, skipped`);
      missing++;
      continue;
    }

    const existing = await prisma.materialBaselineVersion.findFirst({
      where: { canonicalMaterialId: canonical.id, sourceLabel: seed.sourceLabel, sourcedAt: SOURCED_AT },
      select: { id: true },
    });
    if (existing) {
      console.log(`  · ${seed.key} — already seeded from this exact source/date, skipped`);
      skipped++;
      continue;
    }

    const derived = "unitCostCents" in seed
      ? { unitCostCents: seed.unitCostCents, unitCostMilliCents: seed.unitCostCents * 1000 }
      : deriveUnitCost({ packagePriceCents: seed.packagePriceCents, packageQuantity: seed.packageQuantity });

    await prisma.materialBaselineVersion.create({
      data: {
        canonicalMaterialId: canonical.id,
        unitCostCents: derived.unitCostCents,
        unitCostMilliCents: derived.unitCostMilliCents,
        packagePriceCents: "packagePriceCents" in seed ? seed.packagePriceCents : null,
        packageQuantity: "packageQuantity" in seed ? seed.packageQuantity : null,
        packageUnit: "packagePriceCents" in seed ? seed.unit : null,
        unit: seed.unit,
        sourceLabel: seed.sourceLabel,
        sourceUrl: seed.sourceUrl,
        specNote: seed.specNote,
        sourcedAt: SOURCED_AT,
      },
    });
    console.log(`  ✓ ${seed.key} — $${(derived.unitCostCents / 100).toFixed(2)}/${seed.unit}, ${seed.sourceLabel}`);
    created++;
  }

  console.log(`\n  ${created} created, ${skipped} already present, ${missing} missing canonical role.\n`);
  await prisma.$disconnect();
  if (missing > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
