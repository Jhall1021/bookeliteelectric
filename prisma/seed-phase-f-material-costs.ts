/**
 * Elite's costs for the Phase F roles — 29 August 2026.
 *
 *   npx tsx prisma/seed-phase-f-material-costs.ts          report
 *   npx tsx prisma/seed-phase-f-material-costs.ts --apply  write
 *
 * CONTRACTOR LAYER. The canonical role says a spa circuit needs 25 ft of 6/3;
 * this says what Elite pays for 6/3, sourced from their own supplier checks.
 * Contractor B's figure will differ without either being wrong, which is the
 * entire reason the two layers are separate.
 *
 * Brands live HERE and nowhere above. "Square D spa panel", "Reliance L14-30",
 * "Homeline breaker" are evidence for a contractor's cost and belong on the
 * contractor's row — never in a canonical key, name or note.
 *
 * PACKAGE IN, UNIT OUT. Every figure below is the package actually bought, and
 * the unit cost is derived:
 *
 *     unitCostMilliCents = round(packagePriceCents * 1000 / packageQuantity)
 *     unitCostCents      = round(unitCostMilliCents / 1000)
 *
 * Storing the package is what keeps a rounding artifact and a real price rise
 * distinguishable a year from now, and what makes the admin's figure match the
 * invoice. Milli-cents clear $21,000, so a $275 panel is nowhere near a limit.
 *
 * CONFIRMED vs ASSUMED is not decoration. A figure read off a current retail
 * listing and a figure chosen to represent a class of parts are different kinds
 * of number, and a later reader must be able to tell which they are looking at.
 *
 * Five roles are deliberately NOT here — they are waiting on decisions that
 * are about what the standard package IS, not what it costs. See the report.
 */

import { PrismaClient } from "@prisma/client";
import { eliteContractorId } from "./_componentHelpers";

const prisma = new PrismaClient();

/** The day these figures were established. Not "now" — reruns must not relabel them. */
const ESTABLISHED = new Date("2026-08-29T00:00:00.000Z");

type Cost = {
  key: string;
  packagePriceCents: number;
  packageQuantity: number;
  packageUnit: string;
  confidence: "CONFIRMED" | "ASSUMED";
  evidence: string;
};

