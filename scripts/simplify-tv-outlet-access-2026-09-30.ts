/**
 * Remove the redundant second access question from Professional TV
 * Installation and add crawl-space access to the one question that remains.
 *
 * Report-only unless --apply is supplied. Production identity is verified
 * before the Electrical Onboarding Test tree is read or changed. This never
 * touches prices, approvals, components, offered state, or bookings.
 */
import { PrismaClient } from "@prisma/client";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const CONTRACTOR_SLUG = "electrical-onboarding-test";
const SERVICE_SLUG = "tv-installation";
const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const ACCESS_PROMPT =
  "Is there an unfinished basement (or one with a drop ceiling), accessible crawl space, or attic directly above or below where the TV outlet is going?";
const ACCESS_HELP = "This determines whether we can run the wire without opening the finished wall.";
const DISTANCE_HELP =
  "Measure the path the wire would follow along the walls, basement, crawl space, attic, or ceiling—not a straight line across the room.";
const FINISH_ACK = [
  "Getting power up to the TV means running a wire inside the finished wall.",
  "Your electrician will need to make one or more openings in the drywall or plaster to fish it through. We keep them small and put them where the TV or a plate will cover them where we can, but on a finished wall they can't always be avoided.",
  "Patching, spackling, sanding, painting, wallpaper and trim aren't included unless we've put it in writing.",
  "That's why we asked about attic, basement and crawl-space access — an open route usually means no openings at all.",
].join("\n\n");

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(url);
  if (
    identity.endpoint !== EXPECTED_ENDPOINT ||
    identity.lineage !== PRODUCTION_LINEAGE ||
    identity.markerEndpoint !== EXPECTED_ENDPOINT
  ) {
    throw new Error(`Refusing ${identity.endpoint}: production identity did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: CONTRACTOR_SLUG },
      select: { id: true, name: true },
    });
    const service = await db.service.findUniqueOrThrow({
      where: { contractorId_slug: { contractorId: contractor.id, slug: SERVICE_SLUG } },
      select: {
        id: true,
        questions: {
          where: { key: { in: ["outlet_access", "outlet_finished_space", "tv_finish_ack", "tv_outlet_run_distance"] } },
          include: { options: true },
        },
      },
    });
    const byKey = new Map(service.questions.map((question) => [question.key, question]));
    const access = byKey.get("outlet_access");
    const acknowledgement = byKey.get("tv_finish_ack");
    const distance = byKey.get("tv_outlet_run_distance");
    const redundant = byKey.get("outlet_finished_space");
    if (!access || !acknowledgement || !distance) {
      throw new Error("The installed TV outlet route is missing outlet_access, tv_finish_ack, or tv_outlet_run_distance");
    }
    const yes = access.options.find((option) => option.value === "has_access");
    const no = access.options.find((option) => option.value === "no_access");
    if (!yes || !no) throw new Error("outlet_access is missing its has_access or no_access answer");

    console.log(`TV OUTLET ACCESS — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  contractor: ${contractor.name} (${CONTRACTOR_SLUG})`);
    console.log(`  crawl-space wording: ${access.prompt === ACCESS_PROMPT ? "already current" : "will update"}`);
    console.log(`  redundant question: ${redundant ? "will remove" : "already removed"}`);
    console.log(`  no-access route: ${no.nextQuestionId === acknowledgement.id ? "already direct" : "will bypass the duplicate"}`);
    if (!apply) return console.log("  Report only. Re-run with --apply to publish this routing-only change.");

    await db.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: access.id },
        data: { prompt: ACCESS_PROMPT, helpText: ACCESS_HELP },
      });
      await tx.question.update({ where: { id: acknowledgement.id }, data: { helpText: FINISH_ACK } });
      await tx.question.update({ where: { id: distance.id }, data: { helpText: DISTANCE_HELP } });
      await tx.answerOption.update({
        where: { id: yes.id },
        data: {
          routeAction: "CONTINUE",
          nextQuestionId: distance.id,
          accessClassification: "ACCESSIBLE",
          priceModifierCents: 0,
          approvedComponentPriceCents: 0,
        },
      });
      await tx.answerOption.update({
        where: { id: no.id },
        data: {
          routeAction: "CONTINUE",
          nextQuestionId: acknowledgement.id,
          accessClassification: "FINISHED",
          priceModifierCents: 0,
          approvedComponentPriceCents: 0,
        },
      });

      if (redundant) {
        await tx.answerOption.updateMany({
          where: { nextQuestionId: redundant.id },
          data: { routeAction: "CONTINUE", nextQuestionId: acknowledgement.id },
        });
        await tx.answerOption.deleteMany({ where: { questionId: redundant.id } });
        await tx.question.delete({ where: { id: redundant.id } });
      }
    });

    const [remainingDuplicate, savedNo, liveQuestionIds, continuingAnswers] = await Promise.all([
      db.question.count({ where: { serviceId: service.id, key: "outlet_finished_space" } }),
      db.answerOption.findUniqueOrThrow({ where: { id: no.id }, select: { nextQuestionId: true, accessClassification: true } }),
      db.question.findMany({ where: { serviceId: service.id }, select: { id: true } }),
      db.answerOption.findMany({
        where: { question: { serviceId: service.id }, routeAction: "CONTINUE" },
        select: { id: true, nextQuestionId: true },
      }),
    ]);
    const liveIds = new Set(liveQuestionIds.map((question) => question.id));
    const dangling = continuingAnswers.filter((option) => !option.nextQuestionId || !liveIds.has(option.nextQuestionId));
    if (remainingDuplicate !== 0) throw new Error("The redundant finished-space question still exists");
    if (savedNo.nextQuestionId !== acknowledgement.id || savedNo.accessClassification !== "FINISHED") {
      throw new Error("The No answer did not save the direct finished-wall route");
    }
    if (dangling.length > 0) throw new Error(`${dangling.length} CONTINUE answer(s) point at a missing question`);
    console.log("  Published: crawl space added; No now goes directly to the finished-wall notice; no prices changed.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
