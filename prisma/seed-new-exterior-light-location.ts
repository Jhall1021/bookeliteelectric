/**
 * Narrows the old plural custom-project placeholder into one real package.
 *
 * Customer scope: one customer-supplied hardwired fixture, ordinary first-
 * story siding/sheathing, 12 ft or lower, an accessible attic/basement route,
 * and an existing switched source. Every terminal remains PHOTO_REVIEW: rough
 * distance is context only and the electrician must confirm the actual route,
 * source and wall penetration before a price can be calculated.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";

const prisma = new PrismaClient();
const SLUG = "new-exterior-lighting-locations";
const REVIEW_PHOTOS = [
  "Where the new exterior light should go",
  "A wider photo of the exterior wall and ground below",
  "The accessible attic or basement area the cable would travel through",
  "The existing switched light or switch that may supply the new light",
];

async function clearTree(db: PrismaClient, serviceId: string) {
  const questions = await db.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const question of questions) await db.answerOption.deleteMany({ where: { questionId: question.id } });
  await db.question.deleteMany({ where: { serviceId } });
}

export async function seedNewExteriorLightLocation(db: PrismaClient, contractorSlug = "elite-electric") {
  const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
  const service = await db.service.findUnique({ where: { contractorId_slug: { contractorId: contractor.id, slug: SLUG } } });
  if (!service) throw new Error(`Missing ${SLUG}`);

  await db.service.update({
    where: { id: service.id },
    data: {
      name: "Add One Exterior Light Location",
      shortDescription: "One customer-supplied hardwired exterior light on ordinary first-story siding, with an accessible wiring route and an existing switched source.",
      bookingType: "REMOTE_QUOTE",
      active: true,
      isPrimaryEligible: true,
      photoState: "PREPARATION",
      startingPriceLabel: "Price after photo review",
    },
  });
  await clearTree(db, service.id);

  const specs = [
    { key: "exterior_light_existing", prompt: "Is there a working light at this exact spot now?", helpText: "If there is, replacement is a different and smaller service." },
    { key: "exterior_light_fixture_supply", prompt: "Who is supplying the new hardwired light fixture?", helpText: "This package is for a fixture you have already selected." },
    { key: "exterior_light_height", prompt: "About how high will the light be?", helpText: "A rough height is enough." },
    { key: "exterior_light_wall", prompt: "What is the outside wall surface?", helpText: "Ordinary siding is included. Masonry, stucco, and specialty finishes need review." },
    { key: "exterior_light_access", prompt: "Is there an attic, basement, or crawlspace the electrician can enter for the cable route?", helpText: "This asks only whether usable access exists, not for an exact measurement." },
    { key: "exterior_light_distance", prompt: "Roughly how far might the cable travel through that accessible space?", helpText: "Choose the closest range. The electrician will confirm the actual cable path before calculating your price." },
    { key: "exterior_light_control", prompt: "How should the new light be controlled?", helpText: "The standard package extends a suitable existing switched-lighting source." },
  ] as const;
  const questions = new Map<string, { id: string }>();
  for (const [index, spec] of specs.entries()) {
    questions.set(spec.key, await upsertQuestion(db, service.id, { ...spec, order: index + 1 }));
  }
  const q = (key: string) => questions.get(key)!.id;
  const next = (key: string) => questions.get(key)!.id;
  const replacement = await db.service.findUnique({
    where: { contractorId_slug: { contractorId: contractor.id, slug: "replace-exterior-light-fixture" } },
    select: { id: true },
  });
  const continueOption = (questionKey: string, label: string, value: string, nextKey: string, order: number) => ({
    questionId: q(questionKey), label, value, routeAction: "CONTINUE" as const, nextQuestionId: next(nextKey), order,
    requiredPhotoLabels: [] as string[], approvedComponentPriceCents: 0,
  });
  const reviewOption = (questionKey: string, label: string, value: string, order: number) => ({
    questionId: q(questionKey), label, value, routeAction: "PHOTO_REVIEW" as const, nextQuestionId: null, order,
    requiredPhotoLabels: REVIEW_PHOTOS, photosBlockBooking: true, approvedComponentPriceCents: null,
  });

  await db.answerOption.createMany({ data: [
    replacement ? {
      questionId: q("exterior_light_existing"), label: "Yes — replace the existing working light", value: "existing_fixture",
      routeAction: "REROUTE_SERVICE", rerouteServiceId: replacement.id, nextQuestionId: null, order: 1,
      requiredPhotoLabels: [], approvedComponentPriceCents: 0,
    } : reviewOption("exterior_light_existing", "Yes — replace the existing working light", "existing_fixture", 1),
    continueOption("exterior_light_existing", "No — this is a new light location", "new_location", "exterior_light_fixture_supply", 2),
    continueOption("exterior_light_fixture_supply", "I will supply a standard hardwired fixture", "customer_supplied", "exterior_light_height", 1),
    reviewOption("exterior_light_fixture_supply", "The electrician should supply it, or I am not sure", "contractor_or_unsure", 2),
    continueOption("exterior_light_height", "8 feet or less", "under_8", "exterior_light_wall", 1),
    continueOption("exterior_light_height", "9 to 12 feet — normal first story", "9_12", "exterior_light_wall", 2),
    reviewOption("exterior_light_height", "Higher than 12 feet, second story, or unsure", "high_or_unsure", 3),
    continueOption("exterior_light_wall", "Ordinary siding or wood sheathing", "ordinary_siding", "exterior_light_access", 1),
    reviewOption("exterior_light_wall", "Brick, stone, stucco, metal, or unsure", "specialty_or_unsure", 2),
    continueOption("exterior_light_access", "Yes — usable attic, basement, or crawlspace access", "accessible", "exterior_light_distance", 1),
    reviewOption("exterior_light_access", "No usable access, or I am not sure", "not_accessible_or_unsure", 2),
    continueOption("exterior_light_distance", "Less than about 25 feet", "under_25", "exterior_light_control", 1),
    continueOption("exterior_light_distance", "About 25 to 50 feet", "25_50", "exterior_light_control", 2),
    reviewOption("exterior_light_distance", "More than 50 feet, or I am not sure", "over_50_or_unsure", 3),
    reviewOption("exterior_light_control", "Use a suitable existing switched-lighting source", "existing_switched_source", 1),
    reviewOption("exterior_light_control", "Add a new switch/control, or I am not sure", "new_control_or_unsure", 2),
  ] });

  const exteriorBox = await db.canonicalMaterial.upsert({
    where: { key: "BOX_EXTERIOR_FIXTURE" },
    update: { name: "Exterior fixture box", unit: "each", notes: "Contractor-priced role; ordinary fixture-rated exterior box for the bounded one-light package." },
    create: { key: "BOX_EXTERIOR_FIXTURE", name: "Exterior fixture box", unit: "each", notes: "Contractor-priced role; ordinary fixture-rated exterior box for the bounded one-light package." },
  });
  const roles = await db.canonicalMaterial.findMany({ where: { key: { in: ["CONSUMABLES_SMALL"] } }, select: { id: true, key: true } });
  if (roles.length !== 1) throw new Error("Run seed-materials before the exterior-light seed.");
  await db.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  await db.serviceMaterial.createMany({ data: [
    { serviceId: service.id, canonicalMaterialId: exteriorBox.id, quantity: 1, order: 0 },
    { serviceId: service.id, canonicalMaterialId: roles[0].id, quantity: 1, order: 1 },
  ] });

  const dangling = await findDanglingReferences(db, service.id);
  const unreachable = await findUnreachableQuestions(db, service.id);
  if (dangling.length || unreachable.length) throw new Error(`Invalid exterior-light tree: ${dangling.length} dangling, ${unreachable.length} unreachable`);
  console.log("  ✓ narrowed one-location exterior-light review package defined");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedNewExteriorLightLocation(prisma)
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
