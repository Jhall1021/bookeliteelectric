/**
 * Report or publish current model prices for offered, bounded Electrical
 * services whose service duration is traceable to the atomic recipe review.
 *
 * Route-priced services keep their separate derived approval. Quote-only,
 * route-specific, review-only and internal fixtures are excluded. Publication
 * goes through publishSuggestedPrice, including its stale-review and material
 * readiness checks; this script never writes a price directly.
 *
 *   npx tsx scripts/publish-electrical-rehearsal-atomic-prices-2026-09-23.ts
 *   npx tsx scripts/publish-electrical-rehearsal-atomic-prices-2026-09-23.ts --apply
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { connectedDeviceFactsForService, loadConnectedDeviceLaborFacts } from "../lib/electrical/connectedDeviceLaborFacts";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { loadStandardScopeLaborFacts } from "../lib/electrical/standardScopeLaborFacts";
import { flatPriceFoundationReadiness } from "../lib/priceReviewReadiness";
import { suggestPrimaryPrice, suggestWwtPrice } from "../lib/pricing";
import { publishSuggestedPrice } from "../lib/pricePublication";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";
type Decision = { operationKey: string; hoursPerUnit: number; source: "DIRECT" | "APPROVED_PROPOSAL" | "UNAPPROVED_PROPOSAL" };

async function main() {
  const apply = process.argv.includes("--apply");
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
      select: { id: true, slug: true, pricingStrategy: true },
    });
    if (!contractor) throw new Error(`${EXPECTED_CONTRACTOR} does not exist`);
    if (contractor.pricingStrategy !== "FLAT_RATE") throw new Error(`refusing ${contractor.pricingStrategy} contractor`);

    const [settings, stored, services, connectedFacts, standardScopeFacts] = await Promise.all([
      db.pricingSettings.findUnique({ where: { contractorId: contractor.id } }),
      db.contractorLaborOperationDecision.findMany({
        where: { contractorId: contractor.id, trade: "electrical" },
        select: { operationKey: true, hoursPerUnit: true, source: true },
      }),
      db.service.findMany({
        where: { contractorId: contractor.id, tradeKey: "electrical", offered: true },
        orderBy: { slug: "asc" },
      }),
      loadConnectedDeviceLaborFacts(db, contractor.id),
      loadStandardScopeLaborFacts(db, contractor.id),
    ]);
    if (!settings
        || settings.crewHourRateCents === null
        || settings.primaryMinimumCents === null
        || settings.roundingIncrementCents === null
        || settings.defaultPermitAdminCents === null) {
      throw new Error("pricing settings are incomplete");
    }
    const completeSettings = {
      crewHourRateCents: settings.crewHourRateCents,
      primaryMinimumCents: settings.primaryMinimumCents,
      roundingIncrementCents: settings.roundingIncrementCents,
      defaultPermitAdminCents: settings.defaultPermitAdminCents,
    };
    const decisions = stored as Decision[];
    const pending: { id: string; slug: string; currentPrimary: number | null; nextPrimary: number; currentAddOn: number | null; nextAddOn: number | null }[] = [];
    const blocked: { slug: string; reason: string }[] = [];
    let routeSpecific = 0, quoteOnly = 0, derived = 0, current = 0, bounded = 0;

    for (const service of services) {
      if (service.pricingMethod === "DERIVED_RESOLVED_SCOPE") { derived++; continue; }
      if (service.bookingType === "REMOTE_QUOTE") { quoteOnly++; continue; }
      const projection = projectElectricalServiceLabor(
        service.slug,
        decisions,
        { ...(standardScopeFacts[service.slug] ?? {}), ...connectedDeviceFactsForService(service.slug, connectedFacts) },
      );
      if (projection.kind !== "READY_FOR_APPROVAL") { routeSpecific++; continue; }
      bounded++;
      if (service.fieldLaborHours === null || Math.abs(service.fieldLaborHours - projection.suggestedHours) > 1e-9) {
        blocked.push({ slug: service.slug, reason: "atomic service duration is not current" });
        continue;
      }
      const foundation = flatPriceFoundationReadiness({
        materialCostResolved: service.materialCostResolved,
        unresolvedMaterialKeys: service.unresolvedMaterialKeys,
        unresolvedPolicyKeys: service.unresolvedPolicyKeys,
      });
      if (!foundation.ready) { blocked.push({ slug: service.slug, reason: foundation.message }); continue; }
      const primary = suggestPrimaryPrice(service, completeSettings);
      if (primary.totalCents === null) { blocked.push({ slug: service.slug, reason: primary.unavailableReason ?? "no primary suggestion" }); continue; }
      const addOn = suggestWwtPrice(service, completeSettings);
      if (service.whileWeThereBasePrice !== null && addOn.totalCents === null) {
        blocked.push({ slug: service.slug, reason: "published add-on price has no established While We're There labor duration" });
        continue;
      }
      const same = service.basePrice === primary.totalCents
        && service.publishedPriceApprovedAt !== null
        && (addOn.totalCents === null || service.whileWeThereBasePrice === addOn.totalCents);
      if (same) { current++; continue; }
      pending.push({
        id: service.id, slug: service.slug,
        currentPrimary: service.basePrice, nextPrimary: primary.totalCents,
        currentAddOn: service.whileWeThereBasePrice, nextAddOn: addOn.totalCents,
      });
    }

    console.log(`\nELECTRICAL REHEARSAL ATOMIC PRICES — ${apply ? "PUBLISH" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractor.slug}`);
    console.log(`  offered services: ${services.length}`);
    console.log(`  bounded atomic services: ${bounded}`);
    console.log(`  prices already current: ${current}`);
    console.log(`  prices pending publication: ${pending.length}`);
    console.log(`  blocked bounded services: ${blocked.length}`);
    console.log(`  route-specific/nonstandard: ${routeSpecific}`);
    console.log(`  derived-route services: ${derived}`);
    console.log(`  quote-only services: ${quoteOnly}\n`);
    const money = (value: number | null) => value === null ? "unset" : `$${(value / 100).toFixed(2)}`;
    for (const row of pending) {
      console.log(`  ${apply ? "publish" : "would publish"} ${row.slug}: primary ${money(row.currentPrimary)} -> ${money(row.nextPrimary)}, add-on ${money(row.currentAddOn)} -> ${money(row.nextAddOn)}`);
    }
    for (const row of blocked) console.log(`  blocked ${row.slug}: ${row.reason}`);
    if (!apply) {
      console.log(pending.length
        ? "\n  Report only. Re-run with --apply to publish the displayed model prices.\n"
        : "\n  No bounded atomic price changes are pending.\n");
      return;
    }
    if (pending.length === 0) return;

    await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM services
        WHERE id IN (${Prisma.join(pending.map((row) => row.id))})
          AND "contractorId" = ${contractor.id}
        ORDER BY id
        FOR UPDATE
      `);
      if (locked.length !== pending.length) throw new Error("one or more rehearsal services disappeared during publication");
      for (const row of pending) {
        const result = await publishSuggestedPrice(tx, contractor.id, row.id, { expectedBasePrice: row.nextPrimary });
        if (!result.ok) throw new Error(`${row.slug} publication refused: ${result.refusal.code} — ${result.refusal.message}`);
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log(`\n  published ${pending.length} bounded atomic service price(s).\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
