/**
 * Complete the two contractor declarations and one discrete-product geometry
 * required by the reviewed finished-wall New 120V Outlet routes.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { isRehearsalSlug } from "../lib/electrical/pilotScope";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const BOX_SOURCE = "Carlon B120R 1-gang 20-cu.-in. old-work box, The Home Depot";
const BOX_SOURCED_AT = new Date("2026-09-24T00:00:00.000Z");
const CONSUMABLE_SOURCE = "Small electrical consumables representative basket, The Home Depot";
const CAPABILITIES = ["BASEBOARD_ACCESS_REINSTALL", "DRYWALL_ACCESS_CUTTING"] as const;

const contractorIndex = process.argv.indexOf("--contractor");
const contractorSlug = contractorIndex >= 0 ? process.argv[contractorIndex + 1] : undefined;

async function main() {
  const apply = process.argv.includes("--apply");
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
    const canonical = await db.canonicalMaterial.findUniqueOrThrow({ where: { key: "BOX_OLD_WORK" }, select: { id: true, unit: true } });
    if (canonical.unit !== "each") throw new Error("BOX_OLD_WORK must be a discrete each material");
    const baseline = await db.materialBaselineVersion.findFirst({
      where: { canonicalMaterialId: canonical.id, sourceLabel: BOX_SOURCE, sourcedAt: BOX_SOURCED_AT },
      select: {
        id: true, unitCostCents: true, unitCostMilliCents: true,
        packagePriceCents: true, packageQuantity: true, packageUnit: true,
      },
    });
    if (!baseline || baseline.unitCostCents !== 398 || baseline.packagePriceCents !== 398
        || baseline.packageQuantity !== 1 || baseline.packageUnit !== "each") {
      throw new Error("corrected one-item BOX_OLD_WORK platform baseline is not installed");
    }
    const material = await db.contractorMaterial.findUniqueOrThrow({
      where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: canonical.id } },
      select: {
        id: true, unitCostCents: true, unitCostMilliCents: true,
        packagePriceCents: true, packageQuantity: true, packageUnit: true,
        costSource: true, costConfidence: true, acceptedBaselineVersionId: true,
      },
    });
    const materialCurrent = material.unitCostCents === 398 && material.packagePriceCents === 398
      && material.packageQuantity === 1 && material.packageUnit === "each"
      && material.costSource === "BASELINE" && material.costConfidence === "ASSUMED"
      && material.acceptedBaselineVersionId === baseline.id;
    const materialPrior = material.unitCostCents === 449 && material.packagePriceCents === null
      && material.packageQuantity === null && material.packageUnit === null
      && material.costSource === "BASELINE" && material.costConfidence === "ASSUMED"
      && material.acceptedBaselineVersionId !== null;
    if (!materialCurrent && !materialPrior) throw new Error("BOX_OLD_WORK contractor cost has an unrecognized state; refusing to overwrite it");

    const consumableCanonical = await db.canonicalMaterial.findUniqueOrThrow({ where: { key: "CONSUMABLES_SMALL" }, select: { id: true, unit: true } });
    if (consumableCanonical.unit !== "job") throw new Error("CONSUMABLES_SMALL must be a per-job allowance");
    const consumableBaseline = await db.materialBaselineVersion.findFirst({
      where: { canonicalMaterialId: consumableCanonical.id, sourceLabel: CONSUMABLE_SOURCE, sourcedAt: BOX_SOURCED_AT },
      select: { id: true, unitCostCents: true, unitCostMilliCents: true, packagePriceCents: true, packageQuantity: true, packageUnit: true },
    });
    if (!consumableBaseline || consumableBaseline.unitCostCents !== 300 || consumableBaseline.packagePriceCents !== 300
        || consumableBaseline.packageQuantity !== 1 || consumableBaseline.packageUnit !== "job") {
      throw new Error("corrected one-job CONSUMABLES_SMALL platform baseline is not installed");
    }
    const consumable = await db.contractorMaterial.findUniqueOrThrow({
      where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: consumableCanonical.id } },
      select: {
        id: true, unitCostCents: true, unitCostMilliCents: true,
        packagePriceCents: true, packageQuantity: true, packageUnit: true,
        costSource: true, costConfidence: true, acceptedBaselineVersionId: true,
      },
    });
    const consumableCurrent = consumable.unitCostCents === 300 && consumable.packagePriceCents === 300
      && consumable.packageQuantity === 1 && consumable.packageUnit === "job"
      && consumable.costSource === "BASELINE" && consumable.costConfidence === "ASSUMED"
      && consumable.acceptedBaselineVersionId === consumableBaseline.id;
    const consumablePrior = consumable.unitCostCents === 300 && consumable.packagePriceCents === null
      && consumable.packageQuantity === null && consumable.packageUnit === null
      && consumable.costSource === "BASELINE" && consumable.costConfidence === "ASSUMED"
      && consumable.acceptedBaselineVersionId !== null;
    if (!consumableCurrent && !consumablePrior) throw new Error("CONSUMABLES_SMALL contractor cost has an unrecognized state; refusing to overwrite it");

    const capabilities = await db.contractorCapability.findMany({
      where: { contractorId: contractor.id, key: { in: [...CAPABILITIES] } },
      select: { key: true, revokedAt: true },
    });
    if (capabilities.some((capability) => capability.revokedAt !== null)) {
      throw new Error("a finished-wall capability was explicitly revoked; refusing to reverse the contractor's answer");
    }
    const declared = new Set(capabilities.map((capability) => capability.key));
    const missingCapabilities = CAPABILITIES.filter((key) => !declared.has(key));

    console.log(`\nELECTRICAL REHEARSAL NEW-OUTLET READINESS — ${apply ? "COMPLETE" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractorSlug}`);
    console.log(`  old-work box: ${materialCurrent ? "current one-item geometry" : "would refresh dated assumed baseline"}`);
    console.log(`  small consumables: ${consumableCurrent ? "current one-job geometry" : "would refresh dated assumed baseline"}`);
    console.log(`  capability declarations: ${missingCapabilities.length ? `${apply ? "declare" : "would declare"} ${missingCapabilities.join(", ")}` : "current"}\n`);
    if (!apply) return;

    await db.$transaction(async (tx) => {
      if (!materialCurrent) {
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
            reason: "Refreshed assumed rehearsal old-work box baseline to record one-item package geometry",
            actor: "codex-electrical-rehearsal-new-outlet-readiness",
            affectedServiceIds: [],
          },
        });
      }
      if (!consumableCurrent) {
        await tx.contractorMaterial.update({
          where: { id: consumable.id },
          data: {
            unitCostCents: consumableBaseline.unitCostCents,
            unitCostMilliCents: consumableBaseline.unitCostMilliCents,
            packagePriceCents: consumableBaseline.packagePriceCents,
            packageQuantity: consumableBaseline.packageQuantity,
            packageUnit: consumableBaseline.packageUnit,
            costSource: "BASELINE",
            costConfidence: "ASSUMED",
            costStatus: "OK",
            costStatusNote: null,
            costUpdatedAt: new Date(),
            acceptedBaselineVersionId: consumableBaseline.id,
          },
        });
        await tx.materialCostEvent.create({
          data: {
            contractorMaterialId: consumable.id,
            contractorId: contractor.id,
            baselineVersionId: consumableBaseline.id,
            oldUnitCostCents: consumable.unitCostCents,
            newUnitCostCents: consumableBaseline.unitCostCents,
            oldUnitCostMilliCents: consumable.unitCostMilliCents,
            newUnitCostMilliCents: consumableBaseline.unitCostMilliCents,
            source: "BASELINE",
            reason: "Refreshed assumed rehearsal small-consumables baseline to record one-job package geometry",
            actor: "codex-electrical-rehearsal-new-outlet-readiness",
            affectedServiceIds: [],
          },
        });
      }
      if (missingCapabilities.length) {
        await tx.contractorCapability.createMany({
          data: missingCapabilities.map((key) => ({ contractorId: contractor.id, key })),
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    console.log("  new-outlet product and capability declarations are current\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
