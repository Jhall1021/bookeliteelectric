/**
 * Refuse to rehearse anywhere that has not been PROVED safe.
 *
 *   npx tsx scripts/verify-rehearsal-target.ts                 # checks REHEARSAL_DATABASE_URL
 *   npx tsx scripts/verify-rehearsal-target.ts --url "postgres://..."
 *
 * Exits 0 only for a branch of the current production lineage that is not
 * production itself. Everything else — the archive, an unrelated database, an
 * unmarked one, production, or one whose lineage cannot be read — exits 1.
 *
 * Replaces a hostname denylist that had been wrong since the 28 August
 * cutover. See scripts/_lineage.ts for why lineage is the right question.
 */
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { classifyRehearsalTarget } from "./_lineage";

loadEnv();
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const url = arg("url") ?? process.env.REHEARSAL_DATABASE_URL;
  console.log(`\nREHEARSAL TARGET\n`);
  if (!url) {
    console.error(`  REFUSING: no target given.\n\n` +
      `  Pass --url, or set REHEARSAL_DATABASE_URL to a Neon branch of production.\n`);
    process.exit(1);
  }
  const v = await classifyRehearsalTarget(url, process.env.DATABASE_URL);
  console.log(`  endpoint : ${v.probe.endpoint}`);
  console.log(`  lineage  : ${v.probe.lineage ?? "unreadable"}`);
  console.log(`  marker   : ${v.probe.markerKey ?? "none"}${v.probe.markerEndpoint ? ` (stamped for ${v.probe.markerEndpoint})` : ""}\n`);
  if (!v.ok) { console.error(`  REFUSING (${v.code}): ${v.reason}\n`); process.exit(1); }
  console.log(`  ACCEPTED: ${v.reason}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => { console.error(`\n  ${(e as Error).message}\n`); process.exit(1); });
