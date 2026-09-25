/** Reconcile the onboarding test catalog with the reviewed outlet route models. */
import { PrismaClient } from "@prisma/client";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const CONTRACTOR_SLUG = "electrical-onboarding-test";
const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const GARAGE = [
  { slug: "240v-garage-outlet", question: "garage_prongs_30", value: "p3" },
  { slug: "240v-garage-outlet-14-30", question: "garage_prongs_30", value: "p4" },
  { slug: "240v-garage-outlet-6-50", question: "garage_prongs_50", value: "p3" },
  { slug: "240v-garage-outlet-14-50", question: "garage_prongs_50", value: "p4" },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production identity did not match.`);
  }
  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: CONTRACTOR_SLUG }, select: { id: true, name: true } });
    const slugs = GARAGE.map((row) => row.slug);
    const [services, templateServices, bidet, outlet] = await Promise.all([
      db.service.findMany({ where: { contractorId: contractor.id, slug: { in: slugs } }, select: { id: true, slug: true, pricingMethod: true } }),
      db.templateService.findMany({ where: { key: { in: slugs }, templateVersion: { trade: "electrical" } }, select: { id: true, key: true, pricingMethod: true } }),
      db.service.findUniqueOrThrow({ where: { contractorId_slug: { contractorId: contractor.id, slug: "bidet-smart-toilet-outlet" } }, select: { id: true } }),
      db.service.findUniqueOrThrow({ where: { contractorId_slug: { contractorId: contractor.id, slug: "new-120v-outlet" } }, select: { id: true } }),
    ]);
    if (services.length !== 4) throw new Error(`Expected four installed garage services; found ${services.length}.`);
    console.log(`ROUTE-PRICED OUTLETS — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  contractor: ${contractor.name} (${CONTRACTOR_SLUG})`);
    console.log(`  garage services: ${services.length}; template definitions: ${templateServices.length}`);
    console.log("  bidet handoff: dedicated circuit -> general new-outlet route");
    if (!apply) return console.log("  Report only. Re-run with --apply to reconcile; no prices will be published.");

    await db.$transaction(async (tx) => {
      await tx.service.updateMany({ where: { id: { in: services.map((row) => row.id) } }, data: { pricingMethod: "DERIVED_RESOLVED_SCOPE", bookingType: "ADJUSTED" } });
      await tx.templateService.updateMany({ where: { id: { in: templateServices.map((row) => row.id) } }, data: { pricingMethod: "DERIVED_RESOLVED_SCOPE", bookingType: "ADJUSTED" } });
      for (const config of GARAGE) {
        await tx.question.updateMany({
          where: { service: { contractorId: contractor.id, slug: config.slug }, key: "garage_panel" },
          data: { prompt: "Is your electrical panel in the same garage and within 25 feet of the new outlet?", helpText: "The online price covers a cable route up to 25 feet that stays inside the same garage." },
        });
        await tx.answerOption.updateMany({
          where: { question: { service: { contractorId: contractor.id, slug: config.slug }, key: "garage_panel" }, value: "in_garage" },
          data: { label: "Yes — same garage and within 25 feet" },
        });
        await tx.templateQuestion.updateMany({
          where: { templateService: { key: config.slug, templateVersion: { trade: "electrical" } }, key: "garage_panel" },
          data: { prompt: "Is your electrical panel in the same garage and within 25 feet of the new outlet?", helpText: "The online price covers a cable route up to 25 feet that stays inside the same garage." },
        });
        await tx.templateAnswerOption.updateMany({
          where: { templateQuestion: { templateService: { key: config.slug, templateVersion: { trade: "electrical" } }, key: "garage_panel" }, value: "in_garage" },
          data: { label: "Yes — same garage and within 25 feet" },
        });
        await tx.answerOption.updateMany({
          where: { question: { service: { contractorId: contractor.id, slug: config.slug }, key: config.question }, value: config.value },
          data: { routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, approvedComponentPriceCents: 0 },
        });
        await tx.templateAnswerOption.updateMany({
          where: { templateQuestion: { templateService: { key: config.slug, templateVersion: { trade: "electrical" } }, key: config.question }, value: config.value },
          data: { routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false },
        });
      }
      await tx.question.updateMany({ where: { serviceId: bidet.id, key: "dedicated_equipment" }, data: { prompt: "Add a new outlet for your bidet or smart toilet?", helpText: "We’ll use the same route questions as a general-purpose new outlet. Bathroom protection requirements remain part of the material scope." } });
      await tx.answerOption.updateMany({ where: { question: { serviceId: bidet.id, key: "dedicated_equipment" }, value: "bidet" }, data: { rerouteServiceId: outlet.id } });
      await tx.templateQuestion.updateMany({ where: { templateService: { key: "bidet-smart-toilet-outlet", templateVersion: { trade: "electrical" } }, key: "dedicated_equipment" }, data: { prompt: "Add a new outlet for your bidet or smart toilet?", helpText: "We’ll use the same route questions as a general-purpose new outlet. Bathroom protection requirements remain part of the material scope." } });
      await tx.templateAnswerOption.updateMany({ where: { templateQuestion: { templateService: { key: "bidet-smart-toilet-outlet", templateVersion: { trade: "electrical" } }, key: "dedicated_equipment" }, value: "bidet" }, data: { rerouteServiceKey: "new-120v-outlet" } });
    });
    console.log("  Reconciled. No service price was approved or published.");
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
