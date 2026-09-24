/**
 * Report or approve bounded Electrical service durations for the designated
 * rehearsal contractor. Suggestions come only from the checked atomic recipe,
 * its standard physical quantities and approved operation labor decisions.
 * Route-specific, review-only and internal fixture services are never given an
 * invented duration here.
 *
 *   npx tsx scripts/approve-electrical-rehearsal-service-durations-2026-09-23.ts
 *   npx tsx scripts/approve-electrical-rehearsal-service-durations-2026-09-23.ts --apply
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { isRehearsalSlug } from "../lib/electrical/pilotScope";
import { connectedDeviceFactsForService, loadConnectedDeviceLaborFacts } from "../lib/electrical/connectedDeviceLaborFacts";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { buildElectricalServiceLaborReadiness } from "../lib/electrical/serviceLaborReadiness";
import { loadStandardScopeLaborFacts } from "../lib/electrical/standardScopeLaborFacts";
import { saveServicePricingInputs } from "../lib/servicePricingInputs";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

type Decision = { operationKey: string; hoursPerUnit: number; source: "DIRECT" | "APPROVED_PROPOSAL" | "UNAPPROVED_PROPOSAL" };

async function main() {
  const apply = process.argv.includes("--apply");
  const contractorSlug = arg("contractor");
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
    const contractor = await db.contractor.findUnique({
      where: { slug: contractorSlug },
      select: { id: true, slug: true, pricingStrategy: true },
    });
    if (!contractor) throw new Error(`${contractorSlug} does not exist`);
    if (contractor.pricingStrategy !== "FLAT_RATE") throw new Error(`refusing ${contractor.pricingStrategy} contractor`);

    const excluded = new Set(buildElectricalServiceLaborReadiness()
      .filter((row) => row.state === "INTERNAL_FIXTURE" || row.state === "NON_PRICEABLE_REVIEW")
      .map((row) => row.serviceSlug));
    const [stored, services, connectedFacts, standardScopeFacts] = await Promise.all([
      db.contractorLaborOperationDecision.findMany({
        where: { contractorId: contractor.id, trade: "electrical" },
        select: { operationKey: true, hoursPerUnit: true, source: true },
      }),
      db.service.findMany({
        where: { contractorId: contractor.id, tradeKey: "electrical", offered: true },
        select: { id: true, slug: true, name: true, bookingType: true, isPrimaryEligible: true, fieldLaborHours: true, wwtLaborHours: true },
        orderBy: { slug: "asc" },
      }),
      loadConnectedDeviceLaborFacts(db, contractor.id),
      loadStandardScopeLaborFacts(db, contractor.id),
    ]);
    const decisions = stored as Decision[];
    const buckets = { ready: 0, current: 0, pending: 0, routeSpecific: 0, blocked: 0, notModeled: 0, excluded: 0 };
    const pending: { id: string; slug: string; name: string; isPrimaryEligible: boolean; primaryOnly: boolean; currentPrimary: number | null; currentAddOn: number | null; suggested: number; recipeKey: string }[] = [];
    for (const service of services) {
      if (excluded.has(service.slug)) { buckets.excluded++; continue; }
      const projection = projectElectricalServiceLabor(
        service.slug,
        decisions,
        { ...(standardScopeFacts[service.slug] ?? {}), ...connectedDeviceFactsForService(service.slug, connectedFacts) },
      );
      if (projection.kind === "READY_FOR_APPROVAL") {
        buckets.ready++;
        const primaryCurrent = !service.isPrimaryEligible
          || service.fieldLaborHours !== null && Math.abs(service.fieldLaborHours - projection.suggestedHours) <= 1e-9;
        const primaryOnly = service.bookingType === "TROUBLESHOOT_ONLY";
        const addOnCurrent = primaryOnly
          ? service.wwtLaborHours === null
          : service.wwtLaborHours !== null && Math.abs(service.wwtLaborHours - projection.suggestedHours) <= 1e-9;
        if (primaryCurrent && addOnCurrent) {
          buckets.current++;
        } else {
          buckets.pending++;
          pending.push({
            id: service.id, slug: service.slug, name: service.name, isPrimaryEligible: service.isPrimaryEligible, primaryOnly,
            currentPrimary: service.fieldLaborHours, currentAddOn: service.wwtLaborHours,
            suggested: projection.suggestedHours,
            recipeKey: projection.recipeKey,
          });
        }
      } else if (projection.kind === "NO_STANDARD_SCOPE") buckets.routeSpecific++;
      else if (projection.kind === "BLOCKED") buckets.blocked++;
      else buckets.notModeled++;
    }

    console.log(`\nELECTRICAL REHEARSAL SERVICE DURATIONS — ${apply ? "APPROVE" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractor.slug}`);
    console.log(`  offered services: ${services.length}`);
    console.log(`  bounded suggestions: ${buckets.ready}`);
    console.log(`  already current: ${buckets.current}`);
    console.log(`  pending approval: ${buckets.pending}`);
    console.log(`  route-specific: ${buckets.routeSpecific}`);
    console.log(`  blocked on atomic inputs: ${buckets.blocked}`);
    console.log(`  not modeled: ${buckets.notModeled}`);
    console.log(`  review-only/internal excluded: ${buckets.excluded}\n`);
    for (const row of pending) {
      console.log(row.primaryOnly
        ? `  ${apply ? "approve" : "would approve"} ${row.slug}: primary ${row.currentPrimary ?? "unset"} -> ${row.suggested.toFixed(3)} hr; add-on remains unavailable (${row.recipeKey})`
        : row.isPrimaryEligible
        ? `  ${apply ? "approve" : "would approve"} ${row.slug}: primary ${row.currentPrimary ?? "unset"}, add-on ${row.currentAddOn ?? "unset"} -> ${row.suggested.toFixed(3)} hr both (${row.recipeKey})`
        : `  ${apply ? "approve" : "would approve"} ${row.slug} add-on: ${row.currentAddOn ?? "unset"} -> ${row.suggested.toFixed(3)} hr (${row.recipeKey})`);
    }

    if (!apply) {
      console.log(pending.length
        ? "\n  Report only. Re-run with --apply to approve these atomic-recipe durations.\n"
        : "\n  No duration changes are pending.\n");
      return;
    }
    if (pending.length === 0) return;

    await db.$transaction(async (tx) => {
      const [freshStored, freshConnectedFacts, freshStandardScopeFacts] = await Promise.all([
        tx.contractorLaborOperationDecision.findMany({
          where: { contractorId: contractor.id, trade: "electrical" },
          select: { operationKey: true, hoursPerUnit: true, source: true },
        }),
        loadConnectedDeviceLaborFacts(tx, contractor.id),
        loadStandardScopeLaborFacts(tx, contractor.id),
      ]);
      const freshDecisions = freshStored as Decision[];
      const locked = await tx.$queryRaw<{ id: string; slug: string; bookingType: string; isPrimaryEligible: boolean }[]>(Prisma.sql`
        SELECT id, slug, "bookingType", "isPrimaryEligible" FROM services
        WHERE id IN (${Prisma.join(pending.map((row) => row.id))})
          AND "contractorId" = ${contractor.id}
        ORDER BY id
        FOR UPDATE
      `);
      if (locked.length !== pending.length) throw new Error("one or more rehearsal services disappeared during approval");
      const expectedById = new Map(pending.map((row) => [row.id, row.suggested]));
      for (const service of locked) {
        const projection = projectElectricalServiceLabor(
          service.slug,
          freshDecisions,
          { ...(freshStandardScopeFacts[service.slug] ?? {}), ...connectedDeviceFactsForService(service.slug, freshConnectedFacts) },
        );
        if (projection.kind !== "READY_FOR_APPROVAL") throw new Error(`${service.slug} became ${projection.kind} during approval`);
        if (Math.abs(projection.suggestedHours - expectedById.get(service.id)!) > 1e-9) {
          throw new Error(`${service.slug} atomic projection changed during approval`);
        }
        await saveServicePricingInputs(tx, service.id, service.bookingType === "TROUBLESHOOT_ONLY"
          ? { fieldLaborHours: projection.suggestedHours, wwtLaborHours: null }
          : service.isPrimaryEligible
          ? { fieldLaborHours: projection.suggestedHours, wwtLaborHours: projection.suggestedHours }
          : { wwtLaborHours: projection.suggestedHours });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log(`\n  approved ${pending.length} bounded service duration(s); no customer price was published.\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
