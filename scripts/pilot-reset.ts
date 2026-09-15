/**
 * Reset a REHEARSAL contractor's first-service pilot to "catalog not installed".
 *
 *   npx tsx scripts/pilot-reset.ts --slug rv2-pilot-rehearsal-<name>            (dry run: shows what would go)
 *   npx tsx scripts/pilot-reset.ts --slug rv2-pilot-rehearsal-<name> --confirm  (does it)
 *
 * A CLI on purpose, not an admin endpoint: resetting is a rehearsal operation
 * run by the person rehearsing, and a destructive button in the product would
 * be one misclick from a real tenant. The eligibility rules live in
 * lib/electrical/pilotScope.ts and refuse Elite, BrightPath, any slug outside
 * the rehearsal allowlist, any contractor with a booking, and the stamped
 * production database. The connection string is never printed.
 */
import { PrismaClient } from "@prisma/client";
import { resetPilotContractor } from "../lib/electrical/pilotReset";
import { liveEndpointOf } from "../lib/electrical/pilotScope";

const prisma = new PrismaClient();
const argv = process.argv;
const slug = argv[argv.indexOf("--slug") + 1];
const confirm = argv.includes("--confirm");

async function main() {
  if (!slug || slug.startsWith("--") || argv.indexOf("--slug") < 0) throw new Error("usage: --slug <rehearsal-slug> [--confirm]");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const r = await resetPilotContractor(prisma, { slug, liveEndpoint: liveEndpointOf(url), dryRun: !confirm });
  if (!r.ok) {
    console.error(`\n  REFUSED (${r.refusal.code}): ${r.refusal.message}\n`);
    process.exitCode = 2;
    return;
  }
  console.log(`\n  ${r.dryRun ? "DRY RUN — nothing deleted" : "RESET DONE"} for ${slug}\n`);
  console.log(`  ${r.dryRun ? "Would remove" : "Removed"}:`);
  for (const [k, v] of Object.entries(r.counts)) console.log(`    ${String(v).padStart(4)}  ${k}`);
  console.log(`  Kept:`);
  for (const [k, v] of Object.entries(r.kept)) console.log(`    ${String(v).padStart(4)}  ${k}`);
  if (r.dryRun) console.log(`\n  Re-run with --confirm to reset.\n`);
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(String(e.message ?? e)); await prisma.$disconnect(); process.exit(1); });
