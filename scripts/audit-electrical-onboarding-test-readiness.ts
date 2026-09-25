/** Report the exact readiness findings behind the Guided Setup summaries. */
import { PrismaClient } from "@prisma/client";
import { assessOnboarding } from "../lib/onboardingReadiness";
import { connectedDeviceFactsForService, loadConnectedDeviceLaborFacts } from "../lib/electrical/connectedDeviceLaborFacts";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { loadRoutePricingReview } from "../lib/electrical/routePricingReview";
import { loadStandardScopeLaborFacts } from "../lib/electrical/standardScopeLaborFacts";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";
import { withTenant } from "../lib/tenantContext";
import { withTenantGuard } from "../lib/tenantGuard";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const CONTRACTOR_SLUG = "electrical-onboarding-test";
const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";

async function main() {
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production identity did not match.`);
  }

  const raw = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  const guarded = withTenantGuard(new PrismaClient({ datasources: { db: { url: targetUrl } } })) as unknown as PrismaClient;
  try {
    const contractor = await raw.contractor.findUniqueOrThrow({
      where: { slug: CONTRACTOR_SLUG }, select: { id: true, name: true },
    });
    const readiness = await withTenant(
      { contractorId: contractor.id, source: "system" },
      () => assessOnboarding(guarded, contractor.id),
    );
    console.log(`READINESS — ${contractor.name} (${CONTRACTOR_SLUG})`);
    console.log(`  blockers: ${readiness.blockers.length}; warnings: ${readiness.warnings.length}`);
    for (const finding of [...readiness.blockers, ...readiness.warnings]) {
      console.log(`  ${finding.severity.toUpperCase()} ${finding.code} ${finding.serviceSlug ?? "-"}`);
      console.log(`    ${finding.message}`);
      console.log(`    ${finding.href ?? "-"}`);
    }
    const [services, decisions, connectedFacts, standardFacts] = await Promise.all([
      raw.service.findMany({
        where: { contractorId: contractor.id, offered: true },
        select: { id: true, slug: true, pricingMethod: true, isPrimaryEligible: true, fieldLaborHours: true, wwtLaborHours: true },
        orderBy: { slug: "asc" },
      }),
      raw.contractorLaborOperationDecision.findMany({
        where: { contractorId: contractor.id, trade: "electrical" },
        select: { operationKey: true, hoursPerUnit: true, source: true },
      }),
      loadConnectedDeviceLaborFacts(raw, contractor.id),
      loadStandardScopeLaborFacts(raw, contractor.id),
    ]);
    console.log("  offered atomic projections:");
    for (const service of services) {
      const projection = projectElectricalServiceLabor(service.slug, decisions, {
        ...(standardFacts[service.slug] ?? {}),
        ...connectedDeviceFactsForService(service.slug, connectedFacts),
      });
      console.log(`    ${service.slug}: method=${service.pricingMethod}; primary=${service.isPrimaryEligible}; stored=${service.fieldLaborHours ?? "null"}/${service.wwtLaborHours ?? "null"}; projection=${projection.kind}${projection.kind === "READY_FOR_APPROVAL" ? `:${projection.suggestedHours}` : ""}`);
    }
    console.log("  derived route reviews:");
    for (const service of services.filter((row) => row.pricingMethod === "DERIVED_RESOLVED_SCOPE")) {
      const review = await loadRoutePricingReview(raw, contractor.id, service.id);
      console.log(`    ${service.slug}: ${review?.proposal?.totalCents !== null && review?.proposal?.totalCents !== undefined ? `ready $${(review.proposal.totalCents / 100).toFixed(2)}` : `blocked ${review?.refusal ?? "review unavailable"}`}`);
    }
    const diagnosticMaterialKeys = [
      "CABLE_CAT6", "JACK_KEYSTONE_RJ45", "CABLE_RG6", "JACK_COAX_F",
      "LOW_VOLTAGE_RING", "WALL_PLATE", "CONSUMABLES_SMALL",
    ];
    const diagnosticMaterials = await raw.contractorMaterial.findMany({
      where: { contractorId: contractor.id, canonicalMaterial: { key: { in: diagnosticMaterialKeys } } },
      select: { active: true, unitCostCents: true, canonicalMaterial: { select: { key: true } } },
      orderBy: { canonicalMaterial: { key: "asc" } },
    });
    console.log(`  low-voltage material rows: ${diagnosticMaterials.map((row) => `${row.canonicalMaterial.key}=${row.unitCostCents}:${row.active ? "active" : "inactive"}`).join(", ")}`);
    const surfaceSystem = await raw.contractorMaterialSystem.findUnique({
      where: { contractorId_systemKey: { contractorId: contractor.id, systemKey: "SURFACE_RACEWAY" } },
    });
    console.log(`  surface system: ${surfaceSystem ? "present" : "missing"}`);
    const surfaceMaterialKeys = [
      ...Object.values(SURFACE_ROLES),
      "CONDUCTOR_THHN_12_UNGROUNDED", "CONDUCTOR_THHN_12_GROUNDED", "CONDUCTOR_THHN_12_EQUIPMENT_GROUND",
    ];
    const surfaceMaterials = await raw.contractorMaterial.findMany({
      where: { contractorId: contractor.id, canonicalMaterial: { key: { in: surfaceMaterialKeys } } },
      select: {
        packageQuantity: true, packageUnit: true, packagePriceCents: true,
        canonicalMaterial: { select: { key: true } },
      },
      orderBy: { canonicalMaterial: { key: "asc" } },
    });
    console.log(`  surface material rows: ${surfaceMaterials.map((row) => `${row.canonicalMaterial.key}=${row.packagePriceCents ?? "null"}/${row.packageQuantity ?? "null"}${row.packageUnit ?? ""}`).join(", ")}`);
  } finally {
    await Promise.all([raw.$disconnect(), guarded.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
