/**
 * Defines the bounded electric-fireplace package. The homeowner reads the
 * observable 15A/20A requirement and chooses an approximate accessible-route
 * band; ordinary paths price immediately and request confirmation photos.
 */
import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();
const SLUG = "electric-fireplace-circuit";
const PHOTOS = [
  "The fireplace model and electrical rating label, if safely visible",
  "The fireplace power cord and plug",
  "The ordinary drywall location where the new outlet should go",
  "The electrical panel with the door open and breakers visible — leave the panel cover on",
  "The accessible attic, basement, crawlspace, or drop-ceiling route",
];

async function clearTree(serviceId: string) {
  const questions = await prisma.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const question of questions) await prisma.answerOption.deleteMany({ where: { questionId: question.id } });
  await prisma.question.deleteMany({ where: { serviceId } });
}

async function main() {
  const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, SLUG) });
  if (!service) throw new Error(`Missing ${SLUG}`);
  await prisma.service.update({
    where: { id: service.id },
    data: {
      name: "Electric Fireplace Circuit & Outlet",
      shortDescription: "A dedicated 15A or 20A outlet for a standard plug-in 120V electric fireplace.",
      bookingType: "ADJUSTED",
      active: true,
      offered: true,
      isPrimaryEligible: true,
      photoState: "PREPARATION",
      startingPriceLabel: null,
    },
  });
  await clearTree(service.id);

  const specs = [
    { key: "fireplace_connection", prompt: "How does the electric fireplace receive power?", helpText: "A standard plug-in fireplace is different from a hardwired or 240V unit." },
    { key: "fireplace_amperage", prompt: "What circuit does the fireplace label or instructions require?", helpText: "Look for 15A or 20A on the equipment label or installation instructions. If it is not clear, choose I’m not sure." },
    { key: "fireplace_wall", prompt: "What surface will the new outlet be installed in?", helpText: "The standard package covers an ordinary drywall wall, not stone, brick, tile, or a specialty fireplace surround." },
    { key: "fireplace_route_access", prompt: "Can the cable path be reached through an attic, basement, crawlspace, or removable drop ceiling?", helpText: "You only need to tell us whether usable access exists. The electrician will confirm the actual route." },
    { key: "fireplace_distance", prompt: "Roughly how far might the cable travel from the panel to the new outlet?", helpText: "Choose the closest range. We calculate using the top of that range, so you do not need an exact measurement." },
  ] as const;
  const questions = new Map<string, { id: string }>();
  for (const [index, spec] of specs.entries()) questions.set(spec.key, await upsertQuestion(prisma, service.id, { ...spec, order: index + 1 }));
  const q = (key: string) => questions.get(key)!.id;
  const cont = (key: string, label: string, value: string, nextKey: string, order: number) => ({
    questionId: q(key), label, value, routeAction: "CONTINUE" as const, nextQuestionId: q(nextKey), order,
    requiredPhotoLabels: [] as string[], approvedComponentPriceCents: 0,
  });
  const review = (key: string, label: string, value: string, order: number) => ({
    questionId: q(key), label, value, routeAction: "PHOTO_REVIEW" as const, nextQuestionId: null, order,
    requiredPhotoLabels: PHOTOS, photosBlockBooking: true, approvedComponentPriceCents: null,
  });
  await prisma.answerOption.createMany({ data: [
    cont("fireplace_connection", "It plugs into a normal 120V household outlet", "standard_plug", "fireplace_amperage", 1),
    review("fireplace_connection", "It is hardwired, uses a different plug, or I am not sure", "nonstandard_or_unsure", 2),
    cont("fireplace_amperage", "15 amp", "15a", "fireplace_wall", 1),
    cont("fireplace_amperage", "20 amp", "20a", "fireplace_wall", 2),
    review("fireplace_amperage", "I'm not sure", "unsure", 3),
    cont("fireplace_wall", "Ordinary drywall", "ordinary_drywall", "fireplace_route_access", 1),
    review("fireplace_wall", "Stone, brick, tile, a specialty surround, or I am not sure", "specialty_or_unsure", 2),
    cont("fireplace_route_access", "Yes — unfinished basement", "unfinished_basement", "fireplace_distance", 1),
    cont("fireplace_route_access", "Yes — basement with a removable drop ceiling", "drop_ceiling", "fireplace_distance", 2),
    cont("fireplace_route_access", "Yes — accessible attic or crawlspace", "accessible_attic", "fireplace_distance", 3),
    cont("fireplace_route_access", "Yes — a combination of these", "combination", "fireplace_distance", 4),
    review("fireplace_route_access", "No usable access, or I am not sure", "not_accessible_or_unsure", 5),
    { ...review("fireplace_distance", "25 feet or less", "under_25", 1), photosBlockBooking: false },
    { ...review("fireplace_distance", "About 26 to 50 feet", "25_to_50", 2), photosBlockBooking: false },
    review("fireplace_distance", "More than 50 feet, or I am not sure", "over_50_or_unsure", 3),
  ] });

  const roleKeys = ["BOX_OLD_WORK", "WALL_PLATE", "CONSUMABLES_MEDIUM"];
  const roles = await prisma.canonicalMaterial.findMany({ where: { key: { in: roleKeys } }, select: { id: true, key: true } });
  if (roles.length !== roleKeys.length) throw new Error("Run seed-materials before the fireplace seed.");
  const roleByKey = new Map(roles.map((role) => [role.key, role.id]));
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  await prisma.serviceMaterial.createMany({ data: roleKeys.map((key, order) => ({ serviceId: service.id, canonicalMaterialId: roleByKey.get(key)!, quantity: 1, order })) });

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  if (dangling.length || unreachable.length) throw new Error(`Invalid fireplace tree: ${dangling.length} dangling, ${unreachable.length} unreachable`);
  console.log("  ✓ bounded plug-in 120V 15A/20A electric-fireplace pricing package defined");
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
