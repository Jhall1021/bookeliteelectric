/**
 * Attach the finished-ceiling removal warning to the bathroom exhaust-fan
 * replacement flow for Elite and the electrical onboarding test contractor.
 * Future electrical templates receive the disclaimer concept but no borrowed
 * contractor wording; each contractor still owns its own repair policy.
 *
 * Report only by default. Pass --apply after the production identity guard.
 */
import { PrismaClient } from "@prisma/client";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const DISCLAIMER_KEY = "BATH_FAN_FINISHED_CEILING_OPENING";
const DISCLAIMER_TEXT =
  "Without attic access, in most situations we cannot remove the existing exhaust-fan housing without opening the ceiling drywall. " +
  "We keep the opening as small as practical, but the new fan's trim may not cover all of it. " +
  "Drywall patching, spackling, sanding, priming and painting are not included.";

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
    const existingCanonical = await db.canonicalDisclaimer.findUnique({
      where: { key: DISCLAIMER_KEY }, select: { id: true },
    });
    const canonical = apply
      ? await db.canonicalDisclaimer.upsert({
          where: { key: DISCLAIMER_KEY },
          update: {
            name: "Bathroom exhaust fan — finished ceiling opening",
            description:
              "When an existing bathroom exhaust-fan housing cannot be reached from attic space, explain that removal usually requires opening the finished ceiling and state the contractor's drywall-repair policy.",
            accessClass: "FINISHED",
          },
          create: {
            key: DISCLAIMER_KEY,
            name: "Bathroom exhaust fan — finished ceiling opening",
            description:
              "When an existing bathroom exhaust-fan housing cannot be reached from attic space, explain that removal usually requires opening the finished ceiling and state the contractor's drywall-repair policy.",
            accessClass: "FINISHED",
          },
          select: { id: true },
        })
      : existingCanonical;

    let updated = 0;
    for (const contractorSlug of CONTRACTORS) {
      const contractor = await db.contractor.findUnique({
        where: { slug: contractorSlug }, select: { id: true },
      });
      if (!contractor) {
        console.log(`${contractorSlug}: skipped — contractor not found`);
        continue;
      }
      const option = await db.answerOption.findFirst({
        where: {
          value: "finished",
          question: {
            key: "ceiling_access",
            service: { contractorId: contractor.id, slug: "bathroom-fan-light-combo" },
          },
        },
        select: { id: true },
      });
      if (!option) {
        console.log(`${contractorSlug}: skipped — finished ceiling answer not found`);
        continue;
      }
      console.log(`${contractorSlug}: ${apply ? "will attach" : "ready for"} finished-ceiling fan warning`);
      updated++;
      if (!apply || !canonical) continue;
      await db.$transaction(async (tx) => {
        const contractorDisclaimer = await tx.contractorDisclaimer.upsert({
          where: {
            contractorId_canonicalDisclaimerId: {
              contractorId: contractor.id,
              canonicalDisclaimerId: canonical.id,
            },
          },
          update: {
            text: DISCLAIMER_TEXT,
            notes: "Owner-approved finished-ceiling bathroom exhaust-fan warning, 1 Oct 2026.",
          },
          create: {
            contractorId: contractor.id,
            canonicalDisclaimerId: canonical.id,
            text: DISCLAIMER_TEXT,
            notes: "Owner-approved finished-ceiling bathroom exhaust-fan warning, 1 Oct 2026.",
          },
          select: { id: true },
        });
        await tx.answerOptionDisclaimer.upsert({
          where: {
            answerOptionId_contractorDisclaimerId: {
              answerOptionId: option.id,
              contractorDisclaimerId: contractorDisclaimer.id,
            },
          },
          update: { order: 0 },
          create: {
            answerOptionId: option.id,
            contractorDisclaimerId: contractorDisclaimer.id,
            order: 0,
          },
        });
        await tx.answerOption.update({
          where: { id: option.id },
          data: { disclaimer: null, accessFinishedDisclaimer: null },
        });
      }, { timeout: 120000 });
    }

    const templateOptions = await db.templateAnswerOption.findMany({
      where: {
        value: "finished",
        templateQuestion: {
          key: "ceiling_access",
          templateService: {
            key: "bathroom-fan-light-combo",
            templateVersion: { trade: "electrical" },
          },
        },
      },
      select: { id: true },
    });
    if (apply && canonical) {
      for (const option of templateOptions) {
        await db.templateAnswerOptionDisclaimer.upsert({
          where: {
            templateAnswerOptionId_canonicalDisclaimerId: {
              templateAnswerOptionId: option.id,
              canonicalDisclaimerId: canonical.id,
            },
          },
          update: {},
          create: {
            templateAnswerOptionId: option.id,
            canonicalDisclaimerId: canonical.id,
          },
        });
      }
    }
    console.log(`electrical templates: ${templateOptions.length} bathroom-fan definition(s) ${apply ? "updated" : "ready"}`);
    console.log(apply
      ? `Attached the warning to ${updated} live catalog(s).`
      : "Report only. Re-run with --apply to publish the guarded catalog update.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
