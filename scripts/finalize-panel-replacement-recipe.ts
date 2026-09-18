/**
 * electrical-panel-replacement's intended recipe — a narrow correction
 * applied AFTER extraction, against this branch's own consolidated v1
 * template snapshot.
 *
 * NOT a run of the historical scripts/finalize-batch-2a-recipes.ts, and NOT
 * a merge of feat/material-batch-2a-panel-service-upgrade (that branch is
 * unmerged and 439 files stale against main — see docs/design/electrical-
 * v1-v2-release-manifest.md). This is the same REVIEWED correction,
 * re-expressed against this branch's own template versioning: the source
 * evidence is that branch's own tip commit's two added, narrowly-scoped
 * files (scripts/finalize-batch-2a-recipes.ts,
 * scripts/verify-material-batch-2a.ts, commit
 * a31d7dc2ae7b853b60656e01aa4a57d66c443e7e), read directly, never executed
 * or merged.
 *
 * WHY A CORRECTION AFTER EXTRACTION, NOT A SEED CHANGE
 *
 * prisma/seed-panel-replacement.ts writes Elite's real, current recipe —
 * BREAKER_SINGLE_POLE x17, BREAKER_DOUBLE_POLE x3, and those ARE Elite's
 * real panel. scripts/extract-template-catalog.ts's own policy-quantity
 * heuristic (extract-template-service.ts: `/WIRE|CONSUMABLE|CABLE/i`) does
 * not match either key, so both extract as fixed, universal, structural
 * counts — exactly the leak this correction exists to catch.
 * CONSUMABLES_MEDIUM matches the regex and already extracts correctly as
 * policy; it needs no correction here.
 *
 * Direct evidence for why the breaker counts are policy, not physical fact:
 * electrical-panel-replacement's own "how many breakers are in the panel
 * now" question (panel_circuits, prisma/seed-panel-replacement.ts) has ONLY
 * PHOTO_REVIEW outcomes — standard, many_circuits and unsure_circuits all
 * route to review, none to CONTINUE. A quantity that never reaches an
 * automated path is not a physical fact about the job; it is Elite's own
 * starting assumption for pricing a job a human prices anyway.
 *
 * GROUND_ROD, GROUND_CLAMP and WIRE_GROUND_6 are REMOVED entirely, not
 * reclassified. Whether a straight panel swap touches grounding at all
 * depends on whether the EXISTING grounding electrode system already meets
 * code — a fact this service's question tree does not ask. quantityIsPolicy
 * means presence is certain and only the AMOUNT is a contractor allowance;
 * it does not mean "might not apply at all". The honest answer is "not
 * represented", not a guess either direction — so no assumed
 * grounding-electrode or service-entrance work is added.
 *
 * 200A service-upgrade is untouched and stays deferred whole — this script
 * never references it.
 *
 *   npx tsx scripts/finalize-panel-replacement-recipe.ts            dry run
 *   npx tsx scripts/finalize-panel-replacement-recipe.ts --apply    apply
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const SERVICE_KEY = "electrical-panel-replacement";
const TRADE = "electrical";

const POLICY_CORRECTIONS = ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE"];
const REMOVE_ENTIRELY = ["GROUND_ROD", "GROUND_CLAMP", "WIRE_GROUND_6"];

async function templateServiceId(): Promise<string> {
  // The latest version for this trade — this run's own consolidated v1
  // snapshot, whatever version number extraction just created it as. Never
  // a hardcoded version number: this correction runs once, right after
  // extraction, against whatever this run built.
  const version = await prisma.templateVersion.findFirstOrThrow({
    where: { trade: TRADE }, orderBy: { version: "desc" }, select: { id: true, version: true },
  });
  const row = await prisma.templateService.findFirstOrThrow({
    where: { key: SERVICE_KEY, templateVersionId: version.id }, select: { id: true },
  });
  return row.id;
}

async function main() {
  console.log(`\nPANEL-REPLACEMENT RECIPE — intended final scope   ${APPLY ? "APPLY" : "DRY RUN (--apply to write)"}\n`);

  const tsId = await templateServiceId();

  console.log("  POLICY CORRECTIONS (extractor's WIRE|CONSUMABLE|CABLE regex misses these)");
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
