/**
 * Report or distribute the checked Electrical platform labor baseline to
 * explicitly named disposable rehearsal contractors.
 *
 * These rows are rehearsal starting values, not contractor observations. The
 * basis JSON preserves that distinction. This script refuses production,
 * non-rehearsal contractor slugs and operations not reachable from a checked
 * service recipe.
 *
 *   npx tsx scripts/distribute-electrical-labor-baselines-2026-09-23.ts \
 *     --contractor rv2-pilot-rehearsal-manual-0922
 *   npx tsx scripts/distribute-electrical-labor-baselines-2026-09-23.ts --apply \
 *     --contractor rv2-pilot-rehearsal-manual-0922
 */
import { PrismaClient } from "@prisma/client";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";
import { electricalPlatformLaborBaselineByOperation } from "../lib/electrical/platformLaborBaseline";
import { PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";

function args(name: string): string[] {
  const flag = `--${name}`;
  return process.argv.flatMap((value, index) => value === flag && process.argv[index + 1]
    ? [process.argv[index + 1]]
    : []);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const contractorSlugs = [...new Set(args("contractor"))];
  if (contractorSlugs.length === 0) throw new Error("at least one --contractor is required");
  for (const slug of contractorSlugs) {
    if (!slug.startsWith(PILOT_REHEARSAL_PREFIX)) throw new Error(`refusing non-rehearsal contractor ${slug}`);
  }

  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const reachableKeys = [...new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES.flatMap((recipe) => recipe.lines.map((line) => line.operationKey)))].sort();
  const missing = reachableKeys.filter((key) => !electricalPlatformLaborBaselineByOperation.has(key));
  if (missing.length) throw new Error(`platform labor baseline is incomplete: ${missing.join(", ")}`);

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractors = await db.contractor.findMany({
      where: { slug: { in: contractorSlugs } }, select: { id: true, slug: true },
    });
    const found = new Set(contractors.map((contractor) => contractor.slug));
    const absent = contractorSlugs.filter((slug) => !found.has(slug));
    if (absent.length) throw new Error(`rehearsal contractor(s) do not exist: ${absent.join(", ")}`);

    console.log(`\nELECTRICAL PLATFORM LABOR BASELINE — ${apply ? "DISTRIBUTE" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  recipients: ${contractorSlugs.join(", ")}`);
    console.log(`  reachable operations: ${reachableKeys.length}\n`);

    let created = 0, updated = 0, unchanged = 0;
    for (const contractor of contractors) {
      for (const operationKey of reachableKeys) {
        const baseline = electricalPlatformLaborBaselineByOperation.get(operationKey)!;
        const current = await db.contractorLaborOperationDecision.findUnique({
          where: { contractorId_trade_operationKey: { contractorId: contractor.id, trade: "electrical", operationKey } },
          select: { id: true, hoursPerUnit: true, basis: true },
        });
        const basis = {
          kind: "PLATFORM_BASELINE_REHEARSAL",
          baselineStatus: baseline.status,
          sourceKeys: baseline.sourceKeys,
          note: baseline.note,
          contractorObservation: false,
          baselineDate: "2026-09-23",
        };
        const currentBasis = current?.basis && typeof current.basis === "object" && !Array.isArray(current.basis)
          ? current.basis as Record<string, unknown>
          : null;
        const currentSourceKeys = Array.isArray(currentBasis?.sourceKeys) ? currentBasis.sourceKeys : [];
        const same = current?.hoursPerUnit === baseline.hoursPerUnit
          && currentBasis?.kind === basis.kind
          && currentBasis?.baselineStatus === basis.baselineStatus
          && currentBasis?.note === basis.note
          && currentBasis?.contractorObservation === basis.contractorObservation
          && currentBasis?.baselineDate === basis.baselineDate
          && currentSourceKeys.length === basis.sourceKeys.length
          && currentSourceKeys.every((value, index) => value === basis.sourceKeys[index]);
        if (same) { unchanged++; continue; }
        if (!apply) { current ? updated++ : created++; continue; }
        await db.contractorLaborOperationDecision.upsert({
          where: { contractorId_trade_operationKey: { contractorId: contractor.id, trade: "electrical", operationKey } },
          update: { hoursPerUnit: baseline.hoursPerUnit, source: "APPROVED_PROPOSAL", basis, approvedAt: new Date() },
          create: { contractorId: contractor.id, trade: "electrical", operationKey, hoursPerUnit: baseline.hoursPerUnit, source: "APPROVED_PROPOSAL", basis },
        });
        current ? updated++ : created++;
      }
    }
    console.log(`  ${apply ? "applied" : "would apply"}: ${created} create, ${updated} update, ${unchanged} unchanged`);
    if (!apply) console.log("  Report only. Re-run with --apply to distribute the checked baseline.\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
