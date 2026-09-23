/**
 * Select the next bounded Electrical rehearsal batch, or activate the subset
 * whose complete storefront dependency/disclaimer checks also pass. Every
 * selected service has a complete atomic labor projection, resolved material
 * cost and no unresolved contractor route policy. Services with downstream
 * activation dependencies or contractor-authored disclosures remain selected
 * but inactive until those separate gates are resolved.
 *
 * Selection and activation stay separate so the normal duration and price
 * approval authorities run between them.
 *
 *   npx tsx scripts/advance-electrical-rehearsal-bounded-batch-2026-09-23.ts --select [--apply]
 *   npx tsx scripts/advance-electrical-rehearsal-bounded-batch-2026-09-23.ts --activate [--apply]
 */
import { PrismaClient } from "@prisma/client";
import { activateService, activationRefusal } from "../lib/serviceActivation";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";
const APPROVAL_SERVICES = [
  "200a-service-upgrade",
  "electrical-panel-replacement",
  "exterior-gfci-standard",
  "generator-inlet-interlock",
  "replace-bathroom-exhaust-fan-with-light",
  "replace-range-hood",
  "replace-wall-sconce",
  "soundbar-installation",
] as const;
const ACTIVATION_SERVICES = [
  "generator-inlet-interlock",
  "replace-bathroom-exhaust-fan-with-light",
  "replace-wall-sconce",
] as const;

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
    const contractor = await db.contractor.findUnique({
      where: { slug: EXPECTED_CONTRACTOR },
      select: { id: true },
    });
    if (!contractor) throw new Error(`${EXPECTED_CONTRACTOR} does not exist`);
    const serviceSlugs = select ? APPROVAL_SERVICES : ACTIVATION_SERVICES;
    const services = await db.service.findMany({
      where: { contractorId: contractor.id, slug: { in: [...serviceSlugs] } },
      select: { id: true, slug: true, offered: true, active: true },
      orderBy: { slug: "asc" },
    });
    if (services.length !== serviceSlugs.length) {
      const found = new Set(services.map((service) => service.slug));
      throw new Error(`missing batch services: ${serviceSlugs.filter((slug) => !found.has(slug)).join(", ")}`);
    }

    console.log(`\nBOUNDED ELECTRICAL REHEARSAL BATCH — ${select ? "SELECT" : "ACTIVATE"} ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${EXPECTED_CONTRACTOR}\n`);

    if (select) {
      const pending = services.filter((service) => !service.offered);
      for (const service of services) console.log(`  ${service.slug}: offered=${service.offered}, active=${service.active}`);
      if (!apply) {
        console.log(`\n  would select ${pending.length} service(s); no duration, price or activation is implied\n`);
        return;
      }
      if (pending.length) {
        await db.service.updateMany({
          where: { contractorId: contractor.id, id: { in: pending.map((service) => service.id) } },
          data: { offered: true },
        });
      }
      console.log(`\n  selected ${pending.length} service(s); duration, price and activation remain unchanged\n`);
      return;
    }

    const refused: { slug: string; code: string; message: string }[] = [];
    for (const service of services) {
      const refusal = await activationRefusal(db, contractor.id, service.id);
      if (refusal) refused.push({ slug: service.slug, code: refusal.code, message: refusal.message });
      console.log(`  ${service.slug}: ${service.active ? "already active" : refusal ? `refused ${refusal.code}` : "ready"}`);
    }
    if (refused.length) {
      throw new Error(`activation refused for ${refused.map((row) => `${row.slug}: ${row.code} — ${row.message}`).join("; ")}`);
    }
    const pending = services.filter((service) => !service.active);
    if (!apply) {
      console.log(`\n  would activate ${pending.length} service(s) through the shared activation authority\n`);
      return;
    }
    for (const service of pending) {
      const result = await activateService(db, contractor.id, service.id);
      if (!result.ok) throw new Error(`${service.slug} activation refused: ${result.refusal.code} — ${result.refusal.message}`);
    }
    console.log(`\n  activated ${pending.length} service(s) through the shared activation authority\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