const COSTS: Cost[] = [
  // ── retail-backed, checked 29 Aug ───────────────────────────────────────
  { key: "WIRE_BELL_18_2", packagePriceCents: 1981, packageQuantity: 100, packageUnit: "ft",
    confidence: "CONFIRMED",
    evidence: "18/2 solid thermostat/bell cable, 100 ft coil. Retail check 29 Aug 2026." },

  { key: "WIRE_10_3", packagePriceCents: 22400, packageQuantity: 50, packageUnit: "ft",
    confidence: "CONFIRMED",
    evidence:
      "10/3 copper NM-B, 50 ft. Retail check 29 Aug 2026. Copper is high right " +
      "now and this is the current package price rather than a historical one — " +
      "worth rechecking before any package built on it is published." },

  { key: "WIRE_6_3", packagePriceCents: 49600, packageQuantity: 125, packageUnit: "ft",
    confidence: "CONFIRMED",
    evidence:
      "6/3 copper NM-B, 125 ft roll. Retail check 29 Aug 2026. Same copper " +
      "caveat as 10/3, and this is the largest single material line in the spa " +
      "package." },

  { key: "CONDUIT_PVC_1", packagePriceCents: 1075, packageQuantity: 10, packageUnit: "ft",
    confidence: "CONFIRMED",
    evidence: "1 in. Schedule 40 PVC, 10 ft length. Retail check 29 Aug 2026." },

  { key: "BOX_SURFACE_4S", packagePriceCents: 267, packageQuantity: 1, packageUnit: "each",
    confidence: "CONFIRMED",
    evidence: "4 in. square metal box. Retail check 29 Aug 2026." },

  { key: "SPA_PANEL_GFCI_50A", packagePriceCents: 12900, packageQuantity: 1, packageUnit: "each",
    confidence: "CONFIRMED",
    evidence:
      "50A GFCI spa panel — Square D as the standard-package reference. Retail " +
      "check 29 Aug 2026." },

  { key: "GENERATOR_INLET_BOX_30A", packagePriceCents: 6490, packageQuantity: 1, packageUnit: "each",
    confidence: "CONFIRMED",
    evidence:
      "L14-30 outdoor power inlet — Reliance Controls as the reference. Retail " +
      "check 29 Aug 2026." },

  { key: "GROUND_ROD", packagePriceCents: 2901, packageQuantity: 1, packageUnit: "each",
    confidence: "CONFIRMED",
    evidence: "5/8 in. x 8 ft copper-clad ground rod. Retail check 29 Aug 2026." },

  { key: "GROUND_CLAMP", packagePriceCents: 360, packageQuantity: 1, packageUnit: "each",
    confidence: "CONFIRMED",
    evidence: "Direct-burial rated grounding clamp. Retail check 29 Aug 2026." },

  { key: "WIRE_GROUND_6", packagePriceCents: 5400, packageQuantity: 50, packageUnit: "ft",
    confidence: "CONFIRMED",
    evidence: "Solid #6 bare copper, 50 ft. Retail check 29 Aug 2026." },

  { key: "METER_SOCKET_200A", packagePriceCents: 10400, packageQuantity: 1, packageUnit: "each",
    confidence: "CONFIRMED",
    evidence:
      "Generic 200A residential meter socket. Retail check 29 Aug 2026. Subject " +
      "to the serving utility's approved-equipment list, which can force a " +
      "different part in a given territory." },

  { key: "SERVICE_ENTRANCE_CABLE_200A", packagePriceCents: 830, packageQuantity: 1, packageUnit: "ft",
    confidence: "CONFIRMED",
    evidence:
      "4/0-4/0-4/0-2/0 aluminum SER, sold by the foot. Retail check 29 Aug 2026." },

  // Three ratings, one price today. Recorded separately anyway: the point of
  // the split is that a divergence between ratings becomes VISIBLE when it
  // happens, rather than hiding inside an average nobody can see.
  { key: "BREAKER_DOUBLE_POLE_20A", packagePriceCents: 1824, packageQuantity: 1, packageUnit: "each",
    confidence: "CONFIRMED",
    evidence: "2-pole 20A, Homeline as the baseline. Retail check 29 Aug 2026." },
  { key: "BREAKER_DOUBLE_POLE_30A", packagePriceCents: 1824, packageQuantity: 1, packageUnit: "each",
    confidence: "CONFIRMED",
    evidence: "2-pole 30A, Homeline as the baseline. Retail check 29 Aug 2026." },
  { key: "BREAKER_DOUBLE_POLE_50A", packagePriceCents: 1824, packageQuantity: 1, packageUnit: "each",
    confidence: "CONFIRMED",
    evidence: "2-pole 50A, Homeline as the baseline. Retail check 29 Aug 2026." },

  // ── deliberately chosen, not observed ───────────────────────────────────
  { key: "INTERLOCK_KIT", packagePriceCents: 11500, packageQuantity: 1, packageUnit: "each",
    confidence: "ASSUMED",
    evidence:
      "Owner decision, 29 Aug 2026: $115 as the standard-package figure across " +
      "mainstream residential panels. Observed spread is roughly $54 to $142 " +
      "(Siemens ~$54, GE ~$85, Square D ~$96-138, Eaton ~$142). Not the cheapest, " +
      "and not an average of every panel ever made. SCOPE CONSEQUENCE: the " +
      "standard package covers panels with a listed kit at a normal material " +
      "cost; specialty, obsolete, unsupported or unusually expensive " +
      "panel-specific kits route to review." },

  { key: "PANEL_MAIN_BREAKER", packagePriceCents: 22500, packageQuantity: 1, packageUnit: "each",
    confidence: "ASSUMED",
    evidence:
      "Owner decision, 29 Aug 2026: $225 provisional for a mainstream " +
      "like-for-like replacement load center. Observed 100-150A range roughly " +
      "$128-$248. Deliberately not the cheapest and deliberately not " +
      "SKU-specific; large, specialty or high-space-count equipment is outside " +
      "the standard package." },

  { key: "PANEL_200A_MAIN_BREAKER", packagePriceCents: 27500, packageQuantity: 1, packageUnit: "each",
    confidence: "ASSUMED",
    evidence:
      "Owner decision, 29 Aug 2026: $275 provisional for a mainstream 200A " +
      "main-breaker load center. Observed range roughly $166-$291 by series and " +
      "space count. Same boundary as the replacement panel." },
];

