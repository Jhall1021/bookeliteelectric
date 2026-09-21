/**
 * One deliberately narrow Level 2 EVSE package. The homeowner supplies a
 * wall-mounted hardwired charger and rough route context. A contractor may
 * calculate only after confirming a 40A-output / 50A-circuit configuration,
 * panel capacity, ordinary attached-garage mounting and the actual accessible
 * cable path. Plug-in, outdoor, detached, load-managed and panel-work scopes
 * remain manual review.
 */
import { PrismaClient } from "@prisma/client";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { findDanglingReferences, findUnreachableQuestions, upsertQuestion } from "./_moduleHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();
const SLUG = "level-2-ev-charger";
const PHOTOS = [
  "The charger model label and electrical ratings, if safely visible",
  "The charger's wiring compartment or installation-instructions label showing the hardwired connection",
  "The attached-garage wall where the charger will mount",
  "The electrical panel with the door open and breakers visible — leave the panel cover on",
  "The accessible attic, unfinished basement, crawlspace, or drop-ceiling route",
];
const SHARED_ROLE_KEYS = ["CONSUMABLES_MEDIUM"] as const;

async function clearTree(serviceId: string) {
  const questions = await prisma.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const question of questions) await prisma.answerOption.deleteMany({ where: { questionId: question.id } });
  await prisma.question.deleteMany({ where: { serviceId } });
}

async function main() {
  const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, SLUG) });
  if (!service) throw new Error(`Missing ${SLUG}`);
  await prisma.service.update({ where: { id: service.id }, data: {
    name: "Hardwired Level 2 EV Charger Installation",
    shortDescription: "Installation of a customer-supplied hardwired Level 2 charger in an attached garage, calculated after contractor review.",
    bookingType: "REMOTE_QUOTE", active: true, offered: true, isPrimaryEligible: true,
    photoState: "PREPARATION", startingPriceLabel: "Price after photo review",
    disclaimer: "The electrician confirms the charger instructions, a 40A-output/50A-circuit configuration, panel capacity, ordinary attached-garage mounting, and the actual accessible cable path before calculating a price. Plug-in chargers, outdoor or detached locations, finished or inaccessible routes, load management, service or panel work, specialty walls, and routes over 50 feet require separate review. App and network setup are not included.",
  } });
  await clearTree(service.id);

  const specs = [
    { key: "ev_charger_equipment", prompt: "What kind of charger are you installing?", helpText: "The reviewed package is for a wall-mounted charger you already have that is designed for a hardwired connection. The electrician will verify its instructions and rating." },
    { key: "ev_charger_location", prompt: "Where will the charger be mounted?", helpText: "The reviewed package covers an ordinary interior wall in an attached garage." },
    { key: "ev_charger_route_access", prompt: "Can the cable path be reached through an attic, unfinished basement, crawlspace, or removable drop ceiling?", helpText: "Choose the closest answer. The electrician will confirm and measure the actual route from the photos." },
    { key: "ev_charger_distance", prompt: "Roughly how far might the cable travel from the panel to the charger?", helpText: "A close range is enough. The electrician measures the actual cable path before calculating the price." },
  ] as const;
  const questions = new Map<string, { id: string }>();
  for (const [index, spec] of specs.entries()) questions.set(spec.key, await upsertQuestion(prisma, service.id, { ...spec, order: index + 1 }));
  const q = (key: string) => questions.get(key)!.id;
  const next = (key: string, label: string, value: string, nextKey: string, order: number) => ({
    questionId: q(key), label, value, routeAction: "CONTINUE" as const, nextQuestionId: q(nextKey), order,
    requiredPhotoLabels: [] as string[], approvedComponentPriceCents: 0,
  });
  const review = (key: string, label: string, value: string, order: number) => ({
    questionId: q(key), label, value, routeAction: "PHOTO_REVIEW" as const, nextQuestionId: null, order,
    requiredPhotoLabels: PHOTOS, photosBlockBooking: true, approvedComponentPriceCents: null,
  });
  await prisma.answerOption.createMany({ data: [
    next("ev_charger_equipment", "I already have a wall-mounted charger designed to be hardwired", "customer_supplied_hardwired", "ev_charger_location", 1),
    review("ev_charger_equipment", "Plug-in charger, pedestal, charger not selected yet, or I am not sure", "other_or_unsure", 2),
    next("ev_charger_location", "Inside an attached garage on an ordinary wall", "attached_garage_interior", "ev_charger_route_access", 1),
    review("ev_charger_location", "Outside, detached garage, specialty wall, pedestal, or I am not sure", "other_or_unsure", 2),
    next("ev_charger_route_access", "Yes — unfinished basement", "unfinished_basement", "ev_charger_distance", 1),
    next("ev_charger_route_access", "Yes — basement with a removable drop ceiling", "drop_ceiling", "ev_charger_distance", 2),
    next("ev_charger_route_access", "Yes — accessible attic or crawlspace", "accessible_attic", "ev_charger_distance", 3),
    next("ev_charger_route_access", "Yes — a combination of these", "combination", "ev_charger_distance", 4),
    review("ev_charger_route_access", "No usable access, or I am not sure", "not_accessible_or_unsure", 5),
    review("ev_charger_distance", "25 feet or less", "under_25", 1),
    review("ev_charger_distance", "About 26 to 50 feet", "25_to_50", 2),
    review("ev_charger_distance", "More than 50 feet, or I am not sure", "over_50_or_unsure", 3),
  ] });

  const roles = await prisma.canonicalMaterial.findMany({ where: { key: { in: [...SHARED_ROLE_KEYS] } }, select: { id: true, key: true } });
  if (roles.length !== SHARED_ROLE_KEYS.length) throw new Error("Run the base material seed before the EV charger package seed.");
  const roleByKey = new Map(roles.map((role) => [role.key, role.id]));
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  await prisma.serviceMaterial.createMany({ data: SHARED_ROLE_KEYS.map((key, order) => ({ serviceId: service.id, canonicalMaterialId: roleByKey.get(key)!, quantity: 1, order })) });
  await recomputeServiceMaterialCost(prisma as never, service.id);

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  if (dangling.length || unreachable.length) throw new Error(`${dangling.length} dangling and ${unreachable.length} unreachable EV charger questions`);
  console.log("  ✓ reviewed 40A-output / 50A-circuit hardwired EV charger package defined");
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
