/**
 * Add the ordinary existing-wall-switch choice to the new ceiling-fan flow.
 * Report only by default; pass --apply after the production identity guard.
 */
import { PrismaClient } from "@prisma/client";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { FAN_EXISTING_WALL_SWITCH_CONTROL_VALUE } from "../lib/electrical/ceilingFanControl";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;

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
      const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
      const service = await db.service.findUniqueOrThrow({
        where: { contractorId_slug: { contractorId: contractor.id, slug: "new-ceiling-fan" } },
        select: { id: true },
      });
      const control = await db.question.findFirstOrThrow({ where: { serviceId: service.id, key: "lighting_control" }, select: { id: true } });
      const dimmer = await db.question.findFirstOrThrow({ where: { serviceId: service.id, key: "lighting_dimmer_upgrade" }, select: { id: true } });
      console.log(`${contractorSlug}/new-ceiling-fan: ${apply ? "will add" : "ready for"} existing-switch choice`);
      if (!apply) continue;

      await db.question.update({
        where: { id: control.id },
        data: {
          prompt: "Is there already a wall switch you want to use for the new fan?",
          helpText: "Use an existing switch, add a new one, reuse a switch-controlled outlet, or operate the fan from its pull chains.",
        },
      });
      const existing = await db.answerOption.findFirst({
        where: { questionId: control.id, value: FAN_EXISTING_WALL_SWITCH_CONTROL_VALUE },
        select: { id: true },
      });
      const data = {
        label: "Yes — use the existing wall switch",
        routeAction: "CONTINUE" as const,
        nextQuestionId: dimmer.id,
        photosBlockBooking: false,
        approvedComponentPriceCents: 0,
        requiredPhotoLabels: [] as string[],
        disclaimer: "The measured wiring route will connect the existing wall switch to the new fan location. No new switch box is included.",
        order: 1,
      };
      if (existing) await db.answerOption.update({ where: { id: existing.id }, data });
      else await db.answerOption.create({ data: { questionId: control.id, value: FAN_EXISTING_WALL_SWITCH_CONTROL_VALUE, ...data } });
      await db.answerOption.updateMany({ where: { questionId: control.id, value: "no_switch" }, data: { label: "No — install a new wall switch", order: 2 } });
      await db.answerOption.updateMany({ where: { questionId: control.id, value: "switched_outlet" }, data: { order: 3 } });
      await db.answerOption.updateMany({ where: { questionId: control.id, value: "pull_chains" }, data: { order: 4 } });

      if (contractorSlug === "electrical-onboarding-test") {
        const result = await decideDerivedPricingApproval(db, { contractorId: contractor.id }, { action: "approve", serviceId: service.id });
        if (result.status !== 200) throw new Error(`fan approval failed: ${JSON.stringify(result.body)}`);
      }
    }
    console.log(apply ? "Existing-switch fan choice published." : "Report only. Re-run with --apply to publish the guarded catalog update.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
