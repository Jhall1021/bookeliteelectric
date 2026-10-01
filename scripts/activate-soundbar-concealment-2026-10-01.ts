/**
 * Replace the soundbar concealed-cable review branch with one bounded priced
 * package: two drywall openings, six feet of vertical concealed cable fishing
 * and one low-voltage ring behind the TV.
 *
 * Report only by default. Pass --apply after the production identity guard.
 */
import { PrismaClient } from "@prisma/client";
import { suggestConfigurationPrice } from "../lib/pricing";
import { loadPricingSettings } from "../lib/routeResolver";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const SERVICE_SLUG = "soundbar-installation";
const COMPONENT_KEY = "SOUNDBAR_CONCEALED_WALL_DROP";
const CONCEALMENT_FEET = 6;
const OPENING_COUNT = 2;
const DISCLAIMER =
  "This price includes two drywall openings, up to six feet of cable concealed vertically in the wall, and one low-voltage ring behind the TV. Drywall patching, sanding, primer and paint are not included.";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`refusing ${identity.endpoint}: production lineage/marker guard failed`);
  }
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const ring = await db.canonicalMaterial.findUnique({ where: { key: "LOW_VOLTAGE_RING" }, select: { id: true } });
    if (!ring) throw new Error("LOW_VOLTAGE_RING canonical material is missing");
    const canonical = apply
      ? await db.canonicalComponent.upsert({
          where: { key: COMPONENT_KEY },
          update: {
            name: "Soundbar cable concealment — one vertical wall drop",
            customerFacingLabel: "Conceal the soundbar cable inside the wall",
            notes: DISCLAIMER,
            active: true,
          },
          create: {
            key: COMPONENT_KEY,
            name: "Soundbar cable concealment — one vertical wall drop",
            customerFacingLabel: "Conceal the soundbar cable inside the wall",
            notes: DISCLAIMER,
            active: true,
          },
          select: { id: true },
        })
      : await db.canonicalComponent.findUnique({ where: { key: COMPONENT_KEY }, select: { id: true } });
    if (apply && canonical) {
      await db.canonicalComponentMaterial.upsert({
        where: {
          canonicalComponentId_canonicalMaterialId: {
            canonicalComponentId: canonical.id,
            canonicalMaterialId: ring.id,
          },
        },
        update: { quantity: 1, order: 0 },
        create: { canonicalComponentId: canonical.id, canonicalMaterialId: ring.id, quantity: 1, order: 0 },
      });
    }

    const services = await db.service.findMany({
      where: { slug: SERVICE_SLUG },
      orderBy: { contractor: { slug: "asc" } },
      select: {
        id: true,
        contractorId: true,
        contractor: { select: { slug: true } },
        materialMultiplier: true,
        laborCrewType: true,
      },
    });
    let updated = 0;
    for (const service of services) {
      const option = await db.answerOption.findFirst({
        where: {
          value: "conceal_in_wall",
          question: { serviceId: service.id, key: "soundbar_concealment" },
        },
        select: { id: true },
      });
      if (!option) {
        console.log(`${service.contractor.slug}: skipped — current soundbar concealment branch not found`);
        continue;
      }
      const [fish, opening, contractorRing, settings] = await Promise.all([
        db.contractorLaborOperationDecision.findUnique({
          where: {
            contractorId_trade_operationKey: {
              contractorId: service.contractorId,
              trade: "electrical",
              operationKey: "ELEC_FISH_CABLE_CONCEALED",
            },
          },
          select: { hoursPerUnit: true },
        }),
        db.contractorLaborOperationDecision.findUnique({
          where: {
            contractorId_trade_operationKey: {
              contractorId: service.contractorId,
              trade: "electrical",
              operationKey: "ELEC_CUT_DRYWALL_ACCESS_OPENING",
            },
          },
          select: { hoursPerUnit: true },
        }),
        db.contractorMaterial.findUnique({
          where: {
            contractorId_canonicalMaterialId: {
              contractorId: service.contractorId,
              canonicalMaterialId: ring.id,
            },
          },
          select: { unitCostCents: true, active: true },
        }),
        loadPricingSettings(db, service.contractorId),
      ]);
      if (!fish || !opening || !contractorRing?.active) {
        console.log(`${service.contractor.slug}: skipped — labor decisions or low-voltage ring cost are unresolved`);
        continue;
      }
      const hours = fish.hoursPerUnit * CONCEALMENT_FEET + opening.hoursPerUnit * OPENING_COUNT;
      const minutes = Math.ceil(hours * 60);
      const approvedPriceCents = suggestConfigurationPrice(
        {
          accessClass: null,
          accessBySlot: {},
          awaitingComponentMaterialCost: false,
          awaitingComponentLabor: false,
          awaitingComponentApproval: false,
          fieldLaborHours: hours,
          materialCostCents: contractorRing.unitCostCents,
          estimatedMinutes: minutes,
          techCount: 1,
          components: [],
          addedCrewHours: hours,
          approvedIncrementCents: 0,
          legacyModifierCents: 0,
        },
        {
          materialMultiplier: service.materialMultiplier,
          permitAdminCents: 0,
          otherDirectCostCents: 0,
          isPrimaryEligible: false,
          laborCrewType: service.laborCrewType,
        },
        settings,
        false,
      ).totalCents;
      if (approvedPriceCents === null) {
        console.log(`${service.contractor.slug}: skipped — concealment increment could not be calculated`);
        continue;
      }
      console.log(
        `${service.contractor.slug}: ${apply ? "will publish" : "ready"} concealed soundbar drop ` +
        `(${minutes} minutes, $${(approvedPriceCents / 100).toFixed(2)} increment)`,
      );
      updated++;
      if (!apply || !canonical) continue;

      await db.$transaction(async (tx) => {
        await tx.contractorComponent.upsert({
          where: {
            contractorId_canonicalComponentId: {
              contractorId: service.contractorId,
              canonicalComponentId: canonical.id,
            },
          },
          update: {
            approvedPriceCents,
            addFieldLaborHours: hours,
            addMaterialCostCents: 0,
            addScheduleMinutes: minutes,
            active: true,
            notes: DISCLAIMER,
          },
          create: {
            contractorId: service.contractorId,
            canonicalComponentId: canonical.id,
            approvedPriceCents,
            addFieldLaborHours: hours,
            addMaterialCostCents: 0,
            addScheduleMinutes: minutes,
            active: true,
            notes: DISCLAIMER,
          },
        });
        await tx.answerOption.update({
          where: { id: option.id },
          data: {
            label: "No — conceal the cable inside the wall",
            routeAction: "RESOLVE_ADJUSTED",
            photosBlockBooking: false,
            requiredPhotoLabels: [],
            approvedComponentPriceCents: null,
            disclaimer: DISCLAIMER,
          },
        });
        await tx.answerOptionPhotoGroup.deleteMany({ where: { answerOptionId: option.id } });
        await tx.answerOptionComponent.deleteMany({ where: { answerOptionId: option.id } });
        await tx.answerOptionComponent.create({
          data: { answerOptionId: option.id, canonicalComponentId: canonical.id, quantity: 1 },
        });
        await tx.service.update({
          where: { id: service.id },
          data: {
            shortDescription:
              "Mount and connect your soundbar below an already-mounted TV when power is nearby, with visible cable or a priced in-wall cable drop.",
          },
        });
      }, { timeout: 120000 });
    }

    const templateOptions = await db.templateAnswerOption.findMany({
      where: {
        value: "conceal_in_wall",
        templateQuestion: {
          key: "soundbar_concealment",
          templateService: { key: SERVICE_SLUG, templateVersion: { trade: "electrical" } },
        },
      },
      select: { id: true },
    });
    if (apply && canonical) {
      for (const option of templateOptions) {
        await db.templateAnswerOption.update({
          where: { id: option.id },
          data: {
            label: "No — conceal the cable inside the wall",
            routeAction: "RESOLVE_ADJUSTED",
            photosBlockBooking: false,
            requiredPhotoLabels: [],
          },
        });
        await db.templateAnswerOptionComponent.upsert({
          where: {
            templateAnswerOptionId_canonicalComponentId: {
              templateAnswerOptionId: option.id,
              canonicalComponentId: canonical.id,
            },
          },
          update: { quantity: 1 },
          create: { templateAnswerOptionId: option.id, canonicalComponentId: canonical.id, quantity: 1 },
        });
      }
    }
    console.log(`electrical templates: ${templateOptions.length} soundbar definition(s) ${apply ? "updated" : "ready"}`);
    console.log(apply
      ? `Published bounded soundbar concealment for ${updated} live catalog(s).`
      : "Report only. Re-run with --apply to publish the guarded catalog update.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
