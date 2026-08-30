/**
 * Two role designs corrected before anything was built on them — 29 Aug 2026.
 *
 *   npx tsx prisma/seed-phase-f-role-redesign.ts          report
 *   npx tsx prisma/seed-phase-f-role-redesign.ts --apply  write
 *
 * 240V RECEPTACLES — a role must not straddle a physical difference.
 *
 * `RECEPTACLE_240V_30A` was defined as "NEMA 6-30 or 14-30". Those are
 * different devices on different circuits: 6-30 is two hots and a ground,
 * 14-30 adds a neutral. One role covering both meant the recipe silently
 * chose 3-conductor cable for every job, which over-specifies a welder or a
 * compressor — the equipment the service names in its own description — by
 * roughly $38-42 to the customer.
 *
 * The homeowner can answer this by looking at the plug. So the role splits by
 * NEMA configuration, the cable splits with it, and the tree asks.
 *
 * UNDER-CABINET — the unit had already chosen an architecture.
 *
 * `LED_UNDERCABINET_BAR` was denominated per FOOT, which is how tape is sold,
 * while the products actually surveyed were integrated fixtures counted each.
 * The role was quietly asserting an answer to a question nobody had asked.
 * Architecture B is chosen — tape in channel with a remote driver — so the one
 * ambiguous role becomes three honest ones.
 *
 * Nothing is lost: all three retired roles were created hours ago, have never
 * been costed by any contractor, and appear in no service, template or
 * component recipe. Proven below before deletion rather than assumed.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Role = { key: string; name: string; unit: string; notes: string };

const ADD: Role[] = [
  // ── 240V receptacles, by NEMA configuration ─────────────────────────────
  {
    key: "RECEPTACLE_6_30",
    name: "NEMA 6-30 receptacle (30A, no neutral)",
    unit: "each",
    notes:
      "Two hots and a ground. The 3-prong 30A configuration — the common one " +
      "for shop equipment that has no 120V control circuit.",
  },
  {
    key: "RECEPTACLE_14_30",
    name: "NEMA 14-30 receptacle (30A, with neutral)",
    unit: "each",
    notes:
      "Two hots, neutral and ground. The 4-prong 30A configuration, used " +
      "where the equipment draws 120V for controls. Distinct from " +
      "RECEPTACLE_DRYER_30A, which is specifically the laundry product.",
  },
  {
    key: "RECEPTACLE_6_50",
    name: "NEMA 6-50 receptacle (50A, no neutral)",
    unit: "each",
    notes:
      "Two hots and a ground. The classic welder outlet, and the reason this " +
      "family had to be split — a welder does not want a neutral.",
  },
  {
    key: "RECEPTACLE_14_50",
    name: "NEMA 14-50 receptacle (50A, with neutral)",
    unit: "each",
    notes:
      "Two hots, neutral and ground. The 4-prong 50A configuration. Distinct " +
      "from RECEPTACLE_RANGE_50A, which is the kitchen range product.",
  },

  // ── the conductors that go with them ────────────────────────────────────
  {
    key: "WIRE_10_2",
    name: "10/2 NM-B copper cable",
    unit: "ft",
    notes:
      "Two conductors plus ground, 10 AWG. Feeds a 30A 240V circuit that " +
      "needs no neutral — the 6-30 half of the pair.",
  },
  {
    key: "WIRE_6_2",
    name: "6/2 NM-B copper cable",
    unit: "ft",
    notes:
      "Two conductors plus ground, 6 AWG. Feeds a 50A 240V circuit that needs " +
      "no neutral — the 6-50 half of the pair.",
  },

  // ── under-cabinet, architecture B ───────────────────────────────────────
  {
    key: "LED_TAPE",
    name: "LED tape",
    unit: "ft",
    notes:
      "Warm-white high-CRI LED tape, cut to length. Carries no driver and no " +
      "housing — both are separate roles, which is what makes this " +
      "architecture different from an integrated bar fixture.",
  },
  {
    key: "LED_CHANNEL_DIFFUSER",
    name: "Aluminium channel with diffuser",
    unit: "ft",
    notes:
      "Extrusion and lens the tape mounts into. Priced per foot alongside the " +
      "tape because they are cut and installed together; it is what turns a " +
      "strip of dots into a line of light.",
  },
];

/** Created hours ago, never costed, never used. Proven, not assumed. */
const RETIRE = ["RECEPTACLE_240V_30A", "RECEPTACLE_240V_50A", "LED_UNDERCABINET_BAR"];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nPHASE F ROLE REDESIGN\n`);

  console.log(`  ADD\n`);
  let added = 0;
  for (const r of ADD) {
    const found = await prisma.canonicalMaterial.findUnique({ where: { key: r.key } });
    if (found) { console.log(`  · ${r.key.padEnd(26)} already exists`); continue; }
    console.log(`  + ${r.key.padEnd(26)} ${r.unit.padEnd(5)} ${r.name}`);
    if (apply) {
      await prisma.canonicalMaterial.create({
        data: { key: r.key, name: r.name, unit: r.unit, notes: r.notes, active: true },
      });
      added++;
    }
  }

  console.log(`\n  RETIRE — each proven unused first\n`);
  let retired = 0;
  for (const key of RETIRE) {
    const m = await prisma.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
    if (!m) { console.log(`  · ${key.padEnd(26)} not present`); continue; }

    // The proof runs HERE, in the script that does the deleting — not once in
    // a report somebody read yesterday. A role in use is kept and deactivated;
    // only a role nothing references is removed.
    const [cost, recipe, template, component] = await Promise.all([
      prisma.contractorMaterial.count({ where: { canonicalMaterialId: m.id } }),
      prisma.serviceMaterial.count({ where: { canonicalMaterialId: m.id } }),
      prisma.templateServiceMaterial.count({ where: { canonicalMaterialId: m.id } }),
      prisma.canonicalComponentMaterial.count({ where: { canonicalMaterialId: m.id } }),
    ]);
    const used = cost + recipe + template + component;

    if (used > 0) {
      console.log(`  ! ${key.padEnd(26)} IN USE (cost ${cost}, recipe ${recipe}, template ${template}, component ${component})`);
      console.log(`      Deactivating rather than deleting — something still points at it.`);
      if (apply) await prisma.canonicalMaterial.update({ where: { id: m.id }, data: { active: false } });
      continue;
    }

    console.log(`  - ${key.padEnd(26)} unused everywhere — removed`);
    if (apply) { await prisma.canonicalMaterial.delete({ where: { id: m.id } }); retired++; }
  }

  console.log();
  if (!apply) { console.log(`  Report only. Re-run with --apply to write.\n`); return; }
  console.log(`  ✓ ${added} added, ${retired} removed.`);
  console.log(`    None of the new roles has a cost, so none can price anything yet.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
