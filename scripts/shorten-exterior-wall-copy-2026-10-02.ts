/**
 * Publish the concise exterior-wall wording without rebuilding any service
 * trees. Report only by default; pass --apply after reviewing the counts.
 */
import { PrismaClient } from "@prisma/client";
import {
  EXTERIOR_SWITCH_CONTINGENCY_TEXT,
  EXTERIOR_WALL_CONTINGENCY_TEXT,
  EXTERIOR_WALL_DISCLAIMER_KEYS,
  EXTERIOR_WALL_QUESTION_HELP,
} from "../lib/electrical/exteriorWallContingency";
import { OUTLET_V2_KEYS } from "../prisma/seed-new-outlet-v2";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const QUESTION_KEYS = [
  OUTLET_V2_KEYS.accessibleExterior,
  OUTLET_V2_KEYS.atticExterior,
  "device_on_exterior_wall",
  "extension_new_switch_exterior_wall",
  "extension_sconce_exterior_wall",
] as const;

const TEXT_BY_DISCLAIMER_KEY = new Map<string, string>([
  [EXTERIOR_WALL_DISCLAIMER_KEYS.outlet, EXTERIOR_WALL_CONTINGENCY_TEXT],
  [EXTERIOR_WALL_DISCLAIMER_KEYS.switch, EXTERIOR_SWITCH_CONTINGENCY_TEXT],
  [EXTERIOR_WALL_DISCLAIMER_KEYS.wallSconce, EXTERIOR_WALL_CONTINGENCY_TEXT],
]);

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
    for (const contractorSlug of CONTRACTORS) {
      const contractor = await db.contractor.findUniqueOrThrow({
        where: { slug: contractorSlug },
        select: { id: true },
      });
      const questions = await db.question.findMany({
        where: {
          service: { contractorId: contractor.id },
          key: { in: [...QUESTION_KEYS] },
        },
        select: { id: true, key: true },
      });
      const disclaimers = await db.contractorDisclaimer.findMany({
        where: {
          contractorId: contractor.id,
          canonicalDisclaimer: { key: { in: [...TEXT_BY_DISCLAIMER_KEY.keys()] } },
        },
        select: {
          id: true,
          canonicalDisclaimer: { select: { key: true } },
        },
      });
      const disclaimerIds = disclaimers.map((disclaimer) => disclaimer.id);
      const unsureBindings = disclaimerIds.length === 0 ? 0 : await db.answerOptionDisclaimer.count({
        where: {
          contractorDisclaimerId: { in: disclaimerIds },
          answerOption: {
            value: "unsure",
            question: { id: { in: questions.map((question) => question.id) } },
          },
        },
      });

      console.log(`${contractorSlug}: ${questions.length} exterior-wall question(s), ${disclaimers.length} disclaimer(s), ${unsureBindings} unsure-card description(s)`);
      if (!apply) continue;

      await db.$transaction(async (tx) => {
        await tx.question.updateMany({
          where: { id: { in: questions.map((question) => question.id) } },
          data: { helpText: EXTERIOR_WALL_QUESTION_HELP },
        });
        for (const disclaimer of disclaimers) {
          await tx.contractorDisclaimer.update({
            where: { id: disclaimer.id },
            data: { text: TEXT_BY_DISCLAIMER_KEY.get(disclaimer.canonicalDisclaimer.key)! },
          });
        }
        if (disclaimerIds.length > 0) {
          await tx.answerOptionDisclaimer.deleteMany({
            where: {
              contractorDisclaimerId: { in: disclaimerIds },
              answerOption: {
                value: "unsure",
                question: { id: { in: questions.map((question) => question.id) } },
              },
            },
          });
        }
      });
    }
    console.log(apply ? "Concise exterior-wall wording applied." : "Report only. Re-run with --apply to publish.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
