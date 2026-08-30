/**
 * The remaining Phase F costs, and the copper recheck — 29 Aug 2026.
 *
 *   npx tsx prisma/seed-phase-f-costs-round2.ts          report
 *   npx tsx prisma/seed-phase-f-costs-round2.ts --apply  write
 *
 * Ten new costs, plus the two cables whose holds this clears.
 *
 * WIRE_10_3 MOVES A LOT. The 29 Aug figure was $224 for 50 ft — $4.48/ft. The
 * recheck is $400 for 250 ft, which is $1.60/ft: a 64% fall. That is not a
 * market move over a few hours, it is a bulk package against a short one, and
 * it is exactly why the hold existed. Every unpublished service consuming 10/3
 * re-derives on the new figure.
 *
 * WIRE_6_3 is unchanged at $3.97/ft, now confirmed rather than provisional.
 */

import { PrismaClient } from "@prisma/client";
import { eliteContractorId } from "./_componentHelpers";

const prisma = new PrismaClient();

const ESTABLISHED = new Date("2026-08-29T00:00:00.000Z");

type Cost = {
  key: string;
  packagePriceCents: number;
  packageQuantity: number;
  packageUnit: string;
  evidence: string;
  /** Set when replacing an existing cost rather than creating one. */
  replaces?: string;
};

const COSTS: Cost[] = [
  // ── 240V receptacles, by NEMA configuration ─────────────────────────────
  { key: "RECEPTACLE_6_30", packagePriceCents: 1355, packageQuantity: 1, packageUnit: "each",
    evidence: "NEMA 6-30R flush receptacle. Retail check 29 Aug 2026." },
  { key: "RECEPTACLE_14_30", packagePriceCents: 1098, packageQuantity: 1, packageUnit: "each",
    evidence: "NEMA 14-30R flush receptacle. Retail check 29 Aug 2026." },
  { key: "RECEPTACLE_6_50", packagePriceCents: 1357, packageQuantity: 1, packageUnit: "each",
    evidence: "NEMA 6-50R flush receptacle. Retail check 29 Aug 2026." },
  { key: "RECEPTACLE_14_50", packagePriceCents: 1142, packageQuantity: 1, packageUnit: "each",
    evidence: "NEMA 14-50R flush receptacle. Retail check 29 Aug 2026." },

  // ── the 2-conductor cables that pair with them ──────────────────────────
  { key: "WIRE_10_2", packagePriceCents: 30800, packageQuantity: 250, packageUnit: "ft",
    evidence: "10/2 NM-B copper, 250 ft roll. Retail check 29 Aug 2026." },
  { key: "WIRE_6_2", packagePriceCents: 36100, packageQuantity: 125, packageUnit: "ft",
    evidence: "6/2 NM-B copper, 125 ft roll. Retail check 29 Aug 2026." },

  // ── under-cabinet, architecture B ───────────────────────────────────────
  { key: "LED_TAPE", packagePriceCents: 6550, packageQuantity: 16.4, packageUnit: "ft",
    evidence:
      "Warm-white high-CRI LED tape, 5 m reel (16.4 ft). Retail check 29 Aug " +
      "2026. Priced per foot because a kitchen is measured in feet, not reels." },
  { key: "LED_CHANNEL_DIFFUSER", packagePriceCents: 2997, packageQuantity: 16.25, packageUnit: "ft",
    evidence:
      "Aluminium channel with diffuser, five 39-inch sections = 16.25 ft per " +
      "pack. Retail check 29 Aug 2026. The pack is the purchase; the foot is " +
      "the unit a recipe counts." },
  { key: "LED_DRIVER", packagePriceCents: 5895, packageQuantity: 1, packageUnit: "each",
    evidence: "Hardwired low-voltage LED driver. Retail check 29 Aug 2026." },

  // ── spa ─────────────────────────────────────────────────────────────────
  { key: "CONDUIT_FITTINGS_1", packagePriceCents: 1200, packageQuantity: 1, packageUnit: "set",
    evidence:
      "Couplings, straps, connectors and glue for one 1-inch run. Retail " +
      "check 29 Aug 2026." },
];

