/**
 * Complete and activate the three bounded surface-raceway services on the
 * designated rehearsal branch.
 *
 * Report mode calculates the representative 10-foot straight routes without
 * writing. Apply mode first moves the fixture-box role from the superseded
 * nonmetallic NMW4 reference to the compatible 500/700-series metal BW4F
 * baseline, then stores approvals for the calculated economics and activates
 * the services. Every write is guarded by endpoint, lineage, marker,
 * contractor namespace and exact recognized prior state.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { loadPricingSettings, loadServiceForResolution, resolveRoute } from "../lib/routeResolver";
import { proposeDerivedScope } from "../lib/electrical/loadDerivedScope";
import { routePricingReviewScenario } from "../lib/electrical/routePricingReviewScenario";
import { routeShapeFromAnswers } from "../lib/electrical/resolveWithDerivedPricing";
import { PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";
const SYSTEM_LABEL = "Legrand Wiremold 500/700 Series metal surface raceway";
const FIXTURE_BOX_SOURCE = "Legrand Wiremold BW4F 500/700-series metal fixture/fan box, The Home Depot";
const FIXTURE_BOX_SOURCED_AT = new Date("2026-09-23T18:00:00.000Z");
const SERVICES = ["surface-mounted-outlet", "surface-mounted-switch", "surface-mounted-fixture-box"] as const;

type Proposal = {
  serviceId: string;
  slug: typeof SERVICES[number];
  totalCents: number;
  laborCents: number;
  materialCents: number;
  laborHours: number;
  basisFingerprint: string;
};

async function proposals(db: PrismaClient, contractorId: string): Promise<Proposal[]> {
  const services = await db.service.findMany({
    where: { contractorId, slug: { in: [...SERVICES] } },
    select: {
      id: true, slug: true, active: true, pricingMethod: true, isPrimaryEligible: true,
      materialMultiplier: true, permitAdminCents: true, otherDirectCostCents: true,
    },
  });
  if (services.length !== SERVICES.length) {
    const found = new Set(services.map((service) => service.slug));
    throw new Error(`missing surface services: ${SERVICES.filter((slug) => !found.has(slug)).join(", ")}`);
  }
  const settings = await loadPricingSettings(db, contractorId);
  const out: Proposal[] = [];
  for (const service of services) {
    if (service.pricingMethod !== "LEGACY_PUBLISHED" && service.pricingMethod !== "DERIVED_RESOLVED_SCOPE") {
      throw new Error(`${service.slug} has an unrecognized pricing method ${service.pricingMethod}`);
    }
    const scenario = routePricingReviewScenario(service.slug);
    if (!scenario) throw new Error(`${service.slug} has no checked representative route`);
    const loaded = await loadServiceForResolution(db, service.id);
    // Representative scenarios are checked below for a physical component
    // set; the resolver union also contains reroute/review variants.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolved = loaded ? (resolveRoute(loaded, scenario.answers, true, settings) as any) : null;
    const components = (resolved?.config?.components ?? []) as { key: string; quantity: number }[];
    if (components.length === 0) throw new Error(`${service.slug} representative route has no physical components`);
    const shape = routeShapeFromAnswers(scenario.answers);
    const calculated = await proposeDerivedScope(db, {
      contractorId,
      serviceId: service.id,
      components,
      routeFeet: shape.routeFeet,
      turnCount: shape.turnCount,
      context: {
        isPrimary: true,
        isPrimaryEligible: service.isPrimaryEligible,
        servicePermitAdminEstablished: service.permitAdminCents !== null,
      },
      service: {
        materialMultiplier: service.materialMultiplier,
        permitAdminCents: service.permitAdminCents,
        otherDirectCostCents: service.otherDirectCostCents,
        isPrimaryEligible: service.isPrimaryEligible,
      },
    });
    if (calculated.proposal.kind !== "PRICED") {
      throw new Error(`${service.slug} is not ready: ${calculated.proposal.code} — ${calculated.proposal.reason}`);
    }
    out.push({
      serviceId: service.id,
      slug: service.slug as Proposal["slug"],
      totalCents: calculated.proposal.totalCents,
      laborCents: Math.round(calculated.proposal.breakdown.laborCents),
      materialCents: calculated.proposal.breakdown.materialCents,
      laborHours: calculated.proposal.laborHours,
      basisFingerprint: calculated.basisFingerprint,
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  if (!EXPECTED_CONTRACTOR.startsWith(PILOT_REHEARSAL_PREFIX)) throw new Error("configured contractor is not rehearsal-scoped");
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
    const canonical = await db.canonicalMaterial.findUniqueOrThrow({ where: { key: "SURFACE_FIXTURE_BOX" }, select: { id: true, unit: true } });
    if (canonical.unit !== "each") throw new Error("SURFACE_FIXTURE_BOX must be a discrete each material");
    const baseline = await db.materialBaselineVersion.findFirst({
      where: { canonicalMaterialId: canonical.id, sourceLabel: FIXTURE_BOX_SOURCE, sourcedAt: FIXTURE_BOX_SOURCED_AT },
      select: { id: true, unitCostCents: true, unitCostMilliCents: true, packagePriceCents: true, packageQuantity: true, packageUnit: true },
    });
    if (!baseline) throw new Error("compatible BW4F platform baseline is not installed");
    if (baseline.unitCostCents !== 2052 || baseline.packagePriceCents !== 2052 || baseline.packageQuantity !== 1 || baseline.packageUnit !== "each") {
      throw new Error("compatible BW4F platform baseline has unexpected economics");
    }
    const material = await db.contractorMaterial.findUniqueOrThrow({
      where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: canonical.id } },
      select: {
        id: true, unitCostCents: true, unitCostMilliCents: true, packagePriceCents: true,
        packageQuantity: true, packageUnit: true, costSource: true, acceptedBaselineVersionId: true,
      },
    });
    const current = material.unitCostCents === 2052 && material.packagePriceCents === 2052
      && material.packageQuantity === 1 && material.packageUnit === "each"
      && material.costSource === "BASELINE" && material.acceptedBaselineVersionId === baseline.id;
    const superseded = material.unitCostCents === 1648 && material.packagePriceCents === null
      && material.packageQuantity === null && material.acceptedBaselineVersionId !== baseline.id;
    if (!current && !superseded) throw new Error("SURFACE_FIXTURE_BOX contractor cost has an unrecognized state; refusing to overwrite it");

    const system = await db.contractorMaterialSystem.findUniqueOrThrow({
      where: { contractorId_systemKey: { contractorId: contractor.id, systemKey: "SURFACE_RACEWAY" } },
      select: { id: true, declaredSystemLabel: true },
    });
    if (system.declaredSystemLabel !== null && system.declaredSystemLabel !== SYSTEM_LABEL) {
      throw new Error(`surface raceway system already names a different family: ${system.declaredSystemLabel}`);
    }

    console.log(`\nELECTRICAL REHEARSAL SURFACE SERVICES — ${apply ? "ADVANCE" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  fixture box: ${current ? "current BW4F $20.52/each" : "would replace incompatible NMW4 $16.48 reference with BW4F $20.52/each"}`);

    if (apply && (!current || system.declaredSystemLabel === null)) {
      await db.$transaction(async (tx) => {
        if (!current) {
          await tx.contractorMaterial.update({
            where: { id: material.id },
            data: {
              unitCostCents: baseline.unitCostCents,
              unitCostMilliCents: baseline.unitCostMilliCents,
              packagePriceCents: baseline.packagePriceCents,
              packageQuantity: baseline.packageQuantity,
              packageUnit: baseline.packageUnit,
              costSource: "BASELINE",
              costConfidence: "ASSUMED",
              costStatus: "OK",
              costStatusNote: null,
              costUpdatedAt: new Date(),
              acceptedBaselineVersionId: baseline.id,
            },
          });
          await tx.materialCostEvent.create({
            data: {
              contractorMaterialId: material.id,
              contractorId: contractor.id,
              baselineVersionId: baseline.id,
              oldUnitCostCents: material.unitCostCents,
              newUnitCostCents: baseline.unitCostCents,
              oldUnitCostMilliCents: material.unitCostMilliCents,
              newUnitCostMilliCents: baseline.unitCostMilliCents,
              source: "BASELINE",
              reason: "Corrected rehearsal surface fixture box to the compatible 500/700-series metal raceway product",
              actor: "codex-electrical-rehearsal-surface-advance",
              affectedServiceIds: [],
            },
          });
        }
        if (system.declaredSystemLabel === null) {
          await tx.contractorMaterialSystem.update({ where: { id: system.id }, data: { declaredSystemLabel: SYSTEM_LABEL, declaredAt: new Date() } });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }

    if (!apply && !current) {
      console.log("  proposals require the compatible fixture-box product; report stops before service activation\n");
      return;
    }

    const calculated = await proposals(db, contractor.id);
    for (const row of calculated) {
      console.log(`  ${row.slug}: ${(row.laborHours).toFixed(3)} hr -> $${(row.totalCents / 100).toFixed(2)}`);
    }
    if (!apply) {
      console.log(`\n  would approve and activate ${calculated.length} surface services; no change\n`);
      return;
    }

    await db.$transaction(async (tx) => {
      for (const row of calculated) {
        await tx.contractorDerivedPricingApproval.upsert({
          where: { contractorId_serviceId: { contractorId: contractor.id, serviceId: row.serviceId } },
          update: {
            approvedBasisFingerprint: row.basisFingerprint,
            approvedTotalCents: row.totalCents,
            approvedLaborCents: row.laborCents,
            approvedMaterialCents: row.materialCents,
            approvedAt: new Date(),
            approvedByUserId: null,
          },
          create: {
            contractorId: contractor.id,
            serviceId: row.serviceId,
            approvedBasisFingerprint: row.basisFingerprint,
            approvedTotalCents: row.totalCents,
            approvedLaborCents: row.laborCents,
            approvedMaterialCents: row.materialCents,
            approvedAt: new Date(),
            approvedByUserId: null,
          },
        });
        await tx.service.update({
          where: { id: row.serviceId },
          data: { pricingMethod: "DERIVED_RESOLVED_SCOPE", active: true },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log(`\n  approved and activated ${calculated.length} surface services\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
