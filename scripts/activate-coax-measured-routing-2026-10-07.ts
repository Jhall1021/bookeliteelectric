/** Publish exact coax measurements for all three route choices. */
import assert from "node:assert/strict";
import { PrismaClient, type Prisma } from "@prisma/client";

import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { NUMERIC_UNKNOWN } from "../lib/numericRouteRanges";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUGS = ["electrical-onboarding-test"] as const;
const SERVICE_SLUG = "new-coax-line";
const ACCESS_KEY = `${SERVICE_SLUG}_route_access`;
const DISTANCE_KEY = `${SERVICE_SLUG}_distance`;
const EXPOSED_KEY = `${SERVICE_SLUG}_exposed_route_feet`;
const MAX_PRICEABLE_FEET = 75;
const MAX_INPUT_FEET = 200;
const SOURCE_PHOTOS = ["Where the router or existing coax source is", "Where you'd like the new coax wall plate"];
const REVIEW_PHOTOS = [...SOURCE_PHOTOS, "The complete route between the two points"];

const liveOptions = (questionId: string): Prisma.AnswerOptionCreateManyInput[] => [
  { questionId, label: "1 to 75 feet", value: "measured_route", order: 1, routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, numberAtLeast: 1, numberAtMost: MAX_PRICEABLE_FEET, requiredPhotoLabels: SOURCE_PHOTOS, approvedComponentPriceCents: 0 },
  { questionId, label: "More than 75 feet", value: "over_75", order: 2, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, numberAtLeast: MAX_PRICEABLE_FEET, numberAtLeastExclusive: true, numberAtMost: MAX_INPUT_FEET, requiredPhotoLabels: REVIEW_PHOTOS },
  { questionId, label: "I'm not sure", value: NUMERIC_UNKNOWN, order: 3, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, requiredPhotoLabels: REVIEW_PHOTOS },
];

const templateOptions = (templateQuestionId: string): Prisma.TemplateAnswerOptionCreateManyInput[] => [
  { templateQuestionId, label: "1 to 75 feet", value: "measured_route", order: 1, routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, numberAtLeast: 1, numberAtMost: MAX_PRICEABLE_FEET, requiredPhotoLabels: SOURCE_PHOTOS, illustrationUrls: [] },
  { templateQuestionId, label: "More than 75 feet", value: "over_75", order: 2, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, numberAtLeast: MAX_PRICEABLE_FEET, numberAtLeastExclusive: true, numberAtMost: MAX_INPUT_FEET, requiredPhotoLabels: REVIEW_PHOTOS, illustrationUrls: [] },
  { templateQuestionId, label: "I'm not sure", value: NUMERIC_UNKNOWN, order: 3, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, requiredPhotoLabels: REVIEW_PHOTOS, illustrationUrls: [] },
];

