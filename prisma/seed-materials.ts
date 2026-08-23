/**
 * Materials catalog.
 *
 *   npx tsx prisma/seed-materials.ts
 *
 * Parts priced once, referenced by every service that uses them. Previously a
 * service carried a single materialCostCents — the exterior GFCI held 5244,
 * with the breakdown of what that covered living only in a code comment. A
 * price rise on GFCI receptacles meant grepping seeds for which totals
 * silently included one.
 *
 * Costs are what Elite PAYS. Markup is applied downstream by the §4 tier,
 * against the assembled total for a service rather than per part — a service
 * with six cheap items shouldn't be marked up as though each were a $6
 * purchase.
 *
 * Every figure here came from Josh directly except where noted. Anything
 * marked ASSUMED needs confirming; it's flagged in the output so it can't sit
 * unnoticed.
 *
 * Idempotent — costs update in place, so re-running after a price change
 * reprices every service using that part.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MATERIALS = [
  // --- wire, priced per foot from the 250 ft roll costs ------------------
  { key: "WIRE_14_2", name: "14/2 NM-B cable", unitCostCents: 50, unit: "ft", notes: "$125 per 250 ft roll." },
  { key: "WIRE_12_2", name: "12/2 NM-B cable", unitCostCents: 72, unit: "ft", notes: "$180 per 250 ft roll. 44% over 14/2." },

  // --- breakers ---------------------------------------------------------
  { key: "BREAKER_SINGLE_POLE", name: "Single-pole breaker", unitCostCents: 800, unit: "each" },
  { key: "BREAKER_DOUBLE_POLE", name: "Double-pole breaker", unitCostCents: 1900, unit: "each" },

  // --- low voltage ------------------------------------------------------
  { key: "LOW_VOLTAGE_RING", name: "Low-voltage mounting ring", unitCostCents: 400, unit: "each" },
  { key: "LOW_VOLTAGE_COVER", name: "Low-voltage cable pass-through cover", unitCostCents: 1000, unit: "each" },
  { key: "WALL_PLATE", name: "Wall plate", unitCostCents: 100, unit: "each" },

  // --- devices ----------------------------------------------------------
  { key: "GFCI_WEATHER_RESISTANT", name: "Weather-resistant GFCI receptacle", unitCostCents: 2500, unit: "each" },
  { key: "COVER_IN_USE_BUBBLE", name: "In-use weatherproof bubble cover", unitCostCents: 1500, unit: "each" },
  { key: "BOX_FS_CAST", name: "FS box, cast, single gang", unitCostCents: 800, unit: "each" },

  // --- ASSUMED: needed by existing services, never quoted ---------------
  { key: "RECEPTACLE_STANDARD", name: "Standard duplex receptacle", unitCostCents: 200, unit: "each", notes: "Confirmed for the TV assembly." },
  { key: "GFCI_INTERIOR", name: "Interior GFCI receptacle", unitCostCents: 1800, unit: "each", notes: "Confirmed." },
  { key: "SWITCH_STANDARD", name: "Standard single-pole switch", unitCostCents: 200, unit: "each", notes: "Confirmed." },
  { key: "SWITCH_3WAY", name: "Three-way switch", unitCostCents: 400, unit: "each", notes: "Confirmed." },
  {
    // Elite-supplied. The customer-supplied variant of this service is a
    // separate SKU with no material at all, and the gap between the two
    // should be exactly this part at the §4 tier.
    key: "SMART_SWITCH",
    name: "Smart switch",
    unitCostCents: 6000,
    unit: "each",
    notes: "Confirmed cost price.",
  },
  { key: "DIMMER_LED", name: "LED dimmer", unitCostCents: 3000, unit: "each", notes: "Handoff §14 gives $30 direct." },
  { key: "BOX_OLD_WORK", name: "Old-work box, single gang", unitCostCents: 300, unit: "each", notes: "Confirmed for the TV assembly." },
  { key: "BOX_FAN_RATED", name: "Fan-rated ceiling box and brace", unitCostCents: 1800, unit: "each", notes: "Confirmed." },
  { key: "DUCT_CONNECTOR", name: "Duct connector and clamp", unitCostCents: 800, unit: "each", notes: "ASSUMED — bathroom fan." },
  { key: "CONSUMABLES_SMALL", name: "Consumables — connectors, staples, sealant", unitCostCents: 300, unit: "job", notes: "Per Josh: a couple of dollars." },
  { key: "CONSUMABLES_MEDIUM", name: "Consumables — larger job", unitCostCents: 700, unit: "job", notes: "ASSUMED" },
];

/**
 * Which services use what. Only services whose materials are actually known
 * — the rest keep their flat materialCostCents until someone itemizes them.
 *
 * Quantities are per job, not per unit of anything: 2 ft of 12/2 for a
 * back-to-back GFCI is the whole run.
 */
