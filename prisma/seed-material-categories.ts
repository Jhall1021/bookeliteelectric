/**
 * Stamp the display category onto every canonical material.
 *
 * Idempotent and re-runnable. Writes ONLY `displayCategory`; a category is
 * presentation, so this seed must never touch a key, a name, a unit or a cost.
 */
import { PrismaClient } from "@prisma/client";
import { categoryForKey } from "../lib/materialCategories";

const prisma = new PrismaClient();

export async function seedMaterialCategories(db: PrismaClient = prisma) {
  const roles = await db.canonicalMaterial.findMany({ select: { id: true, key: true, displayCategory: true } });
  const counts = new Map<string, number>();
  let updated = 0;
  for (const r of roles) {
    const category = categoryForKey(r.key);
    counts.set(category, (counts.get(category) ?? 0) + 1);
    if (r.displayCategory === category) continue;
    await db.canonicalMaterial.update({ where: { id: r.id }, data: { displayCategory: category } });
    updated++;
  }
  return { total: roles.length, updated, counts: [...counts.entries()].sort() };
}

if (process.argv[1] && process.argv[1].endsWith("seed-material-categories.ts")) {
  seedMaterialCategories()
    .then(async (r) => {
      console.log(`\n  ${r.total} roles, ${r.updated} categorised`);
      for (const [c, n] of r.counts) console.log(`    ${String(n).padStart(3)}  ${c}`);
      console.log();
      await prisma.$disconnect();
    })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
