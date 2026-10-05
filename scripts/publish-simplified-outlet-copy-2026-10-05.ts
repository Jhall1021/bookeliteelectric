/**
 * Publish the compact New 120V Outlet entry choices and access wording.
 * Report-only by default; pass --apply after the production identity guard.
 */
import { PrismaClient } from "@prisma/client";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";
import { FINISHED_WALL_METHOD_DISCLOSURE } from "../lib/electrical/finishedWallDisclosure";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const OUTLET_SLUG = "new-120v-outlet";
const ACCESS_PROMPT = "Is there open access above or below the outlet location?";
const ACCESS_HELP = "Choose Yes for an attic, unfinished basement, crawl space, or removable drop ceiling.";
const SURFACE_PROMPT = "Is the wall surface drywall?";
const SURFACE_HELP = "Choose No for plaster, tile, masonry, wood paneling, wallpaper, or another decorative finish.";
const COMBINED_LABEL = "A larger appliance or exercise/shop equipment";
const COMBINED_DISCLAIMER =
  "Examples include a fridge, freezer, window A/C, microwave, space heater, treadmill, compressor, or table saw. These usually need a circuit of their own.";
const BIDET_DISCLAIMER =
  "Includes the required GFCI-protected bathroom outlet. It normally uses the nearest suitable circuit.";
const RETIRED_VALUES = ["motor_appliance", "heating_appliance", "shop_equipment"];

async function updateLiveCatalog(db: PrismaClient, apply: boolean) {
  const outlets = await db.service.findMany({
    where: { slug: OUTLET_SLUG },
    select: { id: true, contractorId: true, contractor: { select: { slug: true } } },
    orderBy: { contractor: { slug: "asc" } },
  });
  let updated = 0;
  for (const outlet of outlets) {
    const [load, access, surface, dedicated] = await Promise.all([
      db.question.findFirst({ where: { serviceId: outlet.id, key: "outlet_load_type" }, select: { id: true } }),
      db.question.findFirst({ where: { serviceId: outlet.id, key: "below_above_access" }, select: { id: true } }),
      db.question.findFirst({
        where: { serviceId: outlet.id, key: "outlet_accessible_wall_surface" },
        select: {
          id: true,
          options: { select: { value: true, nextQuestionId: true, requiredPhotoLabels: true } },
        },
      }),
      db.service.findFirst({
        where: { contractorId: outlet.contractorId, slug: "dedicated-120v-circuit-outlet" },
        select: { id: true },
      }),
    ]);
    const drywall = surface?.options.find((option) => option.value === "drywall");
    const review = surface?.options.find((option) => option.value === "unsure") ??
      surface?.options.find((option) => option.value !== "drywall");
    if (!load || !access || !surface || !drywall?.nextQuestionId || !review || !dedicated) {
      console.log(`${outlet.contractor.slug}: skipped — current outlet routing tree is incomplete`);
      continue;
    }
    updated++;
    console.log(`${outlet.contractor.slug}: ${apply ? "updating" : "ready"} — 5 load choices, compact access copy, 3 surface choices`);
    if (!apply) continue;

    await db.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: access.id },
        data: { prompt: ACCESS_PROMPT, helpText: ACCESS_HELP },
      });
      await tx.answerOption.updateMany({
        where: { questionId: access.id, value: "has_access" },
        data: { label: "Yes — there is open access", disclaimer: null },
      });
      await tx.answerOption.updateMany({
        where: { questionId: access.id, value: "no_access" },
        data: {
          label: "No — it is finished space or a slab",
          disclaimer: FINISHED_WALL_METHOD_DISCLOSURE,
          accessFinishedDisclaimer: null,
        },
      });
      await tx.contractorDisclaimer.updateMany({
        where: {
          contractorId: outlet.contractorId,
          text: { contains: "We'll choose the practical method for the conditions" },
        },
        data: { text: FINISHED_WALL_METHOD_DISCLOSURE },
      });

      await tx.question.update({
        where: { id: surface.id },
        data: { prompt: SURFACE_PROMPT, helpText: SURFACE_HELP },
      });
      await tx.answerOption.deleteMany({ where: { questionId: surface.id } });
      await tx.answerOption.createMany({ data: [
        {
          questionId: surface.id, label: "Yes — drywall", value: "drywall",
          routeAction: "CONTINUE", nextQuestionId: drywall.nextQuestionId,
          order: 1, requiredPhotoLabels: [],
        },
        {
          questionId: surface.id, label: "No — another finish", value: "other_finish",
          routeAction: "PHOTO_REVIEW", photosBlockBooking: true,
          order: 2, requiredPhotoLabels: review.requiredPhotoLabels,
        },
        {
          questionId: surface.id, label: "I'm not sure", value: "unsure",
          routeAction: "PHOTO_REVIEW", photosBlockBooking: true,
          order: 3, requiredPhotoLabels: review.requiredPhotoLabels,
        },
      ] });

      await tx.answerOption.deleteMany({
        where: { questionId: load.id, value: { in: RETIRED_VALUES } },
      });
      const combined = await tx.answerOption.findFirst({
        where: { questionId: load.id, value: "dedicated_equipment" },
        select: { id: true },
      });
      const combinedData = {
        label: COMBINED_LABEL,
        disclaimer: COMBINED_DISCLAIMER,
        routeAction: "REROUTE_SERVICE" as const,
        rerouteServiceId: dedicated.id,
        nextQuestionId: null,
        referencedServiceId: null,
        requiredPhotoLabels: [] as string[],
        order: 3,
        approvedComponentPriceCents: null,
      };
      if (combined) await tx.answerOption.update({ where: { id: combined.id }, data: combinedData });
      else await tx.answerOption.create({ data: { questionId: load.id, value: "dedicated_equipment", ...combinedData } });

      await tx.answerOption.updateMany({ where: { questionId: load.id, value: "everyday" }, data: { order: 1 } });
      await tx.answerOption.updateMany({
        where: { questionId: load.id, value: "bidet" },
        data: { order: 2, disclaimer: BIDET_DISCLAIMER },
      });
      await tx.answerOption.updateMany({ where: { questionId: load.id, value: "ev" }, data: { order: 4 } });
      await tx.answerOption.updateMany({ where: { questionId: load.id, value: "unsure" }, data: { order: 5 } });
    }, { timeout: 120000 });
  }
  return updated;
}

