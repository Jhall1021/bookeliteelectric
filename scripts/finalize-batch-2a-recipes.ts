/**
 * Material Catalog Batch 2A — finalize the v4 recipe. FINAL SCOPE.
 *
 * electrical-panel-replacement ONLY. 200a-service-upgrade is deferred whole:
 * its mast-conductor material requirement is physically known but cannot be
 * represented truthfully in the current one-role/one-purchased-product
 * material model without either inventing a fake composite material or
 * introducing the (reserved, unmerged) conductor-requirement architecture.
 * Neither is acceptable here, so 200A does not ship in this release at all —
 * not partially, not with a gap. No 200A CanonicalMaterial rows, no 200A
 * TemplateService write, nothing. This file used to also carry a 200A
 * correction pass; that entire section is removed, not disabled.
 *
 * WHY THIS EXISTS, SEPARATE FROM THE EXTRACTOR
 *
 * scripts/extract-template-service.ts classifies a material line as policy
 * with one rule: `/WIRE|CONSUMABLE|CABLE/i.test(key)`. BREAKER_SINGLE_POLE
 * and BREAKER_DOUBLE_POLE match neither pattern, so the extractor keeps
 * Elite's exact counts (17, 3) as "structural" — fixed, universal,
 * canonicalized. That is precisely the leak this batch's instructions warn
 * against. Direct evidence: on electrical-panel-replacement, the "how many
 * breakers are in the panel now" question (panel_circuits) has ONLY
 * PHOTO_REVIEW outcomes — standard, many_circuits and unsure_circuits all
 * route to review, none to CONTINUE. A quantity that never reaches an
 * automated path is not a physical fact about the job; it is Elite's own
 * starting assumption for pricing a job a human will price anyway.
 *
 * GROUND_ROD, GROUND_CLAMP and WIRE_GROUND_6 are REMOVED entirely, not
 * reclassified. Whether a straight panel swap touches grounding at all
 * depends on whether the EXISTING grounding electrode system already meets
 * code — a fact this service's question tree does not ask. Forcing a
 * number here, fixed or policy, would assume physical work that may not be
 * needed. quantityIsPolicy means presence is certain and only the AMOUNT is
 * a contractor allowance; it does not mean "might not apply at all". The
 * honest answer today is "not represented", not a guess either direction.
 *
 *   npx tsx scripts/finalize-batch-2a-recipes.ts            dry run
 *   npx tsx scripts/finalize-batch-2a-recipes.ts --apply    apply
 *
 * NEVER run --apply against DATABASE_URL pointed at production. This script
 * has no production guard of its own — the human running it is the guard,
 * per this batch's required sequencing (branch -> corrected implementation
 * -> rehearsal -> verification -> review -> explicit approval -> controlled
 * production mutation). This run targets the rehearsal branch only.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const SERVICE_KEY = "electrical-panel-replacement";
const TEMPLATE_VERSION = 4;

const POLICY_CORRECTIONS = ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE"];
const REMOVE_ENTIRELY = ["GROUND_ROD", "GROUND_CLAMP", "WIRE_GROUND_6"];

async function templateServiceId(): Promise<string> {
  const row = await prisma.templateService.findFirstOrThrow({
    where: { key: SERVICE_KEY, templateVersion: { trade: "electrical", version: TEMPLATE_VERSION } },
    select: { id: true },
  });
  return row.id;
}

async function main() {
  console.log(`\nBATCH 2A — finalize v4 recipe (electrical-panel-replacement only)   ${APPLY ? "APPLY" : "DRY RUN (--apply to write)"}\n`);

  const tsId = await templateServiceId();

  console.log("  POLICY CORRECTIONS (extractor's WIRE|CONSUMABLE|CABLE regex missed these)");
  for (const key of POLICY_CORRECTIONS) {
    const cm = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key }, select: { id: true } });
    const line = await prisma.templateServiceMaterial.findUnique({
      where: { templateServiceId_canonicalMaterialId: { templateServiceId: tsId, canonicalMaterialId: cm.id } },
    });
    if (!line) { console.log(`    SKIP  ${key} — no such line`); continue; }
    if (line.quantityIsPolicy) { console.log(`    already policy  ${key}`); continue; }
    if (!APPLY) { console.log(`    would convert to policy  ${key} (was ${line.quantity})`); continue; }
    await prisma.templateServiceMaterial.update({
      where: { id: line.id }, data: { quantity: null, quantityIsPolicy: true },
    });
    console.log(`    CONVERTED to policy  ${key} (was ${line.quantity})`);
  }

  console.log("\n  REMOVED ENTIRELY (existing-condition dependent — not safely represented either way)");
  for (const key of REMOVE_ENTIRELY) {
    const cm = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key }, select: { id: true } });
    const line = await prisma.templateServiceMaterial.findUnique({
      where: { templateServiceId_canonicalMaterialId: { templateServiceId: tsId, canonicalMaterialId: cm.id } },
    });
    if (!line) { console.log(`    already absent  ${key}`); continue; }
    if (!APPLY) { console.log(`    would REMOVE  ${key} (was quantity ${line.quantity})`); continue; }
    await prisma.templateServiceMaterial.delete({ where: { id: line.id } });
    console.log(`    REMOVED  ${key}`);
  }

  console.log("\n" + "─".repeat(76));
  console.log(APPLY ? "\n  Applied.\n" : "\n  Dry run — nothing written.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