/** The recheck. Both holds clear; one figure moves substantially. */
const RECHECK: Cost[] = [
  { key: "WIRE_10_3", packagePriceCents: 40000, packageQuantity: 250, packageUnit: "ft",
    replaces: "$224.00 / 50 ft = $4.48/ft",
    evidence:
      "10/3 NM-B copper, 250 ft roll. Supplier recheck 29 Aug 2026. Replaces a " +
      "50 ft package at $4.48/ft — a 64% fall per foot, which is a bulk roll " +
      "against a short one rather than a market move. Hold cleared." },
  { key: "WIRE_6_3", packagePriceCents: 49600, packageQuantity: 125, packageUnit: "ft",
    replaces: "$496.00 / 125 ft = $3.97/ft",
    evidence:
      "6/3 NM-B copper, 125 ft roll. Supplier recheck 29 Aug 2026 confirms the " +
      "original figure unchanged. Hold cleared." },
];

async function write(contractorId: string, c: Cost, apply: boolean) {
  const role = await prisma.canonicalMaterial.findUnique({
    where: { key: c.key }, select: { id: true, unit: true },
  });
  if (!role) { console.log(`  ! ${c.key} is not a canonical role — skipped`); return; }
  if (c.packageQuantity <= 0) throw new Error(`${c.key}: package quantity must be positive`);
  if (c.packageUnit !== role.unit) {
    throw new Error(`${c.key}: priced per "${c.packageUnit}" but the role counts "${role.unit}"`);
  }

  const milli = Math.round((c.packagePriceCents * 1000) / c.packageQuantity);
  const unit = Math.round(milli / 1000);
  const existing = await prisma.contractorMaterial.findFirst({
    where: { contractorId, canonicalMaterialId: role.id },
    select: { id: true, unitCostCents: true },
  });

  const arrow = existing
    ? `$${(existing.unitCostCents / 100).toFixed(2)} -> $${(unit / 100).toFixed(2)}`
    : `$${(unit / 100).toFixed(2)}`;
  console.log(
    `  ${c.key.padEnd(26)} $${(c.packagePriceCents / 100).toFixed(2)} / ${c.packageQuantity} ${c.packageUnit}` +
      `  ->  ${arrow}/${role.unit}`
  );
  if (c.replaces) console.log(`      was ${c.replaces}`);
  if (!apply) return;

  const data = {
    unitCostCents: unit,
    unitCostMilliCents: milli,
    packagePriceCents: c.packagePriceCents,
    packageQuantity: c.packageQuantity,
    packageUnit: c.packageUnit,
    costSource: "CUSTOM" as const,
    costConfidence: "CONFIRMED" as const,
    // Clearing the hold is part of writing the recheck, not a separate step
    // somebody might forget.
    costStatus: "OK" as const,
    costStatusNote: null,
    costUpdatedAt: ESTABLISHED,
    notes: c.evidence,
    active: true,
  };

  if (existing) {
    await prisma.contractorMaterial.update({ where: { id: existing.id }, data });
  } else {
    await prisma.contractorMaterial.create({
      data: { contractorId, canonicalMaterialId: role.id, ...data },
    });
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const contractorId = await eliteContractorId(prisma);

  console.log(`\nPHASE F COSTS — ROUND 2\n`);
  console.log(`  NEW\n`);
  for (const c of COSTS) await write(contractorId, c, apply);

  console.log(`\n  RECHECK — clears the copper holds\n`);
  for (const c of RECHECK) await write(contractorId, c, apply);

  console.log();
  if (!apply) { console.log(`  Report only. Re-run with --apply to write.\n`); return; }

  const all = await prisma.canonicalMaterial.count();
  const priced = await prisma.contractorMaterial.count({ where: { contractorId, active: true } });
  console.log(`  ✓ Written. Canonical roles ${all}, Elite priced ${priced}, awaiting ${all - priced}.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
