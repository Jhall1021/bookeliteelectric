/**
 * Move the stored theme choice from a key to family + variant + version.
 *
 * `themeKey` encoded the family and variant in a string, which meant the
 * selector would have had to parse a key apart to persist what the contractor
 * actually chose. Family, variant and version are the identity now, and the
 * key is derived for display.
 *
 * Runs BEFORE the column drop. Reads the old column by raw SQL so it does not
 * depend on a generated client that no longer knows about it.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();

/** The one legacy key that is not `family-variant`. */
const RENAMED: Record<string, { family: string; variant: string }> = {
  "elite-baseline": { family: "baseline", variant: "a" },
};

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await prisma.$queryRawUnsafe<{ id: string; slug: string; themeKey: string; themeVersion: number }[]>(
    `SELECT id, slug, "themeKey", "themeVersion" FROM contractors`);

  console.log(`\nTHEME CHOICE MIGRATION   ${apply ? "APPLY" : "DRY RUN"}\n`);
  for (const r of rows) {
    const mapped = RENAMED[r.themeKey];
    let family: string, variant: string;
    if (mapped) {
      ({ family, variant } = mapped);
    } else {
      const dash = r.themeKey.lastIndexOf("-");
      // A key with no separator cannot be split into a family and a variant,
      // and guessing would silently repoint a storefront at another design.
      if (dash <= 0) throw new Error(`Cannot split themeKey "${r.themeKey}" for ${r.slug}.`);
      family = r.themeKey.slice(0, dash);
      variant = r.themeKey.slice(dash + 1);
    }
    console.log(`  ${r.slug.padEnd(24)} ${r.themeKey}  ->  ${family} / ${variant} / v${r.themeVersion}`);
    if (apply) {
      await prisma.$executeRawUnsafe(
        `UPDATE contractors SET "themeFamily" = $1, "themeVariant" = $2 WHERE id = $3`,
        family, variant, r.id);
    }
  }
  console.log(apply ? `\n  Written.\n` : `\n  Dry run — pass --apply.\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(`\n  ${(e as Error).message}\n`); await prisma.$disconnect(); process.exit(1); });
}
