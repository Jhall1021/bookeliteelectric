/**
 * Canonical material roles for the Phase F rescue packages.
 *
 *   npx tsx prisma/seed-phase-f-material-roles.ts          report
 *   npx tsx prisma/seed-phase-f-material-roles.ts --apply  create
 *
 * PLATFORM LAYER ONLY. This creates the ROLES — the physical jobs a material
 * does — and deliberately creates no cost for anyone. A role says "this needs
 * 25 ft of 6/3 cable"; what Elite pays for 6/3 is Elite's, entered against
 * their own supplier, and Contractor B's figure will differ without either
 * being wrong.
 *
 * Per docs/MATERIAL-SUPPLIER-CATALOG.md, a key names the job, never the thing:
 * no brand, model, SKU, retailer or package size. `WIRE_6_3` is a role.
 * `SOUTHWIRE_125FT_6_3` is a product wearing a role's clothes.
 *
 * FAILS CLOSED BY CONSTRUCTION. A role with no contractor cost cannot price:
 * any service whose recipe reaches one resolves unpriced rather than cheap.
 * So creating these is safe ahead of the costs, and attaching them to services
 * before the costs exist would simply stop those services pricing — which is
 * why Phase F stops here until the figures are entered.
 *
 * Idempotent. Never overwrites an existing role's unit or name.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Role = { key: string; name: string; unit: string; notes: string };

const ROLES: Role[] = [
  // ── video doorbell ──────────────────────────────────────────────────────
  {
    key: "WIRE_BELL_18_2",
    name: "18/2 low-voltage bell wire",
    unit: "ft",
    notes:
      "Two-conductor 18 AWG low-voltage wire for doorbell and chime runs. Not " +
      "a branch-circuit conductor and not interchangeable with NM-B.",
  },

  // ── under-cabinet lighting ──────────────────────────────────────────────
  {
    key: "LED_UNDERCABINET_BAR",
    name: "Hardwired LED under-cabinet light bar",
    unit: "ft",
    notes:
      "Linkable hardwired LED bar or strip, priced by the linear foot so a " +
      "3-run kitchen and a 1-run kitchen use the same role. Excludes the " +
      "driver, which is its own role because one driver serves several runs.",
  },
  {
    key: "LED_DRIVER",
    name: "LED driver / low-voltage power supply",
    unit: "each",
    notes:
      "The transformer feeding a run of low-voltage LED. Sized to total load, " +
      "so one per installation rather than one per bar.",
  },

  // ── 240V garage outlet ──────────────────────────────────────────────────
  {
    key: "RECEPTACLE_240V_30A",
    name: "240V 30A receptacle",
    unit: "each",
    notes:
      "A 30A 240V outlet for shop equipment — NEMA 6-30 or 14-30 depending on " +
      "whether the equipment needs a neutral. Distinct from " +
      "RECEPTACLE_DRYER_30A, which is specifically the laundry configuration.",
  },
  {
    key: "RECEPTACLE_240V_50A",
    name: "240V 50A receptacle",
    unit: "each",
    notes:
      "A 50A 240V outlet — NEMA 6-50 (welder) or 14-50. Distinct from " +
      "RECEPTACLE_RANGE_50A, which is the kitchen range configuration.",
  },
  {
    key: "BOX_SURFACE_4S",
    name: "4-inch square surface-mount box",
    unit: "each",
    notes:
      "Metal surface box for an exposed garage or shop wall, where an old-work " +
      "box has no finished surface to clamp to.",
  },

  // ── conductors ──────────────────────────────────────────────────────────
  {
    key: "WIRE_10_3",
    name: "10/3 NM-B copper cable",
    unit: "ft",
    notes:
      "Three-conductor 10 AWG with ground, for 30A 240V circuits needing a " +
      "neutral — generator inlets and 14-30 outlets.",
  },
  {
    key: "WIRE_6_3",
    name: "6/3 NM-B copper cable",
    unit: "ft",
    notes:
      "Three-conductor 6 AWG with ground, for 50A 240V circuits — spa " +
      "disconnects and 14-50 outlets.",
  },
  {
    key: "WIRE_GROUND_6",
    name: "6 AWG bare copper grounding electrode conductor",
    unit: "ft",
    notes: "Bonds the panel to ground rods and the water service.",
  },

  // ── breakers, split by amperage ─────────────────────────────────────────
  //
  // BREAKER_DOUBLE_POLE is one role at one cost with no amperage in it, and a
  // 20A SPD breaker, a 30A generator backfeed and a 50A spa breaker are three
  // different parts at three different prices. A role that averages them
  // prices every package that uses it wrongly, in a direction nobody can see.
  {
    key: "BREAKER_DOUBLE_POLE_20A",
    name: "2-pole 20A breaker",
    unit: "each",
    notes:
      "Standard thermal-magnetic 2-pole 20A. Feeds a whole-house surge device.",
  },
  {
    key: "BREAKER_DOUBLE_POLE_30A",
    name: "2-pole 30A breaker",
    unit: "each",
    notes:
      "Standard thermal-magnetic 2-pole 30A. Generator backfeed under an " +
      "interlock, and 30A 240V equipment circuits.",
  },
  {
    key: "BREAKER_DOUBLE_POLE_50A",
    name: "2-pole 50A breaker",
    unit: "each",
    notes:
      "Standard thermal-magnetic 2-pole 50A. Feeds a spa disconnect, which " +
      "provides the GFCI protection itself — a GFCI breaker here would be a " +
      "second, separate role.",
  },

  // ── hot tub / spa ───────────────────────────────────────────────────────
  {
    key: "SPA_PANEL_GFCI_50A",
    name: "50A GFCI spa disconnect panel",
    unit: "each",
    notes:
      "Outdoor-rated disconnect with integral GFCI, mounted in sight of the " +
      "tub. Carries both the disconnecting means and the ground-fault " +
      "protection, which is why the upstream breaker is a standard one.",
  },
  {
    key: "CONDUIT_PVC_1",
    name: "1-inch PVC conduit",
    unit: "ft",
    notes: "Rigid PVC for an exposed exterior run. Excludes fittings.",
  },
  {
    key: "CONDUIT_FITTINGS_1",
    name: "1-inch conduit fittings set",
    unit: "set",
    notes:
      "Couplings, straps, connectors and glue for one run. A set rather than " +
      "each, because nobody counts them individually on a job.",
  },

  // ── generator inlet ─────────────────────────────────────────────────────
  {
    key: "GENERATOR_INLET_BOX_30A",
    name: "30A generator power inlet box",
    unit: "each",
    notes:
      "Exterior weatherproof inlet, typically L14-30, that a portable " +
      "generator's cord plugs into.",
  },
  {
    key: "INTERLOCK_KIT",
    name: "Panel interlock kit",
    unit: "each",
    notes:
      "Mechanical interlock preventing the main and the backfeed breaker from " +
      "being on together. LISTED FOR A SPECIFIC PANEL make and model — the " +
      "role is generic, but which kit fits is decided per job, and cost varies " +
      "enough by brand that the standard package should name which brands it " +
      "covers.",
  },

  // ── panel and service ───────────────────────────────────────────────────
  {
    key: "PANEL_MAIN_BREAKER",
    name: "Main-breaker load center",
    unit: "each",
    notes:
      "Replacement load center at the existing service amperage. Excludes " +
      "branch breakers, which are counted separately.",
  },
  {
    key: "PANEL_200A_MAIN_BREAKER",
    name: "200A main-breaker load center",
    unit: "each",
    notes:
      "Service-upgrade load center with a 200A main. Separate from " +
      "PANEL_MAIN_BREAKER because a service upgrade is a different product " +
      "from a like-for-like replacement and the two must be priced apart.",
  },
  {
    key: "METER_SOCKET_200A",
    name: "200A meter socket",
    unit: "each",
    notes: "Utility-approved meter enclosure for a 200A overhead service.",
  },
  {
    key: "SERVICE_ENTRANCE_CABLE_200A",
    name: "200A service entrance cable",
    unit: "ft",
    notes:
      "SER or SE-U sized for a 200A service, meter socket to load center.",
  },
  {
    key: "GROUND_ROD",
    name: "Ground rod",
    unit: "each",
    notes: "8 ft copper-clad grounding electrode. Two are standard.",
  },
  {
    key: "GROUND_CLAMP",
    name: "Grounding clamp",
    unit: "each",
    notes: "Acorn or water-pipe clamp terminating a grounding conductor.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nPHASE F CANONICAL MATERIAL ROLES\n`);
  console.log(`  ${ROLES.length} role(s). Platform layer only — no contractor cost is created.\n`);

  let created = 0;
  let existed = 0;
  for (const r of ROLES) {
    const found = await prisma.canonicalMaterial.findUnique({ where: { key: r.key } });
    if (found) {
      existed++;
      console.log(`  · ${r.key.padEnd(30)} already exists (${found.unit})`);
      continue;
    }
    console.log(`  + ${r.key.padEnd(30)} ${r.unit.padEnd(6)} ${r.name}`);
    if (apply) {
      await prisma.canonicalMaterial.create({
        data: { key: r.key, name: r.name, unit: r.unit, notes: r.notes, active: true },
      });
      created++;
    }
  }

  console.log();
  if (!apply) {
    console.log(`  Report only. Re-run with --apply to create.\n`);
    return;
  }
  console.log(`  ✓ ${created} created, ${existed} already present.`);
  console.log();
  console.log(`  None of them has a cost, so none can price anything yet — which`);
  console.log(`  is the intended state. Enter Elite's figures against these roles,`);
  console.log(`  then Phase F can build the recipes.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
