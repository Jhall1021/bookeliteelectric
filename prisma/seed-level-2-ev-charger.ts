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

async function clearTree(db: PrismaClient, serviceId: string) {
  const questions = await db.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const question of questions) await db.answerOption.deleteMany({ where: { questionId: question.id } });
  await db.question.deleteMany({ where: { serviceId } });
}

export async function migrateLevel2EvCharger(db: PrismaClient = prisma, contractorSlug = "elite-electric") {
  const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
  const service = await db.service.findFirstOrThrow({ where: { contractorId: contractor.id, slug: SLUG } });
  await db.service.update({ where: { id: service.id }, data: {
    name: "Hardwired Level 2 EV Charger Installation",
    shortDescription: "A customer-supplied hardwired Level 2 charger, with instant pricing for standard same-garage runs up to 50 feet.",
    bookingType: "ADJUSTED", pricingMethod: "DERIVED_RESOLVED_SCOPE",
    active: true, offered: true, isPrimaryEligible: true,
    photoState: "NONE", startingPriceLabel: "Price after questions",
    disclaimer: "Instant pricing covers a customer-supplied hardwired charger configured for 40A output on a 50A circuit, with the electrical panel in the same attached garage and an accessible cable path up to 50 feet. Plug-in chargers, outdoor or detached locations, finished or inaccessible routes, load management, service or panel work, specialty walls, and longer routes require review. App and network setup are not included.",
  } });
  await clearTree(db, service.id);

  const specs = [
    { key: "ev_charger_equipment", prompt: "What kind of charger are you installing?", helpText: "The reviewed package is for a wall-mounted charger you already have that is designed for a hardwired connection. The electrician will verify its instructions and rating." },
    { key: "ev_charger_location", prompt: "Where will the charger be mounted?", helpText: "The reviewed package covers an ordinary interior wall in an attached garage." },
    { key: "ev_charger_panel_location", prompt: "Is the electrical panel in this same garage?", helpText: "When the panel and charger are in the same attached garage, we can include a measured wiring allowance in your instant price." },
    { key: "ev_charger_route_access", prompt: "Can the cable path be reached through an attic, unfinished basement, crawlspace, or removable drop ceiling?", helpText: "An accessible route lets us calculate the cable, supports, and labor without opening finished walls." },
    { key: "ev_charger_distance", prompt: "Roughly how far will the cable travel from the panel to the charger?", helpText: "Follow the practical cable path. Your instant price includes the full allowance you select." },
  ] as const;
  const questions = new Map<string, { id: string }>();
  for (const [index, spec] of specs.entries()) questions.set(spec.key, await upsertQuestion(db, service.id, { ...spec, order: index + 1 }));
  const q = (key: string) => questions.get(key)!.id;
  const next = (key: string, label: string, value: string, nextKey: string, order: number) => ({
    questionId: q(key), label, value, routeAction: "CONTINUE" as const, nextQuestionId: q(nextKey), order,
    requiredPhotoLabels: [] as string[], approvedComponentPriceCents: 0,
  });
  const review = (key: string, label: string, value: string, order: number) => ({
    questionId: q(key), label, value, routeAction: "PHOTO_REVIEW" as const, nextQuestionId: null, order,
    requiredPhotoLabels: PHOTOS, photosBlockBooking: true, approvedComponentPriceCents: null,
  });
  const priced = (key: string, label: string, value: string, order: number) => ({
    questionId: q(key), label, value, routeAction: "RESOLVE_ADJUSTED" as const, nextQuestionId: null, order,
    requiredPhotoLabels: [] as string[], approvedComponentPriceCents: 0,
  });
  await db.answerOption.createMany({ data: [
    next("ev_charger_equipment", "I already have a wall-mounted charger designed to be hardwired", "customer_supplied_hardwired", "ev_charger_location", 1),
    review("ev_charger_equipment", "Plug-in charger, pedestal, charger not selected yet, or I am not sure", "other_or_unsure", 2),
    next("ev_charger_location", "Inside an attached garage on an ordinary wall", "attached_garage_interior", "ev_charger_panel_location", 1),
    review("ev_charger_location", "Outside, detached garage, specialty wall, pedestal, or I am not sure", "other_or_unsure", 2),
    next("ev_charger_panel_location", "Yes — the panel is in this garage", "same_garage", "ev_charger_route_access", 1),
    review("ev_charger_panel_location", "No — the panel is elsewhere", "elsewhere", 2),
    review("ev_charger_panel_location", "I'm not sure", "unsure", 3),
    next("ev_charger_route_access", "Yes — unfinished basement", "unfinished_basement", "ev_charger_distance", 1),
    next("ev_charger_route_access", "Yes — basement with a removable drop ceiling", "drop_ceiling", "ev_charger_distance", 2),
    next("ev_charger_route_access", "Yes — accessible attic or crawlspace", "accessible_attic", "ev_charger_distance", 3),
    next("ev_charger_route_access", "Yes — a combination of these", "combination", "ev_charger_distance", 4),
    review("ev_charger_route_access", "No usable access, or I am not sure", "not_accessible_or_unsure", 5),
    priced("ev_charger_distance", "25 feet or less", "under_25", 1),
    priced("ev_charger_distance", "About 26 to 50 feet", "25_to_50", 2),
    review("ev_charger_distance", "More than 50 feet, or I am not sure", "over_50_or_unsure", 3),
  ] });

  const roles = await db.canonicalMaterial.findMany({ where: { key: { in: [...SHARED_ROLE_KEYS] } }, select: { id: true, key: true } });
  if (roles.length !== SHARED_ROLE_KEYS.length) throw new Error("Run the base material seed before the EV charger package seed.");
  const roleByKey = new Map(roles.map((role) => [role.key, role.id]));
  await db.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  await db.serviceMaterial.createMany({ data: SHARED_ROLE_KEYS.map((key, order) => ({ serviceId: service.id, canonicalMaterialId: roleByKey.get(key)!, quantity: 1, order })) });
  await recomputeServiceMaterialCost(db as never, service.id);

  const dangling = await findDanglingReferences(db, service.id);
  const unreachable = await findUnreachableQuestions(db, service.id);
  if (dangling.length || unreachable.length) throw new Error(`${dangling.length} dangling and ${unreachable.length} unreachable EV charger questions`);
  return { serviceId: service.id };
}

if (process.argv[1]?.endsWith("seed-level-2-ev-charger.ts")) {
  const index = process.argv.indexOf("--contractor");
  const contractorSlug = index >= 0 ? process.argv[index + 1] : "elite-electric";
  if (!contractorSlug) throw new Error("--contractor requires a slug");
  migrateLevel2EvCharger(prisma, contractorSlug)
    .then(async (result) => { console.log(`Level 2 EV charger package ready for ${contractorSlug}: ${result.serviceId}`); await prisma.$disconnect(); })
    .catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
}
