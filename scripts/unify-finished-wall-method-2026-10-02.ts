/**
 * Replace the homeowner's baseboard-vs-drywall choice with one contractor-
 * selected finished-wall package, and publish the shared disclosure anywhere
 * a live electrical flow establishes FINISHED access.
 *
 * Report-only by default. Pass --apply after the production identity guard.
 */
import { PrismaClient } from "@prisma/client";
import { FINISHED_WALL_METHOD_DISCLOSURE } from "../lib/electrical/finishedWallDisclosure";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const METHOD_KEY = "concealed_access_method";

const isDisclosureQuestion = (key: string) =>
  key === METHOD_KEY || key.endsWith("_finish_ack") || key.endsWith("_finished_route_confirm");

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
    for (const slug of CONTRACTORS) {
      const contractor = await db.contractor.findUnique({ where: { slug }, select: { id: true } });
      if (!contractor) {
        console.log(`${slug}: skipped — contractor not found`);
        continue;
      }

      const questions = await db.question.findMany({
        where: { service: { contractorId: contractor.id } },
        select: {
          id: true,
          key: true,
          helpText: true,
          options: {
            select: {
              id: true,
              value: true,
              disclaimer: true,
              accessClassification: true,
              components: {
                select: {
                  canonicalComponentId: true,
                  quantity: true,
                  quantityAnswerKey: true,
                  conditionAnswerKey: true,
                  conditionAnswerValue: true,
                  conditionAccessClass: true,
                  conditionAccessSlot: true,
                },
              },
            },
          },
        },
      });

      const methodQuestions = questions.filter((question) => question.key === METHOD_KEY);
      const disclosureQuestions = questions.filter((question) => isDisclosureQuestion(question.key));
      const finishedOptions = questions.flatMap((question) => question.options)
        .filter((option) => option.accessClassification === "FINISHED");

      console.log(
        `${slug}: ${methodQuestions.length} method question(s), ` +
        `${disclosureQuestions.length} disclosure question(s), ${finishedOptions.length} FINISHED answer(s)`,
      );
      if (!apply) {
        const currentMethodsValid = methodQuestions.every((question) =>
          question.options.length === 1 && question.options[0]?.value === "best_practical");
        const currentWordingValid = disclosureQuestions.every((question) =>
          question.helpText === FINISHED_WALL_METHOD_DISCLOSURE);
        console.log(`${slug}: installed method ${currentMethodsValid ? "verified" : "needs update"}; shared wording ${currentWordingValid ? "verified" : "needs update"}`);
        continue;
      }

      await db.$transaction(async (tx) => {
        for (const question of methodQuestions) {
          const drywall = question.options.find((option) => option.value === "drywall_access");
          const existingBest = question.options.find((option) => option.value === "best_practical");
          const source = drywall ?? existingBest;
          if (!source) throw new Error(`${slug}/${question.id}: no conservative drywall recipe to preserve`);

          await tx.question.update({
            where: { id: question.id },
            data: {
              prompt: "How we'll route wiring through the finished wall",
              helpText: FINISHED_WALL_METHOD_DISCLOSURE,
            },
          });
          await tx.answerOption.deleteMany({ where: { questionId: question.id } });
          await tx.answerOption.create({
            data: {
              questionId: question.id,
              label: "I understand — use the best practical route",
              value: "best_practical",
              routeAction: "RESOLVE_INSTANT",
              order: 1,
              requiredPhotoLabels: [],
              approvedComponentPriceCents: null,
              disclaimer: FINISHED_WALL_METHOD_DISCLOSURE,
              components: { create: source.components.map((component) => ({
                canonicalComponentId: component.canonicalComponentId,
                quantity: component.quantity,
                quantityAnswerKey: component.quantityAnswerKey,
                conditionAnswerKey: component.conditionAnswerKey,
                conditionAnswerValue: component.conditionAnswerValue,
                conditionAccessClass: component.conditionAccessClass,
                conditionAccessSlot: component.conditionAccessSlot,
              })) },
            },
          });
        }

        for (const question of disclosureQuestions.filter((question) => question.key !== METHOD_KEY)) {
          await tx.question.update({
            where: { id: question.id },
            data: { helpText: FINISHED_WALL_METHOD_DISCLOSURE },
          });
        }

        for (const option of finishedOptions) {
          const existing = option.disclaimer?.trim();
          await tx.answerOption.update({
            where: { id: option.id },
            data: {
              disclaimer: existing?.includes(FINISHED_WALL_METHOD_DISCLOSURE)
                ? existing
                : [existing, FINISHED_WALL_METHOD_DISCLOSURE].filter(Boolean).join(" "),
            },
          });
        }

        await tx.canonicalComponent.updateMany({
          where: { key: "RESTORE_DRYWALL_ACCESS" },
          data: {
            name: "Drywall access pieces resecured",
            customerFacingLabel: "Drywall access pieces put back and secured",
            notes:
              "Retained drywall access pieces are put back and secured after wiring. " +
              "Access-opening labor already includes this work. Caulking, spackling, tape, compound, sanding, " +
              "texture matching, primer, paint, wallpaper and replacement materials are excluded.",
          },
        });
      }, { timeout: 120000 });

      const installed = await db.question.findMany({
        where: {
          service: { contractorId: contractor.id },
          OR: [
            { key: METHOD_KEY },
            { key: { endsWith: "_finish_ack" } },
            { key: { endsWith: "_finished_route_confirm" } },
          ],
        },
        select: { key: true, helpText: true, options: { select: { value: true } } },
      });
      const invalidMethod = installed.filter((question) => question.key === METHOD_KEY)
        .filter((question) => question.options.length !== 1 || question.options[0]?.value !== "best_practical");
      const staleHelp = installed.filter((question) => question.helpText !== FINISHED_WALL_METHOD_DISCLOSURE);
      if (invalidMethod.length > 0 || staleHelp.length > 0) {
        throw new Error(`${slug}: post-write verification failed (${invalidMethod.length} method, ${staleHelp.length} wording)`);
      }
      console.log(`${slug}: verified one contractor-selected method and shared wording on ${installed.length} question(s)`);
    }

    console.log(apply
      ? "Published the shared finished-wall method and disclosure."
      : "Report only. Re-run with --apply to publish the guarded catalog update.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
