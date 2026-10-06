/**
 * Keep the dedicated-circuit finished-wall branch inside instant pricing.
 * Report-only by default; pass --apply after the production identity guard.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { DEDICATED_ROUTE_ACCESS_VALUES } from "../lib/electrical/dedicatedCircuitAccess";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUGS = ["elite-electric", "electrical-onboarding-test"] as const;
const SERVICE_SLUG = "dedicated-120v-circuit-outlet";
const DISTANCE_HELP =
  "Measure the path from the electrical panel to the new outlet. The diagram will show whether to measure through open access or along the finished wall and ceiling.";
const FINISH_HELP =
  "We'll choose the practical method for the conditions—either making small access openings in drywall or carefully removing reusable baseboard. We'll put removed drywall pieces or reusable baseboard back and secure them. Caulking, spackling, sanding, texture matching, staining, priming, painting, and replacement materials are not included.";

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const services = await db.service.findMany({
      where: { slug: SERVICE_SLUG, active: true, contractor: { slug: { in: [...CONTRACTOR_SLUGS] } } },
      select: {
        id: true,
        contractor: { select: { slug: true, name: true } },
        questions: {
          where: { key: { in: ["dedicated_route_access", "dedicated_distance", "dedicated_finish_ack"] } },
          select: { id: true, key: true, helpText: true, options: { select: { id: true, value: true, routeAction: true, nextQuestionId: true } } },
        },
      },
      orderBy: { contractor: { slug: "asc" } },
    });
    assert.deepEqual(services.map((service) => service.contractor.slug).sort(), [...CONTRACTOR_SLUGS].sort());

    const templateService = await db.templateService.findFirstOrThrow({
      where: { key: SERVICE_SLUG, templateVersion: { trade: "electrical" } },
      orderBy: { templateVersion: { version: "desc" } },
      select: {
        questions: {
          where: { key: { in: ["dedicated_route_access", "dedicated_distance", "dedicated_finish_ack"] } },
          select: { id: true, key: true, options: { select: { id: true, value: true, routeAction: true, nextQuestionKey: true } } },
        },
      },
    });

    console.log(`DEDICATED FINISHED-WALL PRICING — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    for (const service of services) {
      const access = service.questions.find((question) => question.key === "dedicated_route_access");
      const no = access?.options.find((option) => option.value === DEDICATED_ROUTE_ACCESS_VALUES.finished);
      assert.ok(access && no, `${service.contractor.slug}: finished access answer is required`);
      console.log(`  ${service.contractor.name}: No -> ${no.routeAction}${no.nextQuestionId ? " -> distance" : ""}`);
    }
    console.log("  new route: No -> exact panel-to-outlet measurement -> disclosure -> derived price");
    if (!apply) {
      console.log("  Report only. Re-run with --apply to publish the guarded update.");
      return;
    }

    await db.$transaction(async (tx) => {
      for (const service of services) {
        const byKey = new Map(service.questions.map((question) => [question.key, question]));
        const access = byKey.get("dedicated_route_access")!;
        const distance = byKey.get("dedicated_distance")!;
        const finish = byKey.get("dedicated_finish_ack")!;
        const no = access.options.find((option) => option.value === DEDICATED_ROUTE_ACCESS_VALUES.finished)!;
        await tx.answerOption.update({
          where: { id: no.id },
          data: { routeAction: "CONTINUE", nextQuestionId: distance.id, photosBlockBooking: false, requiredPhotoLabels: [] },
        });
        await tx.question.update({ where: { id: distance.id }, data: { helpText: DISTANCE_HELP } });
        await tx.question.update({ where: { id: finish.id }, data: { helpText: FINISH_HELP } });
      }

      const templateByKey = new Map(templateService.questions.map((question) => [question.key, question]));
      const templateAccess = templateByKey.get("dedicated_route_access")!;
      const templateDistance = templateByKey.get("dedicated_distance")!;
      const templateFinish = templateByKey.get("dedicated_finish_ack")!;
      const templateNo = templateAccess.options.find((option) => option.value === DEDICATED_ROUTE_ACCESS_VALUES.finished)!;
      await tx.templateAnswerOption.update({
        where: { id: templateNo.id },
        data: { routeAction: "CONTINUE", nextQuestionKey: "dedicated_distance", photosBlockBooking: false, requiredPhotoLabels: [] },
      });
      await tx.templateQuestion.update({ where: { id: templateDistance.id }, data: { helpText: DISTANCE_HELP } });
      await tx.templateQuestion.update({ where: { id: templateFinish.id }, data: { helpText: FINISH_HELP } });
    }, { timeout: 120000 });

    console.log("  Published: finished-wall dedicated circuits now continue through panel-sourced measurement and derived pricing.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
