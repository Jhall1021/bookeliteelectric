/**
 * Retire one contractor's ContractorMaterial row for a canonical role.
 *
 * Deliberately separate from prisma/seed-materials.ts's own active-flag fix.
 * That fix makes the SEED's stated `active` correctly reach the CANONICAL
 * row for any contractor's shared seed. A contractor's own costed row is a
 * different, narrower decision — retiring the platform role doesn't by
 * itself mean every contractor's historical cost entry should disappear
 * from view the same way, and this repo's convention throughout Material
 * Catalog Phase 1C has been: a specific, reviewed retirement gets its own
 * narrow, explicit, dry-run/apply tool, not a blanket rule baked into a
 * broad pricing seed that runs across the whole catalog.
 *
 * SAFETY CHECKED, NOT ASSUMED. Before this tool existed, both cost-
 * resolution call sites that filter ContractorMaterial by `active: true`
 * (lib/catalogResolution.ts, lib/routeResolver.ts) were read directly: both
 * derive the role ids they look up from each service's OWN referenced
 * canonical materials, never from a static list. A role no ServiceMaterial
 * or component anywhere references — which DUCT_CONNECTOR is, confirmed by
 * direct query, 0 references — can never be looked up by either path, so
 * deactivating its ContractorMaterial row is inert to current resolution
 * behavior. This is not a general guarantee for every future retirement —
 * re-check before reusing this tool on a role that might still be
 * referenced somewhere.
 *
 * Preserves cost, notes and cost-confidence exactly — this retires
 * visibility/usability, not history. Never deletes the row.
 *
 *   npx tsx scripts/retire-contractor-material.ts --key DUCT_CONNECTOR --contractor elite-electric
 *   npx tsx scripts/retire-contractor-material.ts --key DUCT_CONNECTOR --contractor elite-electric --apply
 *
 * NEVER run --apply against DATABASE_URL pointed at production without
 * explicit approval for THIS specific write. This script has no production
 * guard of its own — the human running it is the guard.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const key = arg("key");
  const contractorSlug = arg("contractor");
  if (!key || !contractorSlug) {
    console.error("Usage: retire-contractor-material.ts --key <CANONICAL_KEY> --contractor <SLUG> [--apply]");
    process.exit(1);
  }

  console.log(`\nRETIRE CONTRACTOR MATERIAL   ${key} / ${contractorSlug}   ${APPLY ? "APPLY" : "DRY RUN (--apply to write)"}\n`);

  const canonical = await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key } });
  if (canonical.active) {
    console.log(`  NOTE: canonical role ${key} is still active=true. This tool only retires the`);
    console.log(`  contractor's own row — run the (fixed) seed to retire the canonical role first.\n`);
  }

  const contractor = await prisma.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true, slug: true } });
  const row = await prisma.contractorMaterial.findUnique({
    where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: canonical.id } },
  });
  if (!row) { console.log(`  no ContractorMaterial row for ${key}/${contractorSlug} — nothing to do.\n`); return; }

  console.log(`  current   active=${row.active}  unitCostCents=${row.unitCostCents}  costConfidence=${row.costConfidence}`);
  console.log(`  notes     ${row.notes ?? "(none)"}`);

  if (row.active === false) { console.log(`\n  already inactive — nothing to do.\n`); return; }

  if (!APPLY) {
    console.log(`\n  would set active=false — unitCostCents, notes, costConfidence unchanged\n`);
    return;
  }

  await prisma.contractorMaterial.update({
    where: { id: row.id },
    data: { active: false }, // cost/notes/costConfidence untouched — retiring visibility, not history
  });
  console.log(`\n  RETIRED — active=false. unitCostCents (${row.unitCostCents}) and notes preserved.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
