/**
 * Rename the labor rate to say what it means — ADR-018.
 *
 * `targetRateCents` was documented as "revenue per productive tech-hour" while
 * the engine has always charged CREW-hours. The comment and the code said
 * opposite things, and the code was right. That ambiguity had already produced
 * one defect, and it becomes customer-facing under TIME_AND_MATERIALS.
 *
 * A pure rename: the VALUE is unchanged, because the engine's behavior was
 * never wrong. Nothing about any published price moves.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await prisma.$queryRawUnsafe<
    { id: string; slug: string; targetRateCents: number; crewHourRateCents: number | null }[]
  >(`SELECT ps.id, c.slug, ps."targetRateCents", ps."crewHourRateCents"
       FROM pricing_settings ps JOIN contractors c ON c.id = ps."contractorId"`);

  console.log(`\nCREW-HOUR RATE MIGRATION   ${apply ? "APPLY" : "DRY RUN"}\n`);
  let toWrite = 0;
  for (const r of rows) {
    if (r.crewHourRateCents !== null) {
      // Never overwrite. A value already there was set deliberately.
      console.log(`  keep  ${r.slug.padEnd(24)} crewHourRateCents=${r.crewHourRateCents}`);
      continue;
    }
    console.log(`  copy  ${r.slug.padEnd(24)} ${r.targetRateCents} -> crewHourRateCents (value unchanged)`);
    toWrite++;
    if (apply) {
      await prisma.$executeRawUnsafe(
        `UPDATE pricing_settings SET "crewHourRateCents" = $1 WHERE id = $2`, r.targetRateCents, r.id);
    }
  }
  if (!rows.length) console.log("  No pricing settings rows.");
  console.log(apply ? `\n  ${toWrite} written.\n` : `\n  Dry run — pass --apply.\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
