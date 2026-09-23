/**
 * Select or activate TV Installation on the designated manual rehearsal
 * contractor. Selection and activation remain separate so atomic duration and
 * price approval can occur between them through their normal authorities.
 *
 *   npx tsx scripts/advance-electrical-rehearsal-tv-installation-2026-09-23.ts --select [--apply]
 *   npx tsx scripts/advance-electrical-rehearsal-tv-installation-2026-09-23.ts --activate [--apply]
 */
import { PrismaClient } from "@prisma/client";
import { activateService, activationRefusal } from "../lib/serviceActivation";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";
const SERVICE = "tv-installation";

async function main() {
  const select = process.argv.includes("--select");
  const activate = process.argv.includes("--activate");
  const apply = process.argv.includes("--apply");
  if (select === activate) throw new Error("choose exactly one of --select or --activate");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({ where: { slug: EXPECTED_CONTRACTOR }, select: { id: true } });
    if (!contractor) throw new Error(`${EXPECTED_CONTRACTOR} does not exist`);
    const service = await db.service.findFirst({
      where: { contractorId: contractor.id, slug: SERVICE },
      select: { id: true, offered: true, active: true },
    });
    if (!service) throw new Error(`${SERVICE} is not installed`);
    console.log(`\nTV INSTALLATION REHEARSAL — ${select ? "SELECT" : "ACTIVATE"} ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${EXPECTED_CONTRACTOR}`);
    console.log(`  current: offered=${service.offered}, active=${service.active}\n`);

    if (select) {
      if (service.offered) { console.log("  already selected; no change\n"); return; }
      if (!apply) { console.log("  would select tv-installation; no price or activation is implied\n"); return; }
      await db.service.update({ where: { id: service.id }, data: { offered: true } });
      console.log("  selected tv-installation; price and activation remain unchanged\n");
      return;
    }

    const refusal = await activationRefusal(db, contractor.id, service.id);
    if (refusal) throw new Error(`activation refused: ${refusal.code} — ${refusal.message}`);
    if (service.active) { console.log("  already active; no change\n"); return; }
    if (!apply) { console.log("  activation checks passed; would activate tv-installation\n"); return; }
    const result = await activateService(db, contractor.id, service.id);
    if (!result.ok) throw new Error(`activation refused: ${result.refusal.code} — ${result.refusal.message}`);
    console.log("  activated tv-installation through the shared activation authority\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
