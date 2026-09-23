/** Read-only audit of platform baselines and contractor prices for every
 * material role reachable from a priceable path in the installed electrical
 * catalog. The two layers are reported separately so tenant fixture values can
 * never make the platform baseline look complete. */
import { PrismaClient } from "@prisma/client";
import { activationMaterialRoles } from "../lib/materialResolution";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_MARKER = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";

async function main() {
  const url = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(url);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_MARKER) {
    throw new Error(`refusing target ${identity.endpoint}`);
  }

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const contractor = await db.contractor.findUnique({ where: { slug: EXPECTED_CONTRACTOR }, select: { id: true } });
    if (!contractor) throw new Error(`missing contractor ${EXPECTED_CONTRACTOR}`);
    const services = await db.service.findMany({
      where: { contractorId: contractor.id, tradeKey: "electrical" },
      select: { id: true, slug: true, active: true },
      orderBy: { slug: "asc" },
    });
    const required = new Map<string, { key: string; services: Set<string>; activeServices: Set<string> }>();
    for (const service of services) {
      for (const role of await activationMaterialRoles(db, service.id)) {
        const row = required.get(role.canonicalMaterialId) ?? { key: role.key, services: new Set<string>(), activeServices: new Set<string>() };
        row.services.add(service.slug);
        if (service.active) row.activeServices.add(service.slug);
        required.set(role.canonicalMaterialId, row);
      }
    }
    const pricedIds = new Set((await db.contractorMaterial.findMany({
      where: { contractorId: contractor.id, active: true }, select: { canonicalMaterialId: true },
    })).map((row) => row.canonicalMaterialId));
    const baselineIds = new Set((await db.materialBaselineVersion.findMany({
      where: { canonicalMaterialId: { in: [...required.keys()] } },
      distinct: ["canonicalMaterialId"],
      select: { canonicalMaterialId: true },
    })).map((row) => row.canonicalMaterialId));
    const missing = [...required.entries()].filter(([id]) => !pricedIds.has(id)).map(([, role]) => role);
    const missingActive = missing.filter((role) => role.activeServices.size > 0);
    const missingBaselines = [...required.entries()].filter(([id]) => !baselineIds.has(id)).map(([, role]) => role);

    console.log("\nELECTRICAL MATERIAL PRICE COVERAGE — READ ONLY\n");
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${EXPECTED_CONTRACTOR}`);
    console.log(`  installed electrical services: ${services.length}`);
    console.log(`  active electrical services: ${services.filter((service) => service.active).length}`);
    console.log(`  distinct reachable material roles: ${required.size}`);
    console.log(`  roles with platform baselines: ${required.size - missingBaselines.length}`);
    console.log(`  roles missing platform baselines: ${missingBaselines.length}`);
    console.log(`  roles with contractor prices: ${required.size - missing.length}`);
    console.log(`  roles missing contractor prices: ${missing.length}`);
    console.log(`  missing roles affecting active services: ${missingActive.length}`);
    for (const role of missingBaselines) console.log(`  ◇ BASELINE ${role.key} — ${[...role.services].join(", ")}`);
    for (const role of missing) console.log(`  ✗ ${role.key} — ${[...role.services].join(", ")}`);
    console.log();
    if (missing.length || missingBaselines.length) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
