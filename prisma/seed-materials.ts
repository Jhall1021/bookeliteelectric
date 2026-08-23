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
  { key: "BREAKER_DOUBLE_POLE", name: "Double-pole breaker", unitCostCents: 1800, unit: "each", notes: "Corrected from $19. Shared — also used by whole-house surge." },

  // --- 240V receptacles ---------------------------------------------------
  // Both services replace a receptacle and neither had one recorded, which
  // is why they held: the model was pricing labor for a part swap with no
  // part in it.
  { key: "RECEPTACLE_DRYER_30A", name: "30A 3- or 4-prong dryer receptacle", unitCostCents: 815, unit: "each" },
  { key: "RECEPTACLE_RANGE_50A", name: "50A 3- or 4-prong range receptacle", unitCostCents: 815, unit: "each" },

  { key: "BOX_CEILING_STANDARD", name: "Standard ceiling box", unitCostCents: 340, unit: "each" },

  // --- specialist parts ---------------------------------------------------
  // The 20A dedicated circuit substitutes 12/2 for 14/2 across the 50 ft run.
  // Recorded as the extra copper rather than a percentage: the old rule
  // assumed 12/2 cost 30% more, when at $0.50 and $0.72 it's 44%.

  { key: "SMOKE_CO_COMBO", name: "Smoke/CO combination detector", unitCostCents: 6000, unit: "each",
    notes: "Bought as one item — no internal breakdown to invent." },
  { key: "SURGE_PROTECTOR_WHOLE_HOUSE", name: "Whole-house surge protector", unitCostCents: 14200, unit: "each" },
  { key: "SURGE_TRIM_KIT", name: "Surge protector trim kit", unitCostCents: 5800, unit: "each" },
  { key: "RECESSED_WAFER", name: "Canless LED wafer light, driver and J-box included", unitCostCents: 3000, unit: "each",
    notes: "The wafer carries its own driver box — do not add a ceiling box." },

  // --- devices Elite supplies -------------------------------------------
  //
  // Each cost is the device alone. The plate and consumables that go with it
  // are separate lines on the assembly, which is why these don't match the
  // allowance figures they replace — a $37 USB package is a $33 outlet plus
  // $4 of small parts.
  { key: "OUTLET_USB", name: "USB / USB-C outlet", unitCostCents: 3300, unit: "each" },
  { key: "OUTLET_SMART", name: "Smart outlet", unitCostCents: 5800, unit: "each" },
  { key: "SWITCH_OCCUPANCY", name: "Occupancy / motion sensor switch", unitCostCents: 3800, unit: "each" },
  { key: "SWITCH_TIMER", name: "Timer switch", unitCostCents: 5800, unit: "each" },
  { key: "SMOKE_DETECTOR_HARDWIRED", name: "Hardwired smoke detector", unitCostCents: 2200, unit: "each" },
  { key: "DOORBELL_TRANSFORMER", name: "Doorbell transformer", unitCostCents: 1200, unit: "each" },

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
  {
    // Retired. This was an assumed $8 on the bathroom fan, and the owner's
    // decision was to remove it rather than replace it with another guess:
    // that service is customer-supplied and has no confirmed Elite material,
    // so its direct material is $0. An invented allowance is worse than none.
    key: "DUCT_CONNECTOR", name: "Duct connector and clamp", unitCostCents: 800, unit: "each",
    active: false, notes: "Retired — was an assumption, never a quoted cost.",
  },
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
    slug: "usb-outlet-upgrade",
    items: [["OUTLET_USB", 1], ["WALL_PLATE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "smart-outlet-upgrade",
    items: [["OUTLET_SMART", 1], ["WALL_PLATE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "occupancy-motion-switch",
    items: [["SWITCH_OCCUPANCY", 1], ["WALL_PLATE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "timer-switch-install",
    items: [["SWITCH_TIMER", 1], ["WALL_PLATE", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "hardwired-smoke-detector",
    items: [["SMOKE_DETECTOR_HARDWIRED", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "doorbell-transformer-replacement",
    items: [["DOORBELL_TRANSFORMER", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    // A run, not a device. 25 ft of cable is a 10 ft route with slack, and
    // the assembly comes to $21.50 against the $21.80 allowance it replaces
    // — thirty cents, which vanishes in $5 rounding.
    slug: "new-120v-outlet",
    items: [
      ["RECEPTACLE_STANDARD", 1], ["BOX_OLD_WORK", 1], ["WALL_PLATE", 1],
      ["WIRE_14_2", 25], ["CONSUMABLES_SMALL", 1],
    ],
  },
  {
    slug: "bidet-smart-toilet-outlet",
    items: [
      ["RECEPTACLE_STANDARD", 1], ["BOX_OLD_WORK", 1], ["WALL_PLATE", 1],
      ["WIRE_14_2", 25], ["CONSUMABLES_SMALL", 1],
    ],
  },
  {
    // The EV-category duplicate. Same physical installation, so the same
    // package — leaving it blocked because nobody copied the composition
    // across would be an accident of bookkeeping, not a real gap.
    slug: "garage-door-opener-outlet-ev",
    items: [
      ["RECEPTACLE_STANDARD", 1], ["BOX_OLD_WORK", 1], ["WALL_PLATE", 1],
      ["WIRE_14_2", 25], ["CONSUMABLES_SMALL", 1],
    ],
  },
  {
    slug: "garage-door-opener-outlet",
    items: [
      ["RECEPTACLE_STANDARD", 1], ["BOX_OLD_WORK", 1], ["WALL_PLATE", 1],
      ["WIRE_14_2", 25], ["CONSUMABLES_SMALL", 1],
    ],
  },
  {
    // 15A / 120V standard package. The 20A route substitutes 12/2 rather
    // than carrying a percentage upcharge — see the note on wire below.
    slug: "dedicated-120v-circuit-outlet",
    items: [
      ["BREAKER_SINGLE_POLE", 1], ["RECEPTACLE_STANDARD", 1], ["BOX_OLD_WORK", 1],
      ["WALL_PLATE", 1], ["WIRE_14_2", 50], ["CONSUMABLES_MEDIUM", 1],
    ],
  },
  {
    slug: "smoke-co-detector",
    items: [["SMOKE_CO_COMBO", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    // The old $175 allowance missed the trim kit entirely and understated
    // the protector.
    slug: "whole-house-surge-protection",
    items: [
      ["SURGE_PROTECTOR_WHOLE_HOUSE", 1], ["SURGE_TRIM_KIT", 1], ["BREAKER_DOUBLE_POLE", 1],
    ],
  },
  {
    // First light: the wafer, a 25 ft home run, consumables. Additional
    // lights carry a 10 ft jumper instead and live on components.
    slug: "recessed-lighting",
    items: [["RECESSED_WAFER", 1], ["WIRE_14_2", 25], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "dryer-receptacle-replacement",
    items: [["RECEPTACLE_DRYER_30A", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "range-receptacle-replacement",
    items: [["RECEPTACLE_RANGE_50A", 1], ["CONSUMABLES_SMALL", 1]],
  },
  {
    // The fixture is the customer's unless a service says otherwise, so this
    // is the lighting POINT: box, cable, consumables.
    slug: "new-ceiling-light",
    items: [["BOX_CEILING_STANDARD", 1], ["WIRE_14_2", 25], ["CONSUMABLES_SMALL", 1]],
  },
  {
    slug: "new-ceiling-fan",
    items: [["BOX_FAN_RATED", 1], ["WIRE_14_2", 25], ["CONSUMABLES_SMALL", 1]],
  },
  {
    // The fan-rated box is in the standard allowance rather than a question.
    // Most existing light boxes aren't fan-rated, and asking a homeowner to
    // determine that is asking them to do a survey. If one turns out to be
    // reusable, that's a few dollars of material saved on the job — not a
    // branch in the tree.
    //
    // No cable: the wiring is already at the box.
    slug: "fan-replacing-light",
    items: [["BOX_FAN_RATED", 1], ["CONSUMABLES_SMALL", 1]],
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

/**
 * Services with NO Elite-supplied material, stated explicitly.
 *
 * Deleting a service's assembly isn't enough — the flat materialCostCents
 * field only gets rewritten for services that HAVE an assembly, so removing
 * one leaves the old figure sitting there. The bathroom fan kept $11 of
 * retired duct connector that way, and the model quietly priced it.
 *
 * "No material" has to be asserted, not implied by absence.
 */
const NO_MATERIAL: { slug: string; why: string }[] = [
  {
    slug: "bathroom-fan-light-combo",
    why: "Customer supplies the fan; no confirmed Elite-supplied material. The old $8 duct connector was an assumption and was withdrawn rather than replaced.",
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

  for (const n of NO_MATERIAL) {
    const svc = await prisma.service.findUnique({ where: { slug: n.slug } });
    if (!svc) continue;
    await prisma.serviceMaterial.deleteMany({ where: { serviceId: svc.id } });
    if (svc.materialCostCents) {
      await prisma.service.update({
        where: { id: svc.id },
        data: { materialCostCents: 0, materialMultiplier: null, materialMultiplierReason: null },
      });
      console.log(`  ✓ ${n.slug} — cleared $${(svc.materialCostCents / 100).toFixed(2)} of stale material`);
    }
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
