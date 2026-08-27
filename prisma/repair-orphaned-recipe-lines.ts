/**
 * Repair recipe lines with no canonical material role.
 *
 *   npx tsx prisma/repair-orphaned-recipe-lines.ts            (report)
 *   npx tsx prisma/repair-orphaned-recipe-lines.ts --apply    (write)
 *
 * WHAT HAPPENED
 *
 * Two seeds — seed-exterior-gfci-routing.ts and
 * seed-low-voltage-and-sconces.ts — carried their own `attachMaterials` that
 * still wrote `materialId` against the deprecated Material model. The
 * component switch checked those files for component writes and missed the
 * material ones, so re-running them replaced good canonical links with rows
 * pointing only at the old model.
 *
 * `assessMaterialReadiness` refused to price them, which is the fail-closed
 * guard working: a recipe line with no role must not price as though the
 * material were free. It threw rather than producing a wrong number.
 *
 * WHAT THIS DOES
 *
 * Sets `canonicalMaterialId` on any row that has a `materialId` but no role,
 * matching on the material's key. The seeds are fixed too, so this is a
 * one-time repair of rows already written rather than an ongoing bridge.
 *
 * Nothing is deleted and no price is touched. A row that cannot be matched is
 * reported and left alone — a recipe line nobody can resolve should stay
 * visible rather than being quietly dropped.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nREPAIR — recipe lines with no canonical role`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  const orphans = await prisma.serviceMaterial.findMany({
    where: { canonicalMaterialId: null },
    select: {
      id: true,
      materialId: true,
      quantity: true,
      service: { select: { slug: true } },
      material: { select: { key: true, name: true } },
    },
  });

  if (orphans.length === 0) {
    console.log(`  Nothing to repair — every recipe line has a role.\n`);
    return;
  }

  // A row with no materialId either cannot be matched at all.
  const unmatchable = orphans.filter((o) => !o.material);
  const matchable = orphans.filter((o) => o.material);

  const byService = new Map<string, number>();
  for (const o of orphans) {
    byService.set(o.service.slug, (byService.get(o.service.slug) ?? 0) + 1);
  }

  console.log(`  ${orphans.length} orphaned line(s) across ${byService.size} service(s):\n`);
  for (const [slug, n] of byService) console.log(`      ${slug.padEnd(34)} ${n}`);

  console.log(`\n  ${matchable.length} can be matched by material key`);
  if (unmatchable.length) {
    console.log(`  ${unmatchable.length} have no material at all and will be LEFT ALONE`);
  }

  // Every key needs a canonical role to point at. Missing ones are reported
  // rather than created: inventing a role here would be guessing at what the
  // recipe meant.
  const keys = [...new Set(matchable.map((o) => o.material!.key))];
  const canonicals = await prisma.canonicalMaterial.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true },
  });
  const idByKey = new Map(canonicals.map((c) => [c.key, c.id]));

  const missing = keys.filter((k) => !idByKey.has(k));
  if (missing.length) {
    console.error(`\n  STOPPING — no canonical role exists for: ${missing.join(", ")}`);
    console.error(`  Run prisma/seed-materials.ts first.\n`);
    process.exit(1);
    return;
  }

  if (!apply) {
    console.log(`\n  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  let repaired = 0;
  for (const o of matchable) {
    await prisma.serviceMaterial.update({
      where: { id: o.id },
      data: { canonicalMaterialId: idByKey.get(o.material!.key)! },
    });
    repaired++;
  }

  const remaining = await prisma.serviceMaterial.count({
    where: { canonicalMaterialId: null },
  });

  console.log(`\n  REPAIRED — read back from the database:\n`);
  console.log(`      lines repaired   ${repaired}`);
  console.log(`      still orphaned   ${remaining}`);

  if (remaining > 0) {
    console.error(
      `\n  Some lines still have no role. Those services cannot be priced\n` +
        `  until they do — the guard will keep refusing them.\n`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  No price was touched. The affected services now resolve again.`);
  console.log(`  Next: re-run the two fixed seeds, then npm run db:reconcile.\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
