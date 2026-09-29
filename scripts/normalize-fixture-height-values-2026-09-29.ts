/**
 * Repair installed fixture-height questions whose customer-facing labels were
 * updated to the canonical 10/12/14-foot bands while their stored values were
 * left on the older under_8/9_10/11_12 bands.
 *
 * The pricing engine consumes the value, not the label. The stale combination
 * therefore made 11-12 feet price like the base band and 13-14 feet receive
 * only the 11-12-foot labor increase.
 *
 * Report-only by default. Production apply requires --apply and an exact
 * endpoint/lineage/marker match.
 */
import { PrismaClient } from "@prisma/client";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";

const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";

const REPAIR = [
  { label: "10 feet or less", staleValue: "under_8", canonicalValue: "under_10" },
  { label: "11 to 12 feet", staleValue: "9_10", canonicalValue: "11_12" },
  { label: "13 to 14 feet", staleValue: "11_12", canonicalValue: "13_14" },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const targetUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");

  const identity = await probe(targetUrl);
  if (
    identity.endpoint !== EXPECTED_PRODUCTION_ENDPOINT
    || identity.lineage !== PRODUCTION_LINEAGE
    || identity.markerEndpoint !== EXPECTED_PRODUCTION_ENDPOINT
  ) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const questions = await db.question.findMany({
      where: { key: "fixture_height" },
      select: {
        id: true,
        service: {
          select: {
            slug: true,
            active: true,
            contractor: { select: { slug: true } },
          },
        },
        options: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            label: true,
            value: true,
            routeAction: true,
            nextQuestionId: true,
          },
        },
      },
      orderBy: [{ service: { contractorId: "asc" } }, { service: { slug: "asc" } }],
    });

    const plans = questions.flatMap((question) => {
      const rows = REPAIR.map((band) => ({
        band,
        option: question.options.find((option) => option.label === band.label),
      }));
      if (rows.some(({ option }) => !option)) return [];

      const present = rows.map(({ band, option }) => ({ band, option: option! }));
      const isAlreadyCanonical = present.every(({ band, option }) => option.value === band.canonicalValue);
      if (isAlreadyCanonical) return [];

      const isKnownStaleShape = present.every(({ band, option }) =>
        option.value === band.staleValue
        && option.routeAction === "CONTINUE"
        && option.nextQuestionId !== null,
      );
      const nextTargets = new Set(present.map(({ option }) => option.nextQuestionId));
      if (!isKnownStaleShape || nextTargets.size !== 1) {
        throw new Error(
          `${question.service.contractor.slug}/${question.service.slug}: `
          + "fixture-height labels are present but values or routing are not the known stale shape",
        );
      }

      return [{ question, rows: present }];
    });

    console.log(`FIXTURE HEIGHT VALUE NORMALIZATION — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    for (const plan of plans) {
      const service = plan.question.service;
      console.log(
        `  ${service.contractor.slug}/${service.slug}${service.active ? "" : " (inactive)"}: `
        + plan.rows.map(({ band }) => `${band.staleValue} → ${band.canonicalValue}`).join(", "),
      );
    }
    if (!apply) {
      console.log(`  Report only. Re-run with --apply to update ${plans.length} question(s).`);
      return;
    }

    for (const plan of plans) {
      await db.$transaction(
        plan.rows.map(({ band, option }) => db.answerOption.update({
          where: { id: option.id },
          data: { value: band.canonicalValue },
        })),
      );
    }
    console.log(`  Updated ${plans.length} installed fixture-height question(s).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
