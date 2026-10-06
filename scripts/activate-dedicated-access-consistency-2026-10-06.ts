/**
 * Condense the dedicated-circuit access question to the catalog's shared
 * Yes / No / I'm not sure pattern. Report-only unless --apply is supplied.
 */
import { PrismaClient } from "@prisma/client";
import {
  DEDICATED_ROUTE_ACCESS_HELP,
  DEDICATED_ROUTE_ACCESS_PROMPT,
  DEDICATED_ROUTE_ACCESS_VALUES,
} from "../lib/electrical/dedicatedCircuitAccess";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTORS = ["electrical-onboarding-test", "elite-electric"];
const SERVICE_SLUG = "dedicated-120v-circuit-outlet";
const REVIEW_PHOTOS = [
  "The electrical panel with the door open and breakers visible — leave the panel cover on",
  "The area around the electrical panel",
  "The proposed outlet location",
  "The route between the panel and outlet, including any finished walls or ceilings",
];

async function assertTree(db: PrismaClient, serviceId: string) {
  const question = await db.question.findFirstOrThrow({
    where: { serviceId, key: "dedicated_route_access" },
    select: { prompt: true, helpText: true, options: { orderBy: { order: "asc" } } },
  });
  const [yes, no, unsure] = question.options;
  if (
    question.prompt !== DEDICATED_ROUTE_ACCESS_PROMPT
    || question.helpText !== DEDICATED_ROUTE_ACCESS_HELP
    || question.options.length !== 3
    || yes?.label !== "Yes"
    || yes.value !== DEDICATED_ROUTE_ACCESS_VALUES.accessible
    || yes.routeAction !== "CONTINUE"
    || yes.accessClassification !== "ACCESSIBLE"
    || !yes.nextQuestionId
    || no?.label !== "No"
    || no.value !== DEDICATED_ROUTE_ACCESS_VALUES.finished
    || no.routeAction !== "PHOTO_REVIEW"
    || no.accessClassification !== "FINISHED"
    || unsure?.label !== "I'm not sure"
    || unsure.value !== DEDICATED_ROUTE_ACCESS_VALUES.unsure
    || unsure.routeAction !== "PHOTO_REVIEW"
    || unsure.accessClassification !== "UNKNOWN"
  ) throw new Error(`Dedicated access tree verification failed for ${serviceId}.`);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production lineage/marker guard failed.`);
  }

  const apply = process.argv.includes("--apply");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const services = await db.service.findMany({
      where: { slug: SERVICE_SLUG, active: true },
      select: { id: true, contractor: { select: { slug: true } } },
      orderBy: { contractor: { slug: "asc" } },
    });
    const actual = services.map((service) => service.contractor.slug).sort();
    if (actual.join(",") !== EXPECTED_CONTRACTORS.join(",")) {
      throw new Error(`Refusing unexpected active targets: ${actual.join(", ") || "none"}.`);
    }

    console.log(`DEDICATED ACCESS CONSISTENCY — ${apply ? "APPLY" : "REPORT"}`);
    for (const service of services) {
      const question = await db.question.findFirstOrThrow({
        where: { serviceId: service.id, key: "dedicated_route_access" },
        select: { id: true },
      });
      const distance = await db.question.findFirstOrThrow({
        where: { serviceId: service.id, key: "dedicated_distance" },
        select: { id: true },
      });
      console.log(`  ${service.contractor.slug}: ${apply ? "publishing" : "ready"}`);
      if (!apply) continue;

      await db.$transaction(async (tx) => {
        await tx.question.update({
          where: { id: question.id },
          data: { prompt: DEDICATED_ROUTE_ACCESS_PROMPT, helpText: DEDICATED_ROUTE_ACCESS_HELP },
        });
        await tx.answerOption.deleteMany({ where: { questionId: question.id } });
        await tx.answerOption.createMany({ data: [
          { questionId: question.id, label: "Yes", value: DEDICATED_ROUTE_ACCESS_VALUES.accessible, routeAction: "CONTINUE", nextQuestionId: distance.id, order: 1, requiredPhotoLabels: [], accessClassification: "ACCESSIBLE" },
          { questionId: question.id, label: "No", value: DEDICATED_ROUTE_ACCESS_VALUES.finished, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, requiredPhotoLabels: REVIEW_PHOTOS, accessClassification: "FINISHED" },
          { questionId: question.id, label: "I'm not sure", value: DEDICATED_ROUTE_ACCESS_VALUES.unsure, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS, accessClassification: "UNKNOWN" },
        ] });
      });
      await assertTree(db, service.id);
    }
    console.log(apply ? "Dedicated access question published and verified." : "Report only. Re-run with --apply to publish.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
