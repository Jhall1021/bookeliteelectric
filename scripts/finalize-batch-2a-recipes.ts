/**
 * Material Catalog Batch 2A — finalize the extracted v4 recipes.
 *
 * WHY THIS EXISTS, SEPARATE FROM THE EXTRACTOR
 *
 * scripts/extract-template-service.ts classifies a material line as policy
 * with one rule: `/WIRE|CONSUMABLE|CABLE/i.test(key)`. That rule happened to
 * be right for every Batch 1 service by coincidence of naming. It is
 * DEMONSTRABLY WRONG for Batch 2A: BREAKER_SINGLE_POLE and
 * BREAKER_DOUBLE_POLE match neither pattern, so the extractor keeps Elite's
 * exact counts (17, 3) as "structural" — fixed, universal, canonicalized.
 *
 * That is precisely the leak this batch's own instructions warn against.
 * Direct evidence, not inference: on BOTH services, the "how many breakers
 * are in the panel now" question has ONLY PHOTO_REVIEW outcomes — standard,
 * many_circuits and unsure_circuits all route to review, none to CONTINUE.
 * A quantity that never reaches an automated path is not a physical fact
 * about the job; it is Elite's own starting assumption for pricing a job a
 * human will price anyway. Confirmed directly against
 * services/questions/answer_options for both services before writing this.
 *
 * GROUND_CLAMP is corrected the same way, more cautiously: clamp count
 * depends on how many bonding points a given house needs (rod-to-rod jumper,
 * water-pipe bond, panel bond), which nothing in either question tree
 * establishes. Not proven wrong the way breaker count is proven wrong, but
 * not proven invariant either — moved to policy rather than guessed either
 * direction.
 *
 * GROUND_ROD stays structural (2, matching the role's own "Two are
 * standard" note) ONLY on 200a-service-upgrade: a service upgrade
 * re-establishes the grounding electrode system as part of the new service,
 * which is not true of a like-for-like panel swap.
 *
 * electrical-panel-replacement's entire grounding line (GROUND_ROD,
 * GROUND_CLAMP, WIRE_GROUND_6) is REMOVED from the template recipe here,
 * not reclassified. Whether a straight panel swap touches grounding at all
 * depends on whether the EXISTING grounding electrode system already meets
 * code — a fact this service's question tree does not currently ask.
 * Forcing a number here, fixed or policy, would assume physical work that
 * may not be needed. This is the gap PART 3 asked to be reported rather
 * than resolved: the safe answer today is "not represented", not a guess.
 *
 * WHAT THIS ADDS
 *
 * Three new canonical roles for 200a-service-upgrade's riser/mast/weatherhead
 * gap — confirmed missing from the 74-role catalog by direct query, and
 * confirmed physically required by 2026 National Electrical Estimator
 * Section 6 ("conduit to a service entrance cap which receives lines from
 * an overhead distribution system") and the existing question tree's own
 * `riser_wall` gate (masonry/roof routed to review; standard wall continues
 * — proving the riser IS part of the guided-path physical scope, not an
 * edge case). CONDUIT_PVC_1/CONDUIT_FITTINGS_1 are NOT reused: those are
 * explicitly PVC, and a load-bearing service mast is standard/code practice
 * in rigid metal conduit, a different product entirely — reusing the PVC
 * role would misrepresent what the job actually needs.
 *
 *   SERVICE_ENTRANCE_CAP_200A   the weatherhead itself — each, structural (1)
 *   SERVICE_MAST_CONDUIT_200A  rigid riser conduit — ft, POLICY (mast height
 *                               varies by house/roofline; the tree bounds
 *                               wall TYPE, never mast LENGTH)
 *   SERVICE_MAST_FITTINGS_200A bundled entrance elbow/straps/bushing for one
 *                               mast assembly — set, structural (1), same
 *                               "one set per run" precedent as
 *                               CONDUIT_FITTINGS_1
 *
 *   npx tsx scripts/finalize-batch-2a-recipes.ts            dry run
 *   npx tsx scripts/finalize-batch-2a-recipes.ts --apply    apply
 *
 * NEVER run --apply against DATABASE_URL pointed at production. This script
 * has no production guard of its own — the human running it is the guard,
 * exactly per this batch's own required sequencing (branch -> audit ->
 * verification -> review -> explicit approval -> controlled production
 * mutation). This run targets the rehearsal branch only.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const NEW_ROLES: { key: string; name: string; unit: string; notes: string }[] = [
  { key: "SERVICE_ENTRANCE_CAP_200A", name: "200A service entrance cap (weatherhead)", unit: "each",
    notes: "Terminates the service mast and receives the utility's overhead drop. Sized to the 200A mast, matching METER_SOCKET_200A's own naming convention." },
  { key: "SERVICE_MAST_CONDUIT_200A", name: "200A rigid service mast conduit", unit: "ft",
    notes: "Rigid metal conduit for the load-bearing service riser — NOT CONDUIT_PVC_1, a different product for a different purpose. Standard practice for a service mast supporting the utility drop attachment." },
  { key: "SERVICE_MAST_FITTINGS_200A", name: "200A service mast fittings set", unit: "set",
    notes: "Entrance elbow, mast straps/clamps and bushing for one mast assembly — bundled as a set, same convention as CONDUIT_FITTINGS_1." },
];

const POLICY_CORRECTIONS = [
  { service: "200a-service-upgrade", keys: ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE", "GROUND_CLAMP"] },
  { service: "electrical-panel-replacement", keys: ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE"] },
];

const REMOVE_ENTIRELY = [
  { service: "electrical-panel-replacement", keys: ["GROUND_ROD", "GROUND_CLAMP", "WIRE_GROUND_6"] },
];

const NEW_LINES_200A: { key: string; quantity: number | null; quantityIsPolicy: boolean }[] = [
  { key: "SERVICE_ENTRANCE_CAP_200A", quantity: 1, quantityIsPolicy: false },
  { key: "SERVICE_MAST_CONDUIT_200A", quantity: null, quantityIsPolicy: true },
  { key: "SERVICE_MAST_FITTINGS_200A", quantity: 1, quantityIsPolicy: false },
];

async function templateServiceId(key: string, version: number): Promise<string> {
  const row = await prisma.templateService.findFirstOrThrow({
    where: { key, templateVersion: { trade: "electrical", version } },
    select: { id: true },
  });
  return row.id;
}

async function main() {
  console.log(`\nBATCH 2A — finalize v4 recipes   ${APPLY ? "APPLY" : "DRY RUN (--apply to write)"}\n`);

  console.log("  NEW CANONICAL ROLES");
  for (const r of NEW_ROLES) {
    const existing = await prisma.canonicalMaterial.findUnique({ where: { key: r.key } });
    if (existing) { console.log(`    present  ${r.key}`); continue; }
    if (!APPLY) { console.log(`    would    CREATE ${r.key}  (${r.unit})`); continue; }
    await prisma.canonicalMaterial.create({ data: { key: r.key, name: r.name, unit: r.unit, notes: r.notes } });
    console.log(`    CREATED  ${r.key}`);
  }

  console.log("\n  POLICY CORRECTIONS (extractor's WIRE|CONSUMABLE|CABLE regex missed these)");
  for (const { service, keys } of POLICY_CORRECTIONS) {
    const tsId = await templateServiceId(service, 4);
    for (const key of keys) {
      const cm = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key }, select: { id: true } });
      const line = await prisma.templateServiceMaterial.findUnique({
        where: { templateServiceId_canonicalMaterialId: { templateServiceId: tsId, canonicalMaterialId: cm.id } },
      });
      if (!line) { console.log(`    SKIP  ${service}/${key} — no such line`); continue; }
      if (line.quantityIsPolicy) { console.log(`    already policy  ${service}/${key}`); continue; }
      if (!APPLY) { console.log(`    would convert to policy  ${service}/${key} (was ${line.quantity})`); continue; }
      await prisma.templateServiceMaterial.update({
        where: { id: line.id }, data: { quantity: null, quantityIsPolicy: true },
      });
      console.log(`    CONVERTED to policy  ${service}/${key} (was ${line.quantity})`);
    }
  }

  console.log("\n  REMOVED ENTIRELY (existing-condition dependent — not safely represented either way)");
  for (const { service, keys } of REMOVE_ENTIRELY) {
    const tsId = await templateServiceId(service, 4);
    for (const key of keys) {
      const cm = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key }, select: { id: true } });
      const line = await prisma.templateServiceMaterial.findUnique({
        where: { templateServiceId_canonicalMaterialId: { templateServiceId: tsId, canonicalMaterialId: cm.id } },
      });
      if (!line) { console.log(`    already absent  ${service}/${key}`); continue; }
      if (!APPLY) { console.log(`    would REMOVE  ${service}/${key} (was quantity ${line.quantity})`); continue; }
      await prisma.templateServiceMaterial.delete({ where: { id: line.id } });
      console.log(`    REMOVED  ${service}/${key}`);
    }
  }

  console.log("\n  NEW LINES — 200a-service-upgrade riser/mast/weatherhead");
  {
    const tsId = await templateServiceId("200a-service-upgrade", 4);
    const currentMax = await prisma.templateServiceMaterial.aggregate({
      where: { templateServiceId: tsId }, _max: { order: true },
    });
    let order = (currentMax._max.order ?? -1) + 1;
    for (const l of NEW_LINES_200A) {
      const cm = await prisma.canonicalMaterial.findUnique({ where: { key: l.key }, select: { id: true } });
      if (!cm) { console.log(`    SKIP  ${l.key} — role not created yet (run --apply first for roles)`); continue; }
      const existing = await prisma.templateServiceMaterial.findUnique({
        where: { templateServiceId_canonicalMaterialId: { templateServiceId: tsId, canonicalMaterialId: cm.id } },
      });
      if (existing) { console.log(`    already present  ${l.key}`); continue; }
      if (!APPLY) { console.log(`    would ADD  ${l.key}  quantity=${l.quantity} policy=${l.quantityIsPolicy}`); continue; }
      await prisma.templateServiceMaterial.create({
        data: { templateServiceId: tsId, canonicalMaterialId: cm.id, quantity: l.quantity, quantityIsPolicy: l.quantityIsPolicy, order: order++ },
      });
      console.log(`    ADDED  ${l.key}  quantity=${l.quantity} policy=${l.quantityIsPolicy}`);
    }
  }

  console.log("\n" + "─".repeat(76));
  console.log(APPLY ? "\n  Applied.\n" : "\n  Dry run — nothing written.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