const ASSEMBLIES: { slug: string; items: [string, number][] }[] = [
  {
    // The list Josh gave: GFCI $25, bubble cover $15, FS box $8, 2 ft of
    // 12/2 at $1.44, consumables $3 = $52.44. The old flat allowance was
    // $50, so it was close.
    slug: "exterior-gfci-standard",
    items: [
      ["GFCI_WEATHER_RESISTANT", 1],
      ["COVER_IN_USE_BUBBLE", 1],
      ["BOX_FS_CAST", 1],
      ["WIRE_12_2", 2],
      ["CONSUMABLES_SMALL", 1],
    ],
  },
  {
    // The list Josh gave: two low-voltage rings and covers for the cable
    // pass-through, an old-work box and receptacle for the outlet behind the
    // screen, a plate, and 8 ft of cable.
    slug: "tv-installation",
    items: [
      ["LOW_VOLTAGE_RING", 2],
      ["LOW_VOLTAGE_COVER", 2],
      ["BOX_OLD_WORK", 1],
      ["RECEPTACLE_STANDARD", 1],
      ["WALL_PLATE", 1],
      ["WIRE_14_2", 8],
    ],
  },
  {
    // One part, but recording it matters: without it the model priced this
    // at the bare $250 minimum, and the published $310 looked like a legacy
    // number rather than the minimum plus a switch.
    slug: "smart-switch-upgrade",
    items: [["SMART_SWITCH", 1]],
  },
  {
    // Device replacements where Elite supplies the part. Plate and
    // consumables ride along on all of them — a swap uses wire nuts and
    // screws whatever the device is.
    slug: "replace-standard-outlet",
    items: [["RECEPTACLE_STANDARD", 1], ["WALL_PLATE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "replace-standard-switch",
    items: [["SWITCH_STANDARD", 1], ["WALL_PLATE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "replace-3-way-switch",
    items: [["SWITCH_3WAY", 1], ["WALL_PLATE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "replace-gfci-outlet",
    items: [["GFCI_INTERIOR", 1], ["WALL_PLATE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "replace-led-dimmer",
    items: [["DIMMER_LED", 1], ["WALL_PLATE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    // Customer-supplied variants carry NO device. That's the whole point of
    // them, and it makes the gap against the Elite-supplied version exactly
    // the part at the §4 tier — which is the number a customer is really
    // choosing between.
    slug: "customer-supplied-non-smart-outlet",
    items: [["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "swap-out-customer-supplied-non-smart-switch",
    items: [["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "customer-supplied-smart-switch",
    items: [["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "single-pole-breaker-replacement",
    items: [["BREAKER_SINGLE_POLE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "double-pole-breaker-replacement",
    items: [["BREAKER_DOUBLE_POLE", 1], ["CONSUMABLES_SMALL", 1]],
  },
];

async function main() {
  for (const m of MATERIALS) {
    await prisma.material.upsert({
      where: { key: m.key },
      update: {
        name: m.name,
        unitCostCents: m.unitCostCents,
        unit: m.unit,
        notes: m.notes ?? null,
      },
      create: m,
    });
  }
  console.log(`  ✓ ${MATERIALS.length} materials in the catalog`);

  const assumed = MATERIALS.filter((m) => m.notes?.startsWith("ASSUMED"));
  if (assumed.length) {
    console.log(`\n  ! ${assumed.length} cost(s) are assumptions, not quoted figures:`);
    for (const m of assumed) {
      console.log(`      ${m.name} — $${(m.unitCostCents / 100).toFixed(2)}`);
    }
    console.log(`    Nothing prices from these yet unless a service below uses them.`);
  }

  console.log();
  for (const a of ASSEMBLIES) {
    const service = await prisma.service.findUnique({ where: { slug: a.slug } });
    if (!service) {
      console.log(`  – ${a.slug} not in the catalog, skipped`);
      continue;
    }

    // Rebuild the list rather than merging — the seed is the source of truth
    // for which parts a service uses, and a stale row would quietly inflate
    // the total.
    await prisma.serviceMaterial.deleteMany({ where: { serviceId: service.id } });

    let total = 0;
    for (const [i, [key, qty]] of a.items.entries()) {
      const material = await prisma.material.findUniqueOrThrow({ where: { key } });
      await prisma.serviceMaterial.create({
        data: { serviceId: service.id, materialId: material.id, quantity: qty, order: i },
      });
      total += Math.round(material.unitCostCents * qty);
    }

    // The flat field stays in sync so anything still reading it — the pricing
    // panel, the suggested-price calculation — sees the itemized total rather
    // than a stale number.
    //
    // And the legacy multiplier is cleared. Itemizing is the moment a
    // service's material figures become real, so the global tier should
    // govern from here. Services NOT itemized keep their imported multiplier
    // for now: changing those would move suggested prices on the strength of
    // material allowances nobody has checked.
    const hadLegacyMultiplier = service.materialMultiplier;
    await prisma.service.update({
      where: { id: service.id },
      data: { materialCostCents: total, materialMultiplier: null },
    });

    const tier = total < 1000 ? 3.0 : total <= 75000 ? 1.3 : 1.2;
    console.log(
      `  ✓ ${a.slug} — ${a.items.length} item(s), $${(total / 100).toFixed(2)} direct` +
        ` -> $${((total * tier) / 100).toFixed(2)} at ${tier}x` +
        (hadLegacyMultiplier ? `  (cleared legacy ${hadLegacyMultiplier}x)` : "")
    );
  }

  console.log(`
Change a cost above and re-run: every service using that part reprices. The
flat materialCostCents is kept in step automatically, so the pricing engine
and the admin panel don't need to know whether a service has been itemized.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
