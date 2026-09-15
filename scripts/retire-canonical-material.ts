/**
 * Retire one CanonicalMaterial role — platform-level, not contractor-level.
 *
 * Deliberately narrow. prisma/seed-materials.ts's own active-field bug is
 * fixed generically (any MATERIALS entry's declared `active` now actually
 * persists), but re-running that seed to retire a single role means
 * traversing and recomputing every itemized service's material cost for
 * whichever contractor owns the seed — a much larger write surface than
 * "flip one role's active flag". This tool does exactly the one thing:
 * looks up a CanonicalMaterial by key, and if it's still active, sets
 * active=false. Nothing else on the row changes, and no ContractorMaterial,
 * ServiceMaterial, or Service row is touched — see
 * scripts/retire-contractor-material.ts for the separate, narrower decision
 * of retiring one contractor's own costed row for the same role.
 *
 *   npx tsx scripts/retire-canonical-material.ts --key DUCT_CONNECTOR
 *   npx tsx scripts/retire-canonical-material.ts --key DUCT_CONNECTOR --apply
 *
 * Fails loudly if the key doesn't exist — retiring a role that isn't there
 * is never silently a no-op. Idempotent: already-inactive reports and exits
 * cleanly without writing again.
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
  if (!key) {
    console.error("Usage: retire-canonical-material.ts --key <CANONICAL_KEY> [--apply]");
    process.exit(1);
  }

  console.log(`\nRETIRE CANONICAL MATERIAL   ${key}   ${APPLY ? "APPLY" : "DRY RUN (--apply to write)"}\n`);

  const row = await prisma.canonicalMaterial.findUnique({ where: { key } });
  if (!row) {
    console.error(`  REFUSING: no CanonicalMaterial with key "${key}" — nothing to retire.\n`);
    process.exit(1);
  }

  console.log(`  current   active=${row.active}  name=${row.name}  unit=${row.unit}`);
  console.log(`  notes     ${row.notes ?? "(none)"}`);

  if (row.active === false) { console.log(`\n  already inactive — nothing to do.\n`); return; }

  if (!APPLY) {
    console.log(`\n  would set active=false — id/key/name/unit/notes unchanged\n`);
    return;
  }

  await prisma.canonicalMaterial.update({
    where: { id: row.id },
    data: { active: false }, // name/unit/notes untouched — nothing else on this row changes
  });
  console.log(`\n  RETIRED — active=false. name/unit/notes preserved.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
