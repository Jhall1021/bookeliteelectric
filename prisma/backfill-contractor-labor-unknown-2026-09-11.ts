/**
 * Separate "never established" from "deliberately zero" on contractor labor.
 *
 * `ContractorComponent.addFieldLaborHours` was `Float @default(0)`, so a
 * component nobody had measured and a component someone had decided adds no
 * time held the identical value. An audit of all 44 rows found BOTH meanings
 * present:
 *
 *   22 positive   Elite's own calibration.
 *    5 zero       DELIBERATE. Their seeds declare `addFieldLaborHours: 0` with
 *                 a stated reason — "12/2 costs 30% more than 14/2. Pulling it
 *                 takes no meaningful extra time." These stay 0.
 *   17 zero       NEVER ASKED. Every Routing V2 component: their definitions in
 *                 seed-routing-v2-components.ts do not mention labor at all
 *                 (grep returns zero occurrences), and `def.addFieldLaborHours
 *                 ?? 0` in _componentHelpers turned the silence into a number.
 *                 These become null.
 *
 * The set is NOT identified by a heuristic. It is computed two independent
 * ways — the components the Routing V2 seed declares, and the rows that carry
 * no economic value of any kind — and the backfill REFUSES to run unless the
 * two agree exactly. A row that is inert but not a V2 component, or a V2
 * component someone has since configured, stops this rather than being swept
 * along.
 *
 *   npx tsx prisma/backfill-contractor-labor-unknown-2026-09-11.ts            # report
 *   npx tsx prisma/backfill-contractor-labor-unknown-2026-09-11.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { ROUTING_V2_COMPONENTS } from "./seed-routing-v2-components";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\nCONTRACTOR LABOR — unknown is not zero  [${APPLY ? "APPLY" : "REPORT"}]\n`);

  const rows = await prisma.contractorComponent.findMany({
    select: {
      id: true, addFieldLaborHours: true, addMaterialCostCents: true,
      addScheduleMinutes: true, addTechCount: true, approvedPriceCents: true,
      contractor: { select: { slug: true } },
      canonicalComponent: { select: { key: true } },
    },
  });

  const v2Keys = new Set(ROUTING_V2_COMPONENTS.map((c) => c.key));
  const declaresLabor = new Set(
    ROUTING_V2_COMPONENTS.filter((c) => c.addFieldLaborHours !== undefined).map((c) => c.key)
  );
  if (declaresLabor.size > 0) {
    throw new Error(
      `Routing V2 components now declare labor (${[...declaresLabor].join(", ")}). ` +
        `This backfill assumes they do not; re-adjudicate before running it.`
    );
  }

  const inert = rows.filter(
    (r) => r.addFieldLaborHours === 0 && r.approvedPriceCents === null &&
           r.addMaterialCostCents === 0 && r.addScheduleMinutes === 0 && r.addTechCount === 0
  );
  const byV2 = rows.filter((r) => r.addFieldLaborHours === 0 && v2Keys.has(r.canonicalComponent.key));

  const inertKeys = new Set(inert.map((r) => r.canonicalComponent.key));
  const v2ZeroKeys = new Set(byV2.map((r) => r.canonicalComponent.key));
  const onlyInert = [...inertKeys].filter((k) => !v2ZeroKeys.has(k));
  const onlyV2 = [...v2ZeroKeys].filter((k) => !inertKeys.has(k));

  console.log(`  rows: ${rows.length}`);
  console.log(`    positive labor        : ${rows.filter((r) => (r.addFieldLaborHours ?? -1) > 0).length}`);
  console.log(`    already null          : ${rows.filter((r) => r.addFieldLaborHours === null).length}`);
  console.log(`    zero, inert           : ${inert.length}`);
  console.log(`    zero, a V2 component  : ${byV2.length}`);
  console.log(`    zero, carrying other economics (DELIBERATE — untouched): ${
    rows.filter((r) => r.addFieldLaborHours === 0 && !inertKeys.has(r.canonicalComponent.key)).length}`);

  if (onlyInert.length || onlyV2.length) {
    console.log(`\n  REFUSING: the two identifications disagree.`);
    if (onlyInert.length) console.log(`    inert but not a V2 component: ${onlyInert.join(", ")}`);
    if (onlyV2.length) console.log(`    V2 component but not inert:   ${onlyV2.join(", ")}`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`\n  the two identifications agree exactly on ${inert.length} rows:`);
  for (const r of inert) console.log(`    ${r.contractor?.slug}/${r.canonicalComponent.key}`);

  if (!APPLY) { console.log(`\n  Report only — nothing written.\n`); await prisma.$disconnect(); return; }

  const ids = inert.map((r) => r.id);
  const res = await prisma.contractorComponent.updateMany({
    where: { id: { in: ids }, addFieldLaborHours: 0 },
    data: { addFieldLaborHours: null },
  });
  console.log(`\n  ${res.count} row(s) set to null.`);

  const after = await prisma.contractorComponent.groupBy({
    by: ["addFieldLaborHours"], _count: true,
  }).catch(() => null);
  const nulls = await prisma.contractorComponent.count({ where: { addFieldLaborHours: null } });
  const zeros = await prisma.contractorComponent.count({ where: { addFieldLaborHours: 0 } });
  console.log(`  now: ${nulls} null (never established), ${zeros} explicit zero (deliberate).`);
  void after;
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
