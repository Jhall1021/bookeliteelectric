/**
 * Explain the exterior-wall fallback on the accessible Exterior GFCI route.
 * The API appends the contractor-derived price for each three-foot section.
 *
 * Report-only by default. Pass --apply after the production identity guard.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import {
  EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT,
  EXTERIOR_WALL_DISCLAIMER_KEYS,
} from "../lib/electrical/exteriorWallContingency";
import { priceExteriorWallFinishedIncrement } from "../lib/electrical/exteriorWallIncrementPricing";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUG = "electrical-onboarding-test";
const SERVICE_SLUG = "exterior-gfci-other-routing";
const DISTANCE_KEY = "ext_gfci_distance";
const SUPPORTED_VALUES = ["under_10", "10_to_20"] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");

  const identity = await probe(databaseUrl);
  if (
    identity.endpoint !== EXPECTED_ENDPOINT ||
    identity.lineage !== PRODUCTION_LINEAGE ||
    identity.markerEndpoint !== EXPECTED_ENDPOINT
  ) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: CONTRACTOR_SLUG },
      select: { id: true, name: true },
    });
    const service = await db.service.findUniqueOrThrow({
      where: { contractorId_slug: { contractorId: contractor.id, slug: SERVICE_SLUG } },
      select: {
        id: true,
        materialMultiplier: true,
        laborCrewType: true,
        questions: {
          where: { key: DISTANCE_KEY },
          select: {
            id: true,
            options: {
              where: { value: { in: [...SUPPORTED_VALUES] } },
              select: { id: true, value: true },
            },
          },
        },
      },
    });
    assert.equal(service.questions.length, 1, `expected one ${DISTANCE_KEY} question`);
    assert.equal(service.questions[0].options.length, SUPPORTED_VALUES.length, "expected both supported distance bands");

    const increment = await priceExteriorWallFinishedIncrement(db, contractor.id, service);
    assert.ok(increment, "the contractor's current labor, framing, cable, and pricing settings must resolve the 3-foot increment");
    const formattedIncrement = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(increment.cents / 100);

    const templateOptions = await db.templateAnswerOption.findMany({
      where: {
        value: { in: [...SUPPORTED_VALUES] },
        templateQuestion: {
          key: DISTANCE_KEY,
          templateService: { key: SERVICE_SLUG, templateVersion: { trade: "electrical" } },
        },
      },
      select: { id: true, value: true },
    });
    assert.ok(templateOptions.length > 0, "at least one electrical template distance band must exist");

    console.log(`EXTERIOR GFCI WALL CONTINGENCY — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint} / ${contractor.name}`);
    console.log(`  accessible-route fallback: ${formattedIncrement} per 3-foot section or portion`);
    console.log(`  live attachments: one measurement question + ${service.questions[0].options.length} supported price outcomes`);
    console.log(`  template attachments: ${templateOptions.length} supported price outcomes`);
    if (!apply) {
      console.log("  Report only. Re-run with --apply to publish the guarded catalog update.");
      return;
    }

    await db.$transaction(async (tx) => {
      const canonical = await tx.canonicalDisclaimer.upsert({
        where: { key: EXTERIOR_WALL_DISCLAIMER_KEYS.exteriorGfci },
        update: {
          name: "Exterior GFCI — exterior-wall access contingency",
          description:
            "An apparently accessible attic, basement, or crawlspace route may still require finished-wall routing from the nearest reachable interior wall to an exterior GFCI location.",
          accessClass: "ACCESSIBLE",
          accessSlot: "PRIMARY",
          active: true,
        },
        create: {
          key: EXTERIOR_WALL_DISCLAIMER_KEYS.exteriorGfci,
          name: "Exterior GFCI — exterior-wall access contingency",
          description:
            "An apparently accessible attic, basement, or crawlspace route may still require finished-wall routing from the nearest reachable interior wall to an exterior GFCI location.",
          accessClass: "ACCESSIBLE",
          accessSlot: "PRIMARY",
          active: true,
        },
        select: { id: true },
      });
      const policy = await tx.contractorDisclaimer.upsert({
        where: {
          contractorId_canonicalDisclaimerId: {
            contractorId: contractor.id,
            canonicalDisclaimerId: canonical.id,
          },
        },
        update: {
          text: EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT,
          active: true,
          notes: "Owner-approved exterior GFCI wall-access contingency, 6 Oct 2026.",
        },
        create: {
          contractorId: contractor.id,
          canonicalDisclaimerId: canonical.id,
          text: EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT,
          active: true,
          notes: "Owner-approved exterior GFCI wall-access contingency, 6 Oct 2026.",
        },
        select: { id: true },
      });

      await tx.questionDisclaimer.upsert({
        where: {
          questionId_contractorDisclaimerId: {
            questionId: service.questions[0].id,
            contractorDisclaimerId: policy.id,
          },
        },
        update: { replacesHelpText: false, order: 1 },
        create: {
          questionId: service.questions[0].id,
          contractorDisclaimerId: policy.id,
          replacesHelpText: false,
          order: 1,
        },
      });

      for (const option of service.questions[0].options) {
        await tx.answerOptionDisclaimer.upsert({
          where: {
            answerOptionId_contractorDisclaimerId: {
              answerOptionId: option.id,
              contractorDisclaimerId: policy.id,
            },
          },
          update: { order: 0 },
          create: { answerOptionId: option.id, contractorDisclaimerId: policy.id, order: 0 },
        });
      }

      for (const option of templateOptions) {
        await tx.templateAnswerOptionDisclaimer.upsert({
          where: {
            templateAnswerOptionId_canonicalDisclaimerId: {
              templateAnswerOptionId: option.id,
              canonicalDisclaimerId: canonical.id,
            },
          },
          update: {},
          create: { templateAnswerOptionId: option.id, canonicalDisclaimerId: canonical.id },
        });
      }
    }, { timeout: 120000 });

    console.log(`  Published: accessible Exterior GFCI routes now disclose ${formattedIncrement} per 3-foot finished-wall fallback section.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
