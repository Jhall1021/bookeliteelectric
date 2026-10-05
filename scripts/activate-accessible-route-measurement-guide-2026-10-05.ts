/**
 * Publish the concise accessible-route measurement instructions alongside the
 * dedicated illustration. Report only by default; pass --apply after the
 * production identity guard succeeds.
 */
import { PrismaClient } from "@prisma/client";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const QUESTION_KEY = "accessible_route_feet";
const HELP_TEXT =
  "Give your best rough estimate in feet. Estimate from the area above or below the existing power source to the area above or below the new location.";

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
    const questions = await db.question.findMany({
      where: {
        key: QUESTION_KEY,
        service: { contractor: { slug: { in: [...CONTRACTORS] } } },
      },
      select: {
        id: true,
        service: { select: { slug: true, contractor: { select: { slug: true } } } },
      },
      orderBy: [{ service: { contractor: { slug: "asc" } } }, { service: { slug: "asc" } }],
    });
    const templateQuestions = await db.templateQuestion.findMany({
      where: {
        key: QUESTION_KEY,
        templateService: { templateVersion: { trade: "electrical" } },
      },
      select: { id: true },
    });

    console.log(`${questions.length} live accessible-route question(s) and ${templateQuestions.length} electrical template question(s) ${apply ? "will be updated" : "are ready"}.`);
    for (const question of questions) {
      console.log(`${question.service.contractor.slug}/${question.service.slug}`);
    }

    if (apply) {
      await db.$transaction([
        db.question.updateMany({
          where: { id: { in: questions.map((question) => question.id) } },
          data: { helpText: HELP_TEXT },
        }),
        db.templateQuestion.updateMany({
          where: { id: { in: templateQuestions.map((question) => question.id) } },
          data: { helpText: HELP_TEXT },
        }),
      ]);
      console.log("Accessible-route measurement copy published.");
    } else {
      console.log("Report only. Re-run with --apply to publish the guarded catalog update.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
