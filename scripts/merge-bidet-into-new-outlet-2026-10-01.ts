/**
 * Retire the standalone bidet/smart-toilet storefront entry and place that
 * choice inside New 120V Outlet. Historical services and customer snapshots
 * remain intact; the old service is deactivated, never deleted.
 *
 * Report only by default. Pass --apply after the production identity guard.
 */
import { PrismaClient } from "@prisma/client";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const OUTLET_SLUG = "new-120v-outlet";
const RETIRED_SLUG = "bidet-smart-toilet-outlet";
const DESCRIPTION =
  "A new outlet where you need one, powered from the nearest suitable circuit. Right for everyday things — lamps, a TV, chargers, a computer, or a bidet seat or smart toilet. Bathroom locations include the required GFCI-protected receptacle. If it's for a fridge, freezer, air conditioner or another high-draw appliance, see Dedicated Circuit & Outlet.";
const BIDET_LABEL = "A bidet seat or smart toilet";
const BIDET_DISCLAIMER =
  "This uses the nearest suitable circuit like a normal added outlet. We'll include the required GFCI-protected bathroom receptacle; it does not need its own dedicated circuit.";
const LOAD_ORDER: Record<string, number> = {
  everyday: 1,
  bidet: 2,
  motor_appliance: 3,
  heating_appliance: 4,
  shop_equipment: 5,
  ev: 6,
  unsure: 7,
};

async function updateLiveCatalog(db: PrismaClient, apply: boolean) {
  const outlets = await db.service.findMany({
    where: { slug: OUTLET_SLUG },
    select: { id: true, contractorId: true, contractor: { select: { slug: true } } },
    orderBy: { contractor: { slug: "asc" } },
  });
  let migrated = 0;
  for (const outlet of outlets) {
    const [load, entry] = await Promise.all([
      db.question.findFirst({ where: { serviceId: outlet.id, key: "outlet_load_type" }, select: { id: true } }),
      db.question.findFirst({ where: { serviceId: outlet.id, key: "below_above_access" }, select: { id: true } }),
    ]);
    if (!load || !entry) {
      console.log(`${outlet.contractor.slug}: skipped — New 120V Outlet does not carry the current measured route tree`);
      continue;
    }
    console.log(`${outlet.contractor.slug}: ${apply ? "will merge" : "ready to merge"} bidet scope into New 120V Outlet`);
    migrated++;
    if (!apply) continue;

    await db.$transaction(async (tx) => {
      for (const [value, order] of Object.entries(LOAD_ORDER)) {
        await tx.answerOption.updateMany({ where: { questionId: load.id, value }, data: { order } });
      }
      const existing = await tx.answerOption.findFirst({
        where: { questionId: load.id, value: "bidet" }, select: { id: true },
      });
      const data = {
        label: BIDET_LABEL,
        disclaimer: BIDET_DISCLAIMER,
        routeAction: "CONTINUE" as const,
        nextQuestionId: entry.id,
        rerouteServiceId: null,
        referencedServiceId: null,
        requiredPhotoLabels: [] as string[],
        photosBlockBooking: false,
        order: LOAD_ORDER.bidet,
        approvedComponentPriceCents: 0,
      };
      if (existing) await tx.answerOption.update({ where: { id: existing.id }, data });
      else await tx.answerOption.create({ data: { questionId: load.id, value: "bidet", ...data } });

      await tx.service.update({ where: { id: outlet.id }, data: { shortDescription: DESCRIPTION } });
      await tx.service.updateMany({
        where: { contractorId: outlet.contractorId, slug: RETIRED_SLUG },
        data: { active: false, offered: false },
      });

      const dedicated = await tx.service.findFirst({
        where: { contractorId: outlet.contractorId, slug: "dedicated-120v-circuit-outlet" },
        select: { id: true },
      });
      if (dedicated) {
        await tx.answerOption.deleteMany({
          where: { value: "bidet", question: { serviceId: dedicated.id, key: "dedicated_equipment" } },
        });
        const remaining = await tx.answerOption.findMany({
          where: { question: { serviceId: dedicated.id, key: "dedicated_equipment" } },
          orderBy: { order: "asc" }, select: { id: true },
        });
        for (const [index, answer] of remaining.entries()) {
          await tx.answerOption.update({ where: { id: answer.id }, data: { order: index + 1 } });
        }
      }
    }, { timeout: 120000 });
  }
  return migrated;
}

async function updateTemplates(db: PrismaClient, apply: boolean) {
  const templates = await db.templateService.findMany({
    where: { key: OUTLET_SLUG, templateVersion: { trade: "electrical" } },
    select: {
      id: true,
      templateVersion: { select: { version: true } },
      questions: { where: { key: { in: ["outlet_load_type", "below_above_access"] } }, select: { id: true, key: true } },
    },
    orderBy: { templateVersion: { version: "asc" } },
  });
  let updated = 0;
  for (const template of templates) {
    const load = template.questions.find((question) => question.key === "outlet_load_type");
    const entry = template.questions.find((question) => question.key === "below_above_access");
    if (!load || !entry) continue;
    updated++;
    if (!apply) continue;
    for (const [value, order] of Object.entries(LOAD_ORDER)) {
      await db.templateAnswerOption.updateMany({ where: { templateQuestionId: load.id, value }, data: { order } });
    }
    await db.templateAnswerOption.upsert({
      where: { templateQuestionId_value: { templateQuestionId: load.id, value: "bidet" } },
      update: {
        label: BIDET_LABEL, routeAction: "CONTINUE", nextQuestionKey: entry.key,
        rerouteServiceKey: null, requiredPhotoLabels: [], photosBlockBooking: false,
        illustrationUrls: [], order: LOAD_ORDER.bidet,
      },
      create: {
        templateQuestionId: load.id, value: "bidet", label: BIDET_LABEL,
        routeAction: "CONTINUE", nextQuestionKey: entry.key,
        requiredPhotoLabels: [], photosBlockBooking: false, illustrationUrls: [], order: LOAD_ORDER.bidet,
      },
    });
  }
  if (apply) {
    await db.templateAnswerOption.deleteMany({
      where: {
        value: "bidet",
        templateQuestion: {
          key: "dedicated_equipment",
          templateService: { key: "dedicated-120v-circuit-outlet", templateVersion: { trade: "electrical" } },
        },
      },
    });
  }
  console.log(`electrical templates: ${updated} New 120V Outlet definition(s) ${apply ? "updated" : "ready"}`);
}

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
    const migrated = await updateLiveCatalog(db, apply);
    await updateTemplates(db, apply);
    console.log(apply
      ? `Bidet/smart-toilet scope merged into ${migrated} live New 120V Outlet catalog(s).`
      : "Report only. Re-run with --apply to publish the guarded catalog update.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
