/**
 * A narrow, contractor-reviewed landscape-lighting package. The homeowner
 * supplies a compatible transformer and 4, 6 or 8 fixtures, identifies a
 * nearby existing outdoor GFCI receptacle, and gives only a rough distance.
 * Contractor review confirms the equipment/source/softscape layout and
 * measures the actual cable route before any price is calculated.
 */
import { PrismaClient } from "@prisma/client";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { findDanglingReferences, findUnreachableQuestions, upsertQuestion } from "./_moduleHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();
const SLUG = "outdoor-landscape-lighting";
const PHOTOS = [
  "The transformer label and all fixture labels or packaging",
  "The existing outdoor GFCI receptacle and proposed transformer location",
  "A wide view showing every proposed fixture location",
  "The soil or mulch route the low-voltage cable would follow",
];
const SHARED_ROLE_KEYS = ["CONSUMABLES_MEDIUM"] as const;
const REQUIRED_DYNAMIC_ROLES = ["LANDSCAPE_CABLE_12_2", "LANDSCAPE_WATERPROOF_CONNECTOR_PAIR"] as const;

async function clearTree(serviceId: string) {
  const questions = await prisma.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const question of questions) await prisma.answerOption.deleteMany({ where: { questionId: question.id } });
  await prisma.question.deleteMany({ where: { serviceId } });
}

async function main() {
  const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, SLUG) });
  if (!service) throw new Error(`Missing ${SLUG}`);
  await prisma.service.update({ where: { id: service.id }, data: {
    name: "Customer-Supplied Landscape Lighting",
    shortDescription: "Installation of a compatible customer-supplied transformer and 4, 6, or 8 low-voltage fixtures through ordinary soil or mulch, calculated after contractor review.",
    bookingType: "REMOTE_QUOTE", active: true, offered: true, isPrimaryEligible: true,
    photoState: "PREPARATION", startingPriceLabel: "Price after photo review",
    disclaimer: "The electrician confirms the customer-supplied transformer and fixtures are compatible, the existing outdoor GFCI receptacle is suitable, and the route is ordinary accessible soil or mulch before calculating a price. The homeowner's distance is only a rough guide. Hardscape, roots or rock, boring, new line-voltage power, transformer or fixture supply, advanced controls, routes over 100 feet, and return-night aiming require separate review.",
  } });
  await clearTree(service.id);

  const specs = [
    { key: "landscape_equipment", prompt: "Do you already have the transformer and all of the fixtures?", helpText: "The reviewed package is for a complete customer-supplied low-voltage set. The electrician will verify that the pieces work together." },
    { key: "landscape_source", prompt: "Is there an outdoor GFCI outlet near where the transformer would mount?", helpText: "Choose what you can see. The electrician will confirm the source from your photos." },
    { key: "landscape_fixture_count", prompt: "How many fixture locations do you want?", helpText: "Choose the closest exact package. Larger or custom layouts still receive a reviewed quote." },
    { key: "landscape_route", prompt: "What would the cable route pass through?", helpText: "The standard reviewed package covers ordinary accessible soil or mulch without crossing a walkway, patio, driveway, deck, rock, or heavy roots." },
    { key: "landscape_distance", prompt: "About how much cable might the layout need?", helpText: "A rough range is enough. The electrician measures the actual route before calculating the price." },
  ] as const;
  const questions = new Map<string, { id: string }>();
  for (const [index, spec] of specs.entries()) questions.set(spec.key, await upsertQuestion(prisma, service.id, { ...spec, order: index + 1 }));
  const q = (key: string) => questions.get(key)!.id;
  const next = (key: string, label: string, value: string, nextKey: string, order: number) => ({ questionId: q(key), label, value, routeAction: "CONTINUE" as const, nextQuestionId: q(nextKey), order, requiredPhotoLabels: [] as string[], approvedComponentPriceCents: 0 });
  const review = (key: string, label: string, value: string, order: number) => ({ questionId: q(key), label, value, routeAction: "PHOTO_REVIEW" as const, nextQuestionId: null, order, requiredPhotoLabels: PHOTOS, photosBlockBooking: true, approvedComponentPriceCents: null });
  await prisma.answerOption.createMany({ data: [
    next("landscape_equipment", "Yes — I have the transformer and all fixtures", "customer_supplied_complete", "landscape_source", 1),
    review("landscape_equipment", "No, not yet, or I am not sure", "incomplete_or_unsure", 2),
    next("landscape_source", "Yes — there is an outdoor GFCI outlet nearby", "existing_outdoor_gfci", "landscape_fixture_count", 1),
    review("landscape_source", "No, or I am not sure", "missing_or_unsure", 2),
    next("landscape_fixture_count", "4 fixtures", "four", "landscape_route", 1),
    next("landscape_fixture_count", "6 fixtures", "six", "landscape_route", 2),
    next("landscape_fixture_count", "8 fixtures", "eight", "landscape_route", 3),
    review("landscape_fixture_count", "Another number or a custom layout", "custom", 4),
    next("landscape_route", "Ordinary soil or mulch only", "ordinary_softscape", "landscape_distance", 1),
    review("landscape_route", "Rock, roots, hardscape, boring, decking, or I am not sure", "nonstandard_or_unsure", 2),
    review("landscape_distance", "About 50 feet or less", "under_50", 1),
    review("landscape_distance", "About 51 to 100 feet", "50_to_100", 2),
    review("landscape_distance", "More than 100 feet, or I am not sure", "over_100_or_unsure", 3),
  ] });

  const roleKeys = [...REQUIRED_DYNAMIC_ROLES, ...SHARED_ROLE_KEYS];
  const roles = await prisma.canonicalMaterial.findMany({ where: { key: { in: roleKeys } }, select: { id: true, key: true } });
  if (roles.length !== roleKeys.length) throw new Error("Run the Phase F material-role seed before the landscape-lighting seed.");
  const roleByKey = new Map(roles.map((role) => [role.key, role.id]));
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  await prisma.serviceMaterial.createMany({ data: SHARED_ROLE_KEYS.map((key, order) => ({ serviceId: service.id, canonicalMaterialId: roleByKey.get(key)!, quantity: 1, order })) });
  await recomputeServiceMaterialCost(prisma as never, service.id);

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  if (dangling.length || unreachable.length) throw new Error(`${dangling.length} dangling and ${unreachable.length} unreachable landscape-lighting questions`);
  console.log("  ✓ reviewed 4/6/8-fixture customer-supplied landscape-lighting packages defined");
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
