/**
 * Closes three structural material-recipe gaps in the designated electrical
 * rehearsal branch:
 *
 * - restores the complete bounded new-exterior-light question tree and its
 *   fixed exterior-box/consumables recipe;
 * - links one contractor-supplied tilting mount to tilt-tv-mount;
 * - links one contractor-supplied full-motion mount to articulating-tv-mount.
 *
 * The three costs come only from dated platform retail baselines. No value is
 * copied from the rehearsal contractor. The two mount prices are then
 * recalculated from the accepted baseline plus their atomic 0.9-hour labor
 * recipes and explicitly approved in this disposable rehearsal catalog.
 *
 * Report only:
 *   npx tsx scripts/adopt-electrical-rehearsal-material-recipes-2026-09-24.ts \
 *     --contractor rv2-pilot-rehearsal-manual-0922
 * Apply:
 *   npx tsx scripts/adopt-electrical-rehearsal-material-recipes-2026-09-24.ts \
 *     --contractor rv2-pilot-rehearsal-manual-0922 --apply
 */
import { PrismaClient } from "@prisma/client";
import { ELECTRICAL_RECIPE_GAP_BASELINES } from "../lib/electrical/materialRecipeGapBaselines";
import { PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { acceptMaterialBaselineVersion, recomputeServiceMaterialCost } from "../lib/materialCost";
import { suggestPrimaryPrice, suggestWwtPrice } from "../lib/pricing";
import { seedNewExteriorLightLocation } from "../prisma/seed-new-exterior-light-location";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const APPLY = process.argv.includes("--apply");
const contractorIndex = process.argv.indexOf("--contractor");
const contractorSlug = contractorIndex >= 0 ? process.argv[contractorIndex + 1] : undefined;

const MOUNT_RECIPES = [
  { slug: "tilt-tv-mount", roleKey: "TV_MOUNT_TILT_STANDARD" },
  { slug: "articulating-tv-mount", roleKey: "TV_MOUNT_FULL_MOTION_STANDARD" },
] as const;

async function main() {
  if (!contractorSlug || !contractorSlug.startsWith(PILOT_REHEARSAL_PREFIX)) {
    throw new Error(`--contractor must name a ${PILOT_REHEARSAL_PREFIX} rehearsal contractor`);
  }
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT ||
      identity.lineage !== PRODUCTION_LINEAGE ||
      identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
    const services = await db.service.findMany({
      where: { contractorId: contractor.id, slug: { in: ["new-exterior-lighting-locations", ...MOUNT_RECIPES.map((row) => row.slug)] } },
      select: { id: true, slug: true, materials: { select: { quantity: true, canonicalMaterial: { select: { key: true } } } } },
    });
    if (services.length !== 3) throw new Error(`expected all three target services, found ${services.length}`);
    for (const target of MOUNT_RECIPES) {
      const service = services.find((row) => row.slug === target.slug)!;
      const exact = service.materials.length === 1 && service.materials[0].canonicalMaterial?.key === target.roleKey && service.materials[0].quantity === 1;
      if (service.materials.length > 0 && !exact) throw new Error(`${target.slug} already has a different material recipe; refusing to replace it`);
    }

    const existingRoles = await db.canonicalMaterial.findMany({
      where: { key: { in: ELECTRICAL_RECIPE_GAP_BASELINES.map((row) => row.key) } },
      select: { id: true, key: true, unit: true, contractorMaterials: { where: { contractorId: contractor.id }, select: { costSource: true, acceptedBaselineVersionId: true } } },
    });
    for (const role of existingRoles) {
      const definition = ELECTRICAL_RECIPE_GAP_BASELINES.find((row) => row.key === role.key)!;
      if (role.unit !== definition.unit) throw new Error(`${role.key} uses ${role.unit}, expected ${definition.unit}`);
      const current = role.contractorMaterials[0];
      if (current && current.costSource !== "BASELINE") {
        throw new Error(`${role.key} already has contractor-authored economics; refusing to replace it with a platform baseline`);
      }
    }

    console.log(`\nELECTRICAL REHEARSAL MATERIAL-RECIPE ADOPTION — ${APPLY ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractorSlug}`);
    for (const definition of ELECTRICAL_RECIPE_GAP_BASELINES) {
      const role = existingRoles.find((row) => row.key === definition.key);
      console.log(`  ${role ? "role exists" : "would create"} ${definition.key}: $${(definition.unitCostCents / 100).toFixed(2)}/${definition.unit} platform retail baseline`);
    }
    console.log(`  exterior light: ${services.find((row) => row.slug === "new-exterior-lighting-locations")!.materials.length ? "recipe exists; would rebuild canonical tree" : "would restore canonical tree and box/consumables recipe"}`);
    for (const target of MOUNT_RECIPES) {
      const service = services.find((row) => row.slug === target.slug)!;
      console.log(`  ${target.slug}: ${service.materials.length ? "recipe already exact" : `would add ${target.roleKey} ×1`}`);
    }
    if (!APPLY) {
      console.log("\n  Report only. Nothing changed.\n");
      return;
    }

    const roleIds = new Map<string, string>();
    for (const definition of ELECTRICAL_RECIPE_GAP_BASELINES) {
      const role = await db.canonicalMaterial.upsert({
        where: { key: definition.key },
        update: { name: definition.canonicalName, unit: definition.unit, notes: definition.canonicalNotes },
        create: { key: definition.key, name: definition.canonicalName, unit: definition.unit, notes: definition.canonicalNotes },
        select: { id: true },
      });
      roleIds.set(definition.key, role.id);
      let baseline = await db.materialBaselineVersion.findFirst({
        where: { canonicalMaterialId: role.id, sourceLabel: definition.sourceLabel, sourcedAt: definition.sourcedAt },
        select: { id: true, unitCostCents: true, unit: true },
      });
      if (baseline && (baseline.unitCostCents !== definition.unitCostCents || baseline.unit !== definition.unit)) {
        throw new Error(`${definition.key} has a conflicting baseline at the same source/date`);
      }
      baseline ??= await db.materialBaselineVersion.create({
        data: {
          canonicalMaterialId: role.id,
          unitCostCents: definition.unitCostCents,
          unitCostMilliCents: definition.unitCostCents * 1000,
          unit: definition.unit,
          sourceLabel: definition.sourceLabel,
          sourceUrl: definition.sourceUrl,
          specNote: definition.specNote,
          sourcedAt: definition.sourcedAt,
        },
        select: { id: true, unitCostCents: true, unit: true },
      });
      const current = await db.contractorMaterial.findUnique({
        where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: role.id } },
        select: { costSource: true, acceptedBaselineVersionId: true },
      });
      if (!current) {
        const accepted = await acceptMaterialBaselineVersion(
          db,
          { contractorId: contractor.id, baselineVersionId: baseline.id },
          { reason: "Accepted dated online retail baseline while restoring omitted rehearsal recipes", actor: "codex-electrical-rehearsal-recipe-adoption" },
        );
        if (!accepted.ok) throw new Error(`${definition.key}: baseline acceptance failed (${accepted.code})`);
      } else if (current.costSource !== "BASELINE" || current.acceptedBaselineVersionId !== baseline.id) {
        throw new Error(`${definition.key} resolved to a different contractor value during apply; refusing`);
      }
    }

    await seedNewExteriorLightLocation(db, contractorSlug);
    for (const target of MOUNT_RECIPES) {
      const service = await db.service.findUniqueOrThrow({ where: { contractorId_slug: { contractorId: contractor.id, slug: target.slug } }, select: { id: true } });
      const count = await db.serviceMaterial.count({ where: { serviceId: service.id } });
      if (count === 0) {
        await db.serviceMaterial.create({
          data: { serviceId: service.id, canonicalMaterialId: roleIds.get(target.roleKey)!, quantity: 1, order: 0 },
        });
      }
    }

    const targetServices = await db.service.findMany({
      where: { contractorId: contractor.id, slug: { in: ["new-exterior-lighting-locations", ...MOUNT_RECIPES.map((row) => row.slug)] } },
    });
    for (const service of targetServices) await recomputeServiceMaterialCost(db, service.id);

    const settings = await db.pricingSettings.findUniqueOrThrow({ where: { contractorId: contractor.id } });
    for (const target of MOUNT_RECIPES) {
      const service = await db.service.findUniqueOrThrow({ where: { contractorId_slug: { contractorId: contractor.id, slug: target.slug } } });
      if (!service.materialCostResolved || service.materialCostCents === null || service.fieldLaborHours === null || service.wwtLaborHours === null) {
        throw new Error(`${target.slug} is not fully priceable after recipe adoption`);
      }
      const primary = suggestPrimaryPrice(service as never, settings as never);
      const wwt = suggestWwtPrice(service as never, settings as never);
      if (primary.totalCents === null || wwt.totalCents === null) {
        throw new Error(`${target.slug} did not produce complete primary/add-on price suggestions`);
      }
      await db.service.update({
        where: { id: service.id },
        data: {
          basePrice: primary.totalCents,
          whileWeThereBasePrice: wwt.totalCents,
          publishedPriceApprovedAt: new Date(),
          active: true,
          offered: true,
        },
      });
      console.log(`  approved ${target.slug}: $${(primary.totalCents / 100).toFixed(2)} primary / $${(wwt.totalCents / 100).toFixed(2)} add-on`);
    }
    console.log("\n  Applied sourced baselines, canonical recipes and recalculated rehearsal mount prices.\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
