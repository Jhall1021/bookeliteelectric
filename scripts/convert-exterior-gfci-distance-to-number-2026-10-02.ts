/**
 * Convert the installed exterior-outlet distance question from broad buttons
 * to an exact numeric measurement. Report-only unless --apply is supplied.
 *
 * The existing option ids are retained so their component recipes and pricing
 * approvals remain attached. Numeric predicates simply select those same
 * pricing bands from the customer's entered footage.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { NUMERIC_UNKNOWN } from "../lib/numericRouteRanges";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUGS = ["elite-electric", "electrical-onboarding-test"];
const SERVICE_SLUG = "exterior-gfci-other-routing";
const QUESTION_KEY = "ext_gfci_distance";
const SHORT_DESCRIPTION = "A weatherproof outdoor outlet where there isn't an outlet directly behind the wall to tap into. We extend wiring from the nearest suitable interior outlet.";

const RANGES = [
  { value: "under_10", label: "Up to 10 feet", min: 1, max: 10, open: false, order: 1 },
  { value: "10_to_20", label: "More than 10 feet, up to 20 feet", min: 10, max: 20, open: true, order: 2 },
  { value: "over_20", label: "More than 20 feet", min: 20, max: 200, open: true, order: 3 },
] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");

  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const targets = await db.service.findMany({
      where: {
        slug: SERVICE_SLUG,
        contractor: { slug: { in: CONTRACTOR_SLUGS } },
      },
      select: {
        id: true,
        shortDescription: true,
        contractor: { select: { slug: true, name: true } },
        questions: {
          where: { key: QUESTION_KEY },
          select: {
            id: true,
            inputType: true,
            numberAllowsDecimal: true,
            numberMin: true,
            numberMax: true,
            options: { select: { id: true, value: true, label: true } },
          },
        },
      },
    });

    assert.equal(targets.length, CONTRACTOR_SLUGS.length, "expected the exterior-outlet service for both production contractors");
    for (const target of targets) {
      assert.equal(target.questions.length, 1, `${target.contractor.slug}: expected one ${QUESTION_KEY} question`);
      const values = target.questions[0].options.map((option) => option.value);
      for (const range of RANGES) assert.ok(values.includes(range.value), `${target.contractor.slug}: missing ${range.value}`);
      assert.ok(values.includes("unsure") || values.includes(NUMERIC_UNKNOWN), `${target.contractor.slug}: missing uncertainty option`);
    }

    console.log(`EXTERIOR OUTLET EXACT DISTANCE — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    for (const target of targets) {
      const question = target.questions[0];
      console.log(`  ${target.contractor.name}: ${question.inputType}, ${question.options.map((option) => option.value).join(", ")}; description ${target.shortDescription === SHORT_DESCRIPTION ? "current" : "needs update"}`);
    }
    if (!apply) {
      console.log("  Report only. Re-run with --apply to install the exact-feet question.");
      return;
    }

    await db.$transaction(async (tx) => {
      for (const target of targets) {
        const question = target.questions[0];
        await tx.service.update({
          where: { id: target.id },
          data: { shortDescription: SHORT_DESCRIPTION },
        });
        await tx.question.update({
          where: { id: question.id },
          data: {
            prompt: "How many feet is the new outdoor outlet from the power we'd run it from?",
            helpText: "Measure the path the wire would take rather than a straight line — through the basement or attic, or along the wall.",
            inputType: "NUMBER",
            numberAllowsDecimal: true,
            numberMin: 1,
            numberMax: 200,
          },
        });

        for (const range of RANGES) {
          const option = question.options.find((candidate) => candidate.value === range.value)!;
          await tx.answerOption.update({
            where: { id: option.id },
            data: {
              label: range.label,
              order: range.order,
              numberAtLeast: range.min,
              numberAtMost: range.max,
              numberAtLeastExclusive: range.open,
            },
          });
        }

        const canonicalUnknown = question.options.find((option) => option.value === NUMERIC_UNKNOWN);
        const legacyUnknown = question.options.find((option) => option.value === "unsure");
        assert.ok(!(canonicalUnknown && legacyUnknown), `${target.contractor.slug}: duplicate uncertainty options require manual review`);
        const unknown = canonicalUnknown ?? legacyUnknown!;
        await tx.answerOption.update({
          where: { id: unknown.id },
          data: {
            value: NUMERIC_UNKNOWN,
            label: "I'm not sure",
            order: 99,
            numberAtLeast: null,
            numberAtMost: null,
            numberAtLeastExclusive: false,
          },
        });
      }
    });

    console.log("  Applied: customers now enter exact feet, the existing pricing outcomes are preserved, and the description names the nearest suitable interior outlet.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