function wording(exposed: boolean) {
  return exposed ? {
    prompt: "How many feet will the visible coax cable run along the baseboard?",
    helpText: "Measure from the router or existing coax source to the new coax wall plate, following the baseboard and every corner.",
  } : {
    prompt: "How many feet will the coax cable travel from the router or existing coax source to the new wall plate?",
    helpText: "Measure the cable's actual route from the router or existing coax source to the new wall plate—not a straight line through the room.",
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const services = await db.service.findMany({
      where: { slug: SERVICE_SLUG, active: true, contractor: { slug: { in: [...CONTRACTOR_SLUGS] } } },
      select: { id: true, pricingMethod: true, contractor: { select: { id: true, slug: true, name: true } }, questions: { where: { key: { in: [DISTANCE_KEY, EXPOSED_KEY] } }, select: { id: true, key: true } } },
    });
    assert.equal(services.length, CONTRACTOR_SLUGS.length, "expected one active coax service per target contractor");
    for (const service of services) {
      assert.equal(service.pricingMethod, "DERIVED_RESOLVED_SCOPE");
      assert.deepEqual(new Set(service.questions.map((question) => question.key)), new Set([DISTANCE_KEY, EXPOSED_KEY]));
    }
    const templateQuestions = await db.templateQuestion.findMany({
      where: { key: { in: [DISTANCE_KEY, EXPOSED_KEY] }, templateService: { key: SERVICE_SLUG, templateVersion: { trade: "electrical" } } },
      select: { id: true, key: true },
    });
    const templateAccessQuestions = await db.templateQuestion.findMany({
      where: { key: ACCESS_KEY, templateService: { key: SERVICE_SLUG, templateVersion: { trade: "electrical" } } },
      select: { id: true },
    });

    console.log(`COAX MEASURED ROUTING — ${apply ? "APPLY" : "REPORT"}`);
    for (const service of services) console.log(`  ${service.contractor.name}/${SERVICE_SLUG}: three routes -> exact feet`);
    console.log(`  ${templateQuestions.length} electrical template question(s) will be aligned`);
    console.log(`  policy: 1–${MAX_PRICEABLE_FEET} feet priced; longer or unknown routes reviewed`);
    if (!apply) return;

    await db.$transaction(async (tx) => {
      for (const service of services) {
        const distanceQuestionId = service.questions.find((question) => question.key === DISTANCE_KEY)?.id;
        const exposedQuestionId = service.questions.find((question) => question.key === EXPOSED_KEY)?.id;
        assert.ok(distanceQuestionId && exposedQuestionId, `${service.contractor.slug}/${SERVICE_SLUG} is missing a measurement question`);
        await tx.answerOptionComponent.deleteMany({
          where: { answerOption: { value: "finished", question: { serviceId: service.id, key: ACCESS_KEY } } },
        });
        await tx.answerOption.updateMany({
          where: { question: { serviceId: service.id, key: ACCESS_KEY }, value: { in: ["accessible", "finished"] } },
          data: { routeAction: "CONTINUE", nextQuestionId: distanceQuestionId, photosBlockBooking: false, requiredPhotoLabels: [] },
        });
        await tx.answerOption.updateMany({
          where: { question: { serviceId: service.id, key: ACCESS_KEY }, value: "exposed_baseboard" },
          data: { routeAction: "CONTINUE", nextQuestionId: exposedQuestionId, photosBlockBooking: false, requiredPhotoLabels: [] },
        });
        for (const question of service.questions) {
          await tx.question.update({ where: { id: question.id }, data: { ...wording(question.key === EXPOSED_KEY), inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: MAX_INPUT_FEET } });
          await tx.answerOption.deleteMany({ where: { questionId: question.id } });
          await tx.answerOption.createMany({ data: liveOptions(question.id) });
        }
      }
      await tx.templateAnswerOptionComponent.deleteMany({
        where: {
          templateAnswerOption: {
            value: "finished",
            templateQuestion: {
              key: `${SERVICE_SLUG}_route_access`,
              templateService: { key: SERVICE_SLUG, templateVersion: { trade: "electrical" } },
            },
          },
        },
      });
      for (const accessQuestion of templateAccessQuestions) {
        await tx.templateAnswerOption.updateMany({
          where: { templateQuestionId: accessQuestion.id, value: { in: ["accessible", "finished"] } },
          data: { routeAction: "CONTINUE", nextQuestionKey: DISTANCE_KEY, photosBlockBooking: false, requiredPhotoLabels: [] },
        });
        await tx.templateAnswerOption.updateMany({
          where: { templateQuestionId: accessQuestion.id, value: "exposed_baseboard" },
          data: { routeAction: "CONTINUE", nextQuestionKey: EXPOSED_KEY, photosBlockBooking: false, requiredPhotoLabels: [] },
        });
      }
      for (const question of templateQuestions) {
        await tx.templateQuestion.update({ where: { id: question.id }, data: { ...wording(question.key === EXPOSED_KEY), inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: MAX_INPUT_FEET } });
        await tx.templateAnswerOption.deleteMany({ where: { templateQuestionId: question.id } });
        await tx.templateAnswerOption.createMany({ data: templateOptions(question.id) });
      }
    }, { timeout: 120000 });

    for (const service of services) {
      const approval = await decideDerivedPricingApproval(db, { contractorId: service.contractor.id, userId: null }, { action: "approve", serviceId: service.id });
      assert.equal(approval.status, 200, `${service.contractor.slug}/${SERVICE_SLUG} did not reapprove`);
    }
    const verified = await db.question.findMany({
      where: { serviceId: { in: services.map((service) => service.id) }, key: { in: [DISTANCE_KEY, EXPOSED_KEY] } },
      select: { inputType: true, numberMin: true, numberMax: true, options: { select: { value: true, routeAction: true, photosBlockBooking: true, numberAtLeast: true, numberAtMost: true } } },
    });
    for (const question of verified) {
      assert.equal(question.inputType, "NUMBER");
      assert.equal(question.numberMin, 1);
      assert.equal(question.numberMax, MAX_INPUT_FEET);
      const measured = question.options.find((option) => option.value === "measured_route");
      assert.ok(measured?.routeAction === "RESOLVE_ADJUSTED" && measured.numberAtLeast === 1 && measured.numberAtMost === MAX_PRICEABLE_FEET);
      assert.ok(question.options.some((option) => option.value === "over_75" && option.routeAction === "PHOTO_REVIEW" && option.photosBlockBooking));
      assert.ok(question.options.some((option) => option.value === NUMERIC_UNKNOWN && option.routeAction === "PHOTO_REVIEW" && option.photosBlockBooking));
    }
    const verifiedAccessOptions = await db.answerOption.findMany({
      where: { question: { serviceId: { in: services.map((service) => service.id) }, key: ACCESS_KEY }, value: { in: ["accessible", "finished", "exposed_baseboard"] } },
      select: { value: true, routeAction: true, nextQuestionId: true, question: { select: { serviceId: true } }, photosBlockBooking: true },
    });
    for (const option of verifiedAccessOptions) {
      assert.equal(option.routeAction, "CONTINUE", `${option.value} must continue to measurement`);
      const service = services.find((candidate) => candidate.id === option.question.serviceId);
      const expectedKey = option.value === "exposed_baseboard" ? EXPOSED_KEY : DISTANCE_KEY;
      assert.equal(option.nextQuestionId, service?.questions.find((question) => question.key === expectedKey)?.id);
      assert.equal(option.photosBlockBooking, false);
    }
    console.log(`  Published and verified ${verified.length} live questions and ${templateQuestions.length} template questions.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
