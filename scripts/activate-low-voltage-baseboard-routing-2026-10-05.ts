/** Publish measured exposed-baseboard routing for Ethernet and coax services. */
import { PrismaClient } from "@prisma/client";

import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { electricalPlatformLaborBaselineByOperation } from "../lib/electrical/platformLaborBaseline";
import { upsertQuestion } from "../prisma/_moduleHelpers";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["electrical-onboarding-test"] as const;
const SERVICES = ["new-ethernet-line", "new-coax-line"] as const;
const OPERATIONS = ["ELEC_LOW_VOLTAGE_CABLE_EXPOSED", "ELEC_FASTEN_EXPOSED_LOW_VOLTAGE_CABLE"] as const;
const SOURCE_PHOTOS = ["Where the line starts", "Where you'd like the new jack to come out"];
const REVIEW_PHOTOS = [...SOURCE_PHOTOS, "The complete route between the two points"];

async function approve(db: PrismaClient, contractorId: string, serviceId: string, label: string) {
  const result = await decideDerivedPricingApproval(db, { contractorId, userId: null }, { action: "approve", serviceId });
  if (result.status !== 200) throw new Error(`${label} was not ready: ${JSON.stringify(result.body)}`);
}

async function installTree(db: PrismaClient, serviceId: string, slug: string, includeExposed = true) {
  const componentKey = `${slug.toUpperCase().replace(/-/g, "_")}_FINISHED_ROUTE`;
  const finishedComponent = await db.canonicalComponent.findUnique({ where: { key: componentKey }, select: { id: true } });
  const questions = await db.question.findMany({ where: { serviceId }, select: { id: true } });
  await db.answerOption.deleteMany({ where: { questionId: { in: questions.map((question) => question.id) } } });
  await db.question.deleteMany({ where: { serviceId } });

  const access = await upsertQuestion(db, serviceId, {
    key: `${slug}_route_access`,
    prompt: includeExposed ? "How would you like the cable run between the two points?" : "Is there an attic, basement or crawl space between the two points?",
    helpText: includeExposed
      ? "Choose an open attic, basement or crawlspace route; a concealed finished-wall route; or a visible route neatly fastened along the baseboard."
      : "An open path above or below is what makes this straightforward. Without one the cable has to go through finished walls.",
    inputType: "SINGLE_SELECT",
    order: 1,
  });
  const exposedFeet = includeExposed ? await upsertQuestion(db, serviceId, {
    key: `${slug}_exposed_route_feet`,
    prompt: "About how many feet will the visible cable run along the baseboard?",
    helpText: "Measure the actual path along the baseboard and around any corners or doorways—not a straight line across the room.",
    inputType: "NUMBER",
    numberAllowsDecimal: true,
    numberMin: 1,
    numberMax: 200,
    order: 2,
  }) : null;
  const distance = await upsertQuestion(db, serviceId, {
    key: `${slug}_distance`,
    prompt: "About how far apart do the two locations seem?",
    helpText: "Choose the closest range for the concealed route.",
    inputType: "SINGLE_SELECT",
    order: includeExposed ? 3 : 2,
  });

  const accessible = await db.answerOption.create({ data: {
    questionId: access.id, label: includeExposed ? "Use an attic, basement or crawlspace" : "Yes — there's an attic, basement or crawl space we can use", value: "accessible",
    accessClassification: "ACCESSIBLE", routeAction: "CONTINUE", nextQuestionId: distance.id, order: 1,
    requiredPhotoLabels: [], approvedComponentPriceCents: 0,
  } });
  const finished = await db.answerOption.create({ data: {
    questionId: access.id, label: includeExposed ? "Conceal it through finished walls" : "No — it's finished space the whole way", value: "finished",
    accessClassification: "FINISHED", routeAction: "CONTINUE", nextQuestionId: distance.id, order: 2,
    requiredPhotoLabels: [], approvedComponentPriceCents: null,
    disclaimer: "This may require small access openings. Drywall patching, sanding, texture, primer and paint are not included.",
  } });
  if (exposedFeet) await db.answerOption.createMany({ data: [{
      questionId: access.id, label: "Run it exposed and neatly fastened along the baseboard", value: "exposed_baseboard",
      routeAction: "CONTINUE", nextQuestionId: exposedFeet.id, order: 3, requiredPhotoLabels: [], approvedComponentPriceCents: 0,
      disclaimer: "The cable will remain visible. This price assumes an unobstructed route on ordinary paint-grade baseboard or adjacent drywall using listed low-voltage clips. Masonry, tile, metal and specialty finishes need review.",
    }] });
  await db.answerOption.create({ data: {
    questionId: access.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW",
    photosBlockBooking: true, order: includeExposed ? 4 : 3, requiredPhotoLabels: REVIEW_PHOTOS, approvedComponentPriceCents: null,
  } });
  if (exposedFeet) await db.answerOption.createMany({ data: [
    {
      questionId: exposedFeet.id, label: "1 to 75 feet", value: "measured_exposed_route", routeAction: "RESOLVE_ADJUSTED",
      photosBlockBooking: false, order: 1, numberAtLeast: 1, numberAtMost: 75,
      requiredPhotoLabels: SOURCE_PHOTOS, approvedComponentPriceCents: 0,
    },
    {
      questionId: exposedFeet.id, label: "More than 75 feet", value: "over_75", routeAction: "PHOTO_REVIEW",
      photosBlockBooking: true, order: 2, numberAtLeast: 75, numberAtLeastExclusive: true, numberAtMost: 200,
      requiredPhotoLabels: REVIEW_PHOTOS, approvedComponentPriceCents: null,
    },
    {
      questionId: exposedFeet.id, label: "I'm not sure", value: "__unknown__", routeAction: "PHOTO_REVIEW",
      photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS, approvedComponentPriceCents: null,
    },
  ] });
  await db.answerOption.createMany({ data: [
    { questionId: distance.id, label: "25 feet or less", value: "under_25", routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, order: 1, requiredPhotoLabels: SOURCE_PHOTOS, approvedComponentPriceCents: 0 },
    { questionId: distance.id, label: "26 to 50 feet", value: "26_to_50", routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, order: 2, requiredPhotoLabels: SOURCE_PHOTOS, approvedComponentPriceCents: 0 },
    { questionId: distance.id, label: "51 to 75 feet", value: "51_to_75", routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, order: 3, requiredPhotoLabels: SOURCE_PHOTOS, approvedComponentPriceCents: 0 },
    { questionId: distance.id, label: "More than 75 feet, or I'm not sure", value: "over_75_or_unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: REVIEW_PHOTOS, approvedComponentPriceCents: null },
  ] });
  if (finishedComponent) {
    await db.answerOptionComponent.create({ data: { answerOptionId: finished.id, canonicalComponentId: finishedComponent.id, quantity: 1 } });
  }
  void accessible;
}

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
    console.log(`${apply ? "Publishing" : "Ready to publish"} measured exposed-baseboard routing for ${SERVICES.join(" and ")}.`);
    if (!apply) return;
    const clip = await db.canonicalMaterial.upsert({
      where: { key: "LOW_VOLTAGE_CABLE_CLIP" },
      update: { name: "Listed low-voltage cable clip", unit: "each", displayCategory: "Low Voltage", active: true },
      create: { key: "LOW_VOLTAGE_CABLE_CLIP", name: "Listed low-voltage cable clip", unit: "each", displayCategory: "Low Voltage", active: true },
    });
    const elite = await db.contractor.findUnique({ where: { slug: "elite-electric" }, select: { id: true } });
    if (elite) {
      for (const slug of SERVICES) {
        const service = await db.service.findUnique({ where: { contractorId_slug: { contractorId: elite.id, slug } }, select: { id: true } });
        if (service) await installTree(db, service.id, slug, false);
      }
      console.log("elite-electric: restored the original two-route published-price trees.");
    }
    for (const contractorSlug of CONTRACTORS) {
      const contractor = await db.contractor.findUnique({ where: { slug: contractorSlug }, select: { id: true } });
      if (!contractor) continue;
      const services = await db.service.findMany({
        where: { contractorId: contractor.id, slug: { in: [...SERVICES] } },
        select: { id: true, slug: true, pricingMethod: true },
      });
      if (services.length !== SERVICES.length || services.some((service) => service.pricingMethod !== "DERIVED_RESOLVED_SCOPE")) {
        throw new Error(`${contractorSlug}: expected two derived low-voltage services before mutation`);
      }
      await db.contractorMaterial.upsert({
        where: { contractorId_canonicalMaterialId: { contractorId: contractor.id, canonicalMaterialId: clip.id } },
        update: { unitCostCents: 21, costConfidence: "ASSUMED", active: true, notes: "Prepared retail baseline: $4.18 per 20-pack, normalized to each clip." },
        create: { contractorId: contractor.id, canonicalMaterialId: clip.id, unitCostCents: 21, costConfidence: "ASSUMED", active: true, notes: "Prepared retail baseline: $4.18 per 20-pack, normalized to each clip." },
      });
      for (const operationKey of OPERATIONS) {
        const baseline = electricalPlatformLaborBaselineByOperation.get(operationKey);
        if (!baseline) throw new Error(`Missing labor baseline for ${operationKey}`);
        await db.contractorLaborOperationDecision.upsert({
          where: { contractorId_trade_operationKey: { contractorId: contractor.id, trade: "electrical", operationKey } },
          update: {},
          create: { contractorId: contractor.id, trade: "electrical", operationKey, hoursPerUnit: baseline.hoursPerUnit, source: "PLATFORM_BASELINE", basis: baseline },
        });
      }
      for (const slug of SERVICES) {
        const service = services.find((candidate) => candidate.slug === slug)!;
        await installTree(db, service.id, slug);
        await approve(db, contractor.id, service.id, `${contractorSlug}/${slug}`);
      }
      console.log(`${contractorSlug}: published Ethernet and coax exposed-baseboard pricing.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
