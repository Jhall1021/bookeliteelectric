/** Restore the separately priced exposed-baseboard choice for coax and Ethernet. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { lowVoltagePackage } from "../lib/electrical/circuitPackagePricing";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { electricalPlatformLaborBaselineByOperation } from "../lib/electrical/platformLaborBaseline";
import { LOW_VOLTAGE_EXPOSED_ROUTE_DISCLAIMER } from "../lib/electrical/lowVoltageExposedRoute";
import { activateService } from "../lib/serviceActivation";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUGS = ["elite-electric"] as const;
const STOREFRONT_CONTRACTOR_SLUG = "elite-electric";
const SERVICE_SLUGS = ["new-coax-line", "new-ethernet-line"] as const;
const LOW_VOLTAGE_OPERATIONS = [
  "ELEC_ROUTE_LAYOUT_SETUP",
  "ELEC_UTP_CABLE_ACCESSIBLE",
  "ELEC_COAX_CABLE_ACCESSIBLE",
  "ELEC_LOW_VOLTAGE_CABLE_EXPOSED",
  "ELEC_FASTEN_EXPOSED_LOW_VOLTAGE_CABLE",
  "ELEC_TERMINATE_RJ45_END",
  "ELEC_TERMINATE_COAX_END",
  "ELEC_TEST_DATA_CABLE",
] as const;

async function main() {
  const apply = process.argv.includes("--apply") || process.argv.includes("apply");
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const services = await db.service.findMany({
      // Hidden services are the rows this repair is specifically meant to
      // recover, so filtering to active here would silently skip the problem.
      where: { slug: { in: [...SERVICE_SLUGS] }, contractor: { slug: { in: [...CONTRACTOR_SLUGS] } } },
      select: {
        id: true,
        slug: true,
        active: true,
        pricingMethod: true,
        contractor: { select: { id: true, slug: true } },
        questions: { select: { id: true, key: true } },
      },
    });
    assert.ok(services.length > 0, "no target low-voltage services found");
    assert.deepEqual(
      services.filter((service) => service.contractor.slug === STOREFRONT_CONTRACTOR_SLUG).map((service) => service.slug).sort(),
      [...SERVICE_SLUGS].sort(),
      "Elite must have both low-voltage services before they can be restored",
    );

    console.log(`LOW-VOLTAGE EXPOSED ROUTES — ${apply ? "APPLY" : "REPORT"}`);
    for (const service of services) console.log(`  ${service.contractor.slug}/${service.slug}`);
    if (!apply) {
      for (const service of services) {
        const pkg = lowVoltagePackage(service.slug, {
          [`${service.slug}_route_access`]: "accessible",
          [`${service.slug}_distance`]: "50",
        });
        assert.ok(pkg, `${service.slug} must have a standard accessible package`);
        const [decisions, materials] = await Promise.all([
          db.contractorLaborOperationDecision.findMany({
            where: { contractorId: service.contractor.id, trade: "electrical" },
            select: { operationKey: true, hoursPerUnit: true, source: true },
          }),
          db.contractorMaterial.findMany({
            where: { contractorId: service.contractor.id, active: true, canonicalMaterial: { key: { in: [...pkg.materialRoles] } } },
            select: { canonicalMaterial: { select: { key: true } } },
          }),
        ]);
        const labor = projectElectricalServiceLabor(service.slug, decisions, pkg.facts);
        const foundMaterials = new Set(materials.map((row) => row.canonicalMaterial.key));
        const missingMaterials = pkg.materialRoles.filter((role) => !foundMaterials.has(role));
        console.log(`  ${service.slug} labor: ${labor.kind}${labor.kind === "BLOCKED" ? ` missing ${labor.projection.missingOperations.join(", ") || "none"}` : ""}`);
        console.log(`  ${service.slug} materials: ${missingMaterials.length ? `missing ${missingMaterials.join(", ")}` : "ready"}`);
      }
      return;
    }

    await db.$transaction(async (tx) => {
      const clip = await tx.canonicalMaterial.upsert({
        where: { key: "LOW_VOLTAGE_CABLE_CLIP" },
        update: { name: "Listed low-voltage cable clip", unit: "each", displayCategory: "Low Voltage", active: true },
        create: { key: "LOW_VOLTAGE_CABLE_CLIP", name: "Listed low-voltage cable clip", unit: "each", displayCategory: "Low Voltage", active: true },
      });
      for (const contractor of new Map(services.map((service) => [service.contractor.id, service.contractor])).values()) {
        await tx.contractorMaterial.upsert({
          where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: clip.id } },
          update: { active: true },
          create: {
            contractorId: contractor.id,
            canonicalMaterialId: clip.id,
            unitCostCents: 21,
            costConfidence: "ASSUMED",
            active: true,
            notes: "Prepared retail baseline: $4.18 per 20-pack, normalized to each clip.",
          },
        });
        for (const operationKey of LOW_VOLTAGE_OPERATIONS) {
          const baseline = electricalPlatformLaborBaselineByOperation.get(operationKey);
          assert.ok(baseline, `missing platform labor baseline for ${operationKey}`);
          await tx.contractorLaborOperationDecision.upsert({
            where: { contractorId_trade_operationKey: { contractorId: contractor.id, trade: "electrical", operationKey } },
            update: {},
            create: {
              contractorId: contractor.id,
              trade: "electrical",
              operationKey,
              hoursPerUnit: baseline.hoursPerUnit,
              source: "PLATFORM_BASELINE",
              basis: baseline,
            },
          });
        }
      }

      for (const service of services) {
        const tvMedia = await tx.contractorCategory.findFirst({
          where: { contractorId: service.contractor.id, canonicalCategory: { slug: "tv-media" } },
          select: { id: true, active: true },
        });
        assert.ok(tvMedia, `${service.contractor.slug} is missing the TV & Media category`);
        if (!tvMedia.active) await tx.contractorCategory.update({ where: { id: tvMedia.id }, data: { active: true } });
        await tx.service.update({
          where: { id: service.id },
          data: { offered: true, contractorCategoryId: tvMedia.id },
        });

        const accessKey = `${service.slug}_route_access`;
        const distanceKey = `${service.slug}_exposed_route_feet`;
        const accessQuestion = service.questions.find((question) => question.key === accessKey);
        assert.ok(accessQuestion, `${service.contractor.slug}/${service.slug} is missing ${accessKey}`);
        const existingDistanceQuestion = service.questions.find((question) => question.key === distanceKey);
        const source = service.slug === "new-coax-line" ? "router or existing coax source" : "router or network source";
        const target = service.slug === "new-coax-line" ? "new coax wall plate" : "new Ethernet wall plate";
        const distanceQuestion = existingDistanceQuestion ?? await tx.question.create({
          data: {
            serviceId: service.id,
            key: distanceKey,
            prompt: `How many feet will the visible ${service.slug === "new-coax-line" ? "coax" : "Ethernet"} cable run along the baseboard?`,
            helpText: `Measure from the ${source} to the ${target}, following the baseboard and every corner.`,
            inputType: "NUMBER",
            numberAllowsDecimal: true,
            numberMin: 1,
            numberMax: 200,
            order: 2,
          },
          select: { id: true, key: true },
        });
        if (!existingDistanceQuestion) {
          const sourcePhotos = [`Where the ${source} is`, `Where you'd like the ${target}`];
          const reviewPhotos = [...sourcePhotos, "The complete visible route between the two points"];
          await tx.answerOption.createMany({ data: [
            { questionId: distanceQuestion.id, label: "1 to 75 feet", value: "measured_exposed_route", routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, order: 1, numberAtLeast: 1, numberAtMost: 75, requiredPhotoLabels: sourcePhotos, approvedComponentPriceCents: 0 },
            { questionId: distanceQuestion.id, label: "More than 75 feet", value: "over_75", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 2, numberAtLeast: 75, numberAtLeastExclusive: true, numberAtMost: 200, requiredPhotoLabels: reviewPhotos },
            { questionId: distanceQuestion.id, label: "I'm not sure", value: "__unknown__", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: reviewPhotos },
          ] });
        }

        const existing = await tx.answerOption.findFirst({
          where: { questionId: accessQuestion.id, value: "exposed_baseboard" },
          select: { id: true },
        });
        const data = {
          label: "Run it exposed and neatly fastened along the baseboard",
          routeAction: "CONTINUE" as const,
          nextQuestionId: distanceQuestion.id,
          order: 3,
          disclaimer: LOW_VOLTAGE_EXPOSED_ROUTE_DISCLAIMER,
          photosBlockBooking: false,
          requiredPhotoLabels: [] as string[],
          approvedComponentPriceCents: 0,
        };
        if (existing) await tx.answerOption.update({ where: { id: existing.id }, data });
        else await tx.answerOption.create({ data: { ...data, questionId: accessQuestion.id, value: "exposed_baseboard" } });
        await tx.answerOption.updateMany({
          where: { questionId: accessQuestion.id, value: "unsure" },
          data: { order: 4 },
        });
      }

    }, { timeout: 120000 });

    // The exposed branch is server-priced from its own measured labor and
    // material package even on Elite's otherwise legacy-published service.
    // Record the normal derived-basis approval without converting the other
    // two route choices away from their existing published-price behavior.
    for (const service of services) {
      const temporarilyDerived = service.pricingMethod !== "DERIVED_RESOLVED_SCOPE";
      if (temporarilyDerived) {
        await db.service.update({ where: { id: service.id }, data: { pricingMethod: "DERIVED_RESOLVED_SCOPE" } });
      }
      try {
        const approval = await decideDerivedPricingApproval(
          db,
          { contractorId: service.contractor.id, userId: null },
          { action: "approve", serviceId: service.id },
        );
        assert.equal(
          approval.status,
          200,
          `${service.contractor.slug}/${service.slug} exposed-route pricing did not approve: ${JSON.stringify(approval.body)}`,
        );
      } finally {
        if (temporarilyDerived) {
          await db.service.update({ where: { id: service.id }, data: { pricingMethod: service.pricingMethod } });
        }
      }
    }

    for (const service of services.filter((candidate) => candidate.contractor.slug === STOREFRONT_CONTRACTOR_SLUG)) {
      const activation = await activateService(db, service.contractor.id, service.id);
      assert.equal(
        activation.ok,
        true,
        `${service.contractor.slug}/${service.slug} activation was refused${activation.ok ? "" : `: ${activation.refusal.code} — ${activation.refusal.message}`}`,
      );
    }

    const restored = await db.answerOption.count({
      where: {
        value: "exposed_baseboard",
        question: { serviceId: { in: services.map((service) => service.id) }, key: { endsWith: "_route_access" } },
        routeAction: "CONTINUE",
      },
    });
    assert.equal(restored, services.length, "every active target service must expose the baseboard branch");
    const visibleElite = await db.service.count({
      where: {
        contractor: { slug: STOREFRONT_CONTRACTOR_SLUG },
        slug: { in: [...SERVICE_SLUGS] },
        active: true,
        offered: true,
        contractorCategory: { active: true, canonicalCategory: { slug: "tv-media" } },
      },
    });
    assert.equal(visibleElite, SERVICE_SLUGS.length, "both Elite low-voltage services must be visible in TV & Media");
    console.log(`  Restored ${restored} exposed-route branches and verified both Elite services live in TV & Media.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
