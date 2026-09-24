/**
 * Report or activate every offered service that passes the ordinary activation
 * authority for one explicitly named disposable Electrical rehearsal tenant.
 * Closed reciprocal dependency groups remain refused here and are handled by
 * their separately reviewed atomic activation scripts.
 */
import { PrismaClient } from "@prisma/client";
import { isRehearsalSlug } from "../lib/electrical/pilotScope";
import { activateService, activationRefusal } from "../lib/serviceActivation";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";

const contractorIndex = process.argv.indexOf("--contractor");
const contractorSlug = contractorIndex >= 0 ? process.argv[contractorIndex + 1] : undefined;

async function main() {
  const apply = process.argv.includes("--apply");
  const summaryOnly = process.argv.includes("--summary-only");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  if (!contractorSlug) throw new Error("--contractor is required");
  if (!isRehearsalSlug(contractorSlug)) throw new Error(`refusing non-rehearsal contractor ${contractorSlug}`);

  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({ where: { slug: contractorSlug }, select: { id: true } });
    if (!contractor) throw new Error(`${contractorSlug} does not exist`);
    const services = await db.service.findMany({
      where: { contractorId: contractor.id, offered: true },
      select: { id: true, slug: true, active: true },
      orderBy: { slug: "asc" },
    });

    const ready = [] as typeof services;
    const refused: { slug: string; code: string; message: string }[] = [];
    console.log(`\nELECTRICAL REHEARSAL READY SERVICES — ${apply ? "ACTIVATE" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractorSlug}\n`);
    for (const service of services) {
      if (service.active) {
        if (!summaryOnly) console.log(`  ${service.slug}: active`);
        continue;
      }
      const refusal = await activationRefusal(db, contractor.id, service.id);
      if (refusal) {
        refused.push({ slug: service.slug, code: refusal.code, message: refusal.message });
        if (!summaryOnly) console.log(`  ${service.slug}: refused ${refusal.code}`);
      } else {
        ready.push(service);
        if (!summaryOnly) console.log(`  ${service.slug}: ready`);
      }
    }

    if (!apply) {
      console.log(`\n  ${ready.length} ready, ${refused.length} refused, ${services.filter((service) => service.active).length} already active; no change\n`);
      if (!summaryOnly) for (const row of refused) console.log(`  refusal ${row.slug}: ${row.code} — ${row.message}`);
      return;
    }
    for (const service of ready) {
      const result = await activateService(db, contractor.id, service.id);
      if (!result.ok) throw new Error(`${service.slug} changed before activation: ${result.refusal.code} — ${result.refusal.message}`);
    }
    console.log(`\n  activated ${ready.length}; ${refused.length} refused services remain inactive\n`);
    if (!summaryOnly) for (const row of refused) console.log(`  refusal ${row.slug}: ${row.code} — ${row.message}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
