/**
 * Repair Install New Microwave routing for the two active electrical catalogs.
 *
 * - existing cabinet power: price the prepared microwave install immediately
 * - existing hood: add the contractor's established hood-removal and
 *   hood-feed-to-receptacle labor plus the box/receptacle/plate material
 * - no power: hand off to the canonical dedicated-circuit flow
 *
 * Report only by default. Pass --apply after the production identity guard.
 */
import { PrismaClient } from "@prisma/client";

import {
  calculateMicrowaveHoodConversionPricing,
  MICROWAVE_HOOD_MATERIAL_KEYS,
  MICROWAVE_HOOD_OPERATION_KEYS,
} from "../lib/electrical/microwaveHoodPricing";
import { loadPricingSettings } from "../lib/routeResolver";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const MICROWAVE_SLUG = "install-new-microwave";
const DEDICATED_SLUG = "dedicated-120v-circuit-outlet";
const QUESTION_KEY = "whats_above_range";
const HOOD_DISCLOSURE =
  "Includes removing the existing hood and converting its suitable existing feed into a boxed receptacle in the cabinet above. A new circuit, cabinet changes, vent changes and finished-surface repair are not included.";

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
    let ready = 0;
    for (const contractorSlug of CONTRACTORS) {
      const contractor = await db.contractor.findUnique({
        where: { slug: contractorSlug },
        select: { id: true },
      });
      if (!contractor) {
        console.log(`${contractorSlug}: skipped — contractor not found`);
        continue;
      }

      const [microwave, dedicated, laborDecisions, materialCosts, pricingSettings] = await Promise.all([
        db.service.findUnique({
          where: { contractorId_slug: { contractorId: contractor.id, slug: MICROWAVE_SLUG } },
          include: {
            questions: {
              where: { key: QUESTION_KEY },
              include: { options: true },
            },
          },
        }),
        db.service.findUnique({
          where: { contractorId_slug: { contractorId: contractor.id, slug: DEDICATED_SLUG } },
          select: { id: true },
        }),
        db.contractorLaborOperationDecision.findMany({
          where: {
            contractorId: contractor.id,
            trade: "electrical",
            operationKey: { in: [...MICROWAVE_HOOD_OPERATION_KEYS] },
          },
          select: { operationKey: true, hoursPerUnit: true },
        }),
        db.contractorMaterial.findMany({
          where: {
            contractorId: contractor.id,
            active: true,
            canonicalMaterial: { key: { in: [...MICROWAVE_HOOD_MATERIAL_KEYS] } },
          },
          select: { unitCostCents: true, canonicalMaterial: { select: { key: true } } },
        }),
        loadPricingSettings(db, contractor.id),
      ]);

      if (!microwave || !dedicated || microwave.questions.length !== 1) {
        console.log(`${contractorSlug}: skipped — microwave or dedicated-circuit tree is missing`);
        continue;
      }
      const byValue = new Map(microwave.questions[0].options.map((option) => [option.value, option]));
      const existingPower = byValue.get("existing_power");
      const existingHood = byValue.get("existing_hood");
      const noPower = byValue.get("no_power_no_hood");
      if (!existingPower || !existingHood || !noPower) {
        console.log(`${contractorSlug}: skipped — expected microwave answer values are missing`);
        continue;
      }

      const hood = calculateMicrowaveHoodConversionPricing({
        service: microwave,
        settings: pricingSettings,
        laborHoursByOperation: new Map(laborDecisions.map((row) => [row.operationKey, row.hoursPerUnit])),
        materialCostByKey: new Map(materialCosts.map((row) => [row.canonicalMaterial.key, row.unitCostCents])),
      });
      console.log(
        `${contractorSlug}: ${apply ? "publishing" : "ready"} — hood conversion adds ` +
        `${hood.addFieldLaborHours.toFixed(2)} labor hr, ${hood.addScheduleMinutes} min, ` +
        `$${(hood.addMaterialCostCents / 100).toFixed(2)} direct material and ` +
        `$${(hood.priceModifierCents / 100).toFixed(2)} to the customer price`,
      );
      ready++;

      if (!apply) continue;
      await db.$transaction([
        db.answerOption.update({
          where: { id: existingPower.id },
          data: {
            routeAction: "RESOLVE_INSTANT",
            nextQuestionId: null,
            rerouteServiceId: null,
            priceModifierCents: 0,
            addFieldLaborHours: null,
            addMaterialCostCents: null,
            addScheduleMinutes: null,
            requiredPhotoLabels: [],
            photosBlockBooking: false,
            disclaimer: null,
          },
        }),
        db.answerOption.update({
          where: { id: existingHood.id },
          data: {
            routeAction: "RESOLVE_ADJUSTED",
            nextQuestionId: null,
            rerouteServiceId: null,
            priceModifierCents: hood.priceModifierCents,
            addFieldLaborHours: hood.addFieldLaborHours,
            addMaterialCostCents: hood.addMaterialCostCents,
            addScheduleMinutes: hood.addScheduleMinutes,
            requiredPhotoLabels: [],
            photosBlockBooking: false,
            disclaimer: HOOD_DISCLOSURE,
          },
        }),
        db.answerOption.update({
          where: { id: noPower.id },
          data: {
            routeAction: "REROUTE_SERVICE",
            nextQuestionId: null,
            rerouteServiceId: dedicated.id,
            priceModifierCents: 0,
            addFieldLaborHours: null,
            addMaterialCostCents: null,
            addScheduleMinutes: null,
            requiredPhotoLabels: [],
            photosBlockBooking: false,
            disclaimer: null,
          },
        }),
      ]);
    }

    console.log(apply
      ? `Published the microwave routing repair to ${ready} catalog(s).`
      : `Report only: ${ready} catalog(s) are ready. Re-run with --apply to publish.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