/** Waiting on a decision about what the standard package IS, not what it costs. */
const HELD: Record<string, string> = {
  LED_UNDERCABINET_BAR:
    "Product architecture undecided — integrated linkable bars, or tape in " +
    "channel with a remote driver. The two are different physical systems and " +
    "the role's per-foot unit only fits one of them.",
  LED_DRIVER:
    "Same decision. A remote driver only exists in the tape-and-channel " +
    "architecture; integrated bars carry their own electronics.",
  RECEPTACLE_240V_30A:
    "Awaiting the 6-30 vs 14-30 decision — whether the standard package means " +
    "a neutral-equipped 4-wire outlet.",
  RECEPTACLE_240V_50A:
    "Awaiting the 6-50 vs 14-50 decision, same question.",
  CONDUIT_FITTINGS_1:
    "No figure supplied yet. Small, but the spa package cannot derive without it.",
};

async function main() {
  const apply = process.argv.includes("--apply");
  const contractorId = await eliteContractorId(prisma);

  console.log(`\nELITE MATERIAL COSTS — PHASE F ROLES\n`);

  let written = 0;
  let skipped = 0;

  for (const c of COSTS) {
    const role = await prisma.canonicalMaterial.findUnique({
      where: { key: c.key },
      select: { id: true, unit: true },
    });
    if (!role) {
      console.log(`  ! ${c.key} is not a canonical role — skipped\n`);
      continue;
    }

    // A package quantity of zero would divide by zero and a negative one is
    // nonsense. Fail rather than write a cost nobody can explain.
    if (c.packageQuantity <= 0) {
      throw new Error(`${c.key}: package quantity must be positive`);
    }
    // The package unit has to be the unit the recipe counts, or the division
    // silently produces a cost per the wrong thing.
    if (c.packageUnit !== role.unit) {
      throw new Error(
        `${c.key}: package is priced per "${c.packageUnit}" but the role counts "${role.unit}"`
      );
    }

    const milli = Math.round((c.packagePriceCents * 1000) / c.packageQuantity);
    const unit = Math.round(milli / 1000);

    const existing = await prisma.contractorMaterial.findFirst({
      where: { contractorId, canonicalMaterialId: role.id },
      select: { id: true, unitCostCents: true },
    });

    console.log(
      `  ${c.key.padEnd(30)} $${(c.packagePriceCents / 100).toFixed(2)} / ${c.packageQuantity} ${c.packageUnit}` +
        `  ->  $${(unit / 100).toFixed(2)}/${role.unit}   ${c.confidence}`
    );

    if (existing) {
      console.log(`      already costed at $${(existing.unitCostCents / 100).toFixed(2)} — left alone`);
      skipped++;
      continue;
    }

    if (apply) {
      await prisma.contractorMaterial.create({
        data: {
          contractorId,
          canonicalMaterialId: role.id,
          unitCostCents: unit,
          unitCostMilliCents: milli,
          packagePriceCents: c.packagePriceCents,
          packageQuantity: c.packageQuantity,
          packageUnit: c.packageUnit,
          costSource: "CUSTOM",
          costConfidence: c.confidence,
          costStatus: "OK",
          costUpdatedAt: ESTABLISHED,
          notes: c.evidence,
          active: true,
        },
      });
      written++;
    }
  }

  console.log(`\n  HELD — decision needed about the package, not the price:\n`);
  for (const [k, why] of Object.entries(HELD)) {
    console.log(`      ${k}`);
    console.log(`          ${why}`);
  }

  console.log();
  if (!apply) {
    console.log(`  Report only. Re-run with --apply to write.\n`);
    return;
  }
  console.log(`  ✓ ${written} cost(s) written, ${skipped} already present, ${Object.keys(HELD).length} held.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
