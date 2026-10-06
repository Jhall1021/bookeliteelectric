/**
 * Publish the fan finished-route diagrams and the concealed-vs-Wiremold help
 * choice to the electrical template owner and onboarding test catalog.
 *
 * Report only by default. Pass --apply after the production identity guard.
 */
import { PrismaClient } from "@prisma/client";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import {
  FAN_ROUTE_METHOD_KEY,
  FAN_ROUTE_METHOD_HELP_KEY,
} from "../prisma/seed-new-ceiling-fan-v2";
import { CEILING_FAN_FINISHED_KEYS } from "../prisma/_ceilingFanFinishedRouteModule";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { upsertQuestion } from "../prisma/_moduleHelpers";
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
      const service = await db.service.findFirst({
        where: { slug: "new-ceiling-fan", contractor: { slug: contractorSlug } },
        select: { id: true },
      });
      if (!service) throw new Error(`${contractorSlug}/new-ceiling-fan was not found`);
      console.log(`${contractorSlug}/new-ceiling-fan: ${apply ? "will publish" : "ready for"} finished-route guides`);
      if (!apply) continue;

      // This release changes only the method choice and its visual-help fork.
      // Do not replay the whole historical fan migration: older catalogs can
      // retain retired, unreachable geometry questions without making this
      // bounded copy/route update unsafe.
      const [finishedEntry, surfaceEntry] = await Promise.all([
        db.question.findFirstOrThrow({ where: { serviceId: service.id, key: CEILING_FAN_FINISHED_KEYS.feet }, select: { id: true } }),
        db.question.findFirstOrThrow({ where: { serviceId: service.id, key: SURFACE_KEYS.feet }, select: { id: true } }),
      ]);
      const help = await upsertQuestion(db, service.id, {
        key: FAN_ROUTE_METHOD_HELP_KEY,
        prompt: "Here’s the difference",
        helpText:
          "The left illustration shows hidden wiring through small drywall openings. " +
          "The right shows visible Wiremold installed on the surface. Choose the finish you prefer.",
        inputType: "SINGLE_SELECT",
        order: 21,
      });
      await db.answerOption.createMany({ data: [
        { questionId: help.id, label: "Hide the wiring above the drywall ceiling", value: "concealed", routeAction: "CONTINUE", nextQuestionId: finishedEntry.id, order: 1, requiredPhotoLabels: [], disclaimer: "We reinstall removed drywall pieces. Spackling, caulking and painting are not included." },
        { questionId: help.id, label: "Use visible Wiremold on the surface", value: "surface", routeAction: "CONTINUE", nextQuestionId: surfaceEntry.id, order: 2, requiredPhotoLabels: [], disclaimer: "This avoids drywall openings along the route, but the slim channel remains visible." },
      ] });
      const method = await upsertQuestion(db, service.id, {
        key: FAN_ROUTE_METHOD_KEY,
        prompt: "How would you like the wiring run?",
        helpText:
          "Hidden wiring uses conservative drywall-access and 16-inch framing assumptions. " +
          "Surface-mounted wiring runs in a visible channel and avoids opening the ceiling along the route.",
        inputType: "SINGLE_SELECT",
        order: 20,
      });
      await db.answerOption.createMany({ data: [
        { questionId: method.id, label: "Hidden through the drywall ceiling", value: "concealed", routeAction: "CONTINUE", nextQuestionId: finishedEntry.id, order: 1, requiredPhotoLabels: [] },
        { questionId: method.id, label: "Visible surface-mounted raceway", value: "surface", routeAction: "CONTINUE", nextQuestionId: surfaceEntry.id, order: 2, requiredPhotoLabels: [] },
        { questionId: method.id, label: "I'm not sure — help me decide", value: "unsure", routeAction: "CONTINUE", nextQuestionId: help.id, order: 3, requiredPhotoLabels: [] },
      ] });
      if (contractorSlug === "electrical-onboarding-test") {
        const result = await decideDerivedPricingApproval(
          db,
          { contractorId: (await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } })).id },
          { action: "approve", serviceId: service.id },
        );
        if (result.status !== 200) throw new Error(`fan approval failed: ${JSON.stringify(result.body)}`);
      }
    }

    if (apply) {
      const count = await db.question.count({
        where: {
          key: FAN_ROUTE_METHOD_HELP_KEY,
          service: { slug: "new-ceiling-fan", contractor: { slug: { in: [...CONTRACTORS] } } },
        },
      });
      if (count !== CONTRACTORS.length) throw new Error(`expected ${CONTRACTORS.length} fan comparison questions; found ${count}`);
      console.log("Fan finished-route guides published.");
    } else {
      console.log("Report only. Re-run with --apply to publish the guarded catalog update.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