async function updateTemplates(db: PrismaClient, apply: boolean) {
  const templates = await db.templateService.findMany({
    where: { key: OUTLET_SLUG, templateVersion: { trade: "electrical" } },
    select: {
      id: true,
      templateVersion: { select: { version: true } },
      questions: {
        where: { key: { in: ["outlet_load_type", "below_above_access", "outlet_accessible_wall_surface"] } },
        select: {
          id: true,
          key: true,
          options: { select: { value: true, nextQuestionKey: true, requiredPhotoLabels: true } },
        },
      },
    },
    orderBy: { templateVersion: { version: "asc" } },
  });
  let updated = 0;
  for (const template of templates) {
    const load = template.questions.find((question) => question.key === "outlet_load_type");
    const access = template.questions.find((question) => question.key === "below_above_access");
    const surface = template.questions.find((question) => question.key === "outlet_accessible_wall_surface");
    const drywall = surface?.options.find((option) => option.value === "drywall");
    const review = surface?.options.find((option) => option.value === "unsure") ??
      surface?.options.find((option) => option.value !== "drywall");
    if (!load || !access || !surface || !drywall?.nextQuestionKey || !review) continue;
    updated++;
    if (!apply) continue;

    await db.$transaction(async (tx) => {
      await tx.templateQuestion.update({
        where: { id: access.id },
        data: { prompt: ACCESS_PROMPT, helpText: ACCESS_HELP },
      });
      await tx.templateAnswerOption.updateMany({
        where: { templateQuestionId: access.id, value: "has_access" },
        data: { label: "Yes — there is open access" },
      });
      await tx.templateAnswerOption.updateMany({
        where: { templateQuestionId: access.id, value: "no_access" },
        data: { label: "No — it is finished space or a slab" },
      });
      await tx.templateQuestion.update({
        where: { id: surface.id },
        data: { prompt: SURFACE_PROMPT, helpText: SURFACE_HELP },
      });
      await tx.templateAnswerOption.deleteMany({ where: { templateQuestionId: surface.id } });
      await tx.templateAnswerOption.createMany({ data: [
        {
          templateQuestionId: surface.id, label: "Yes — drywall", value: "drywall",
          routeAction: "CONTINUE", nextQuestionKey: drywall.nextQuestionKey,
          order: 1, requiredPhotoLabels: [], illustrationUrls: [],
        },
        {
          templateQuestionId: surface.id, label: "No — another finish", value: "other_finish",
          routeAction: "PHOTO_REVIEW", photosBlockBooking: true,
          order: 2, requiredPhotoLabels: review.requiredPhotoLabels, illustrationUrls: [],
        },
        {
          templateQuestionId: surface.id, label: "I'm not sure", value: "unsure",
          routeAction: "PHOTO_REVIEW", photosBlockBooking: true,
          order: 3, requiredPhotoLabels: review.requiredPhotoLabels, illustrationUrls: [],
        },
      ] });
      await tx.templateAnswerOption.deleteMany({
        where: { templateQuestionId: load.id, value: { in: RETIRED_VALUES } },
      });
      await tx.templateAnswerOption.upsert({
        where: { templateQuestionId_value: { templateQuestionId: load.id, value: "dedicated_equipment" } },
        update: {
          label: COMBINED_LABEL, routeAction: "REROUTE_SERVICE", rerouteServiceKey: "dedicated-120v-circuit-outlet",
          nextQuestionKey: null, referencedServiceKey: null, order: 3, requiredPhotoLabels: [], illustrationUrls: [],
        },
        create: {
          templateQuestionId: load.id, value: "dedicated_equipment", label: COMBINED_LABEL,
          routeAction: "REROUTE_SERVICE", rerouteServiceKey: "dedicated-120v-circuit-outlet",
          order: 3, requiredPhotoLabels: [], illustrationUrls: [],
        },
      });
      await tx.templateAnswerOption.updateMany({ where: { templateQuestionId: load.id, value: "everyday" }, data: { order: 1 } });
      await tx.templateAnswerOption.updateMany({ where: { templateQuestionId: load.id, value: "bidet" }, data: { order: 2 } });
      await tx.templateAnswerOption.updateMany({ where: { templateQuestionId: load.id, value: "ev" }, data: { order: 4 } });
      await tx.templateAnswerOption.updateMany({ where: { templateQuestionId: load.id, value: "unsure" }, data: { order: 5 } });
    }, { timeout: 120000 });
  }
  console.log(`electrical templates: ${updated} definition(s) ${apply ? "updated" : "ready"}`);
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
    const updated = await updateLiveCatalog(db, apply);
    await updateTemplates(db, apply);
    console.log(apply
      ? `Published compact outlet choices and access wording to ${updated} live catalog(s).`
      : "Report only. Re-run with --apply to publish the guarded catalog update.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
