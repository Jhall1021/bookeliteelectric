/**
 * One reviewed homeowner service with two exact four-wire outcomes:
 * 30A / NEMA 14-30 / 10-3 for a dryer, or 50A / NEMA 14-50 / 6-3 for a range.
 * The runtime review chooses one material set; it never averages the two.
 */
import { PrismaClient } from "@prisma/client";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { findDanglingReferences, findUnreachableQuestions, upsertQuestion } from "./_moduleHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();
const SLUG = "new-240v-appliance-circuit";
const PHOTOS = [
  "The appliance model and electrical rating label, if safely visible",
  "The appliance power cord and plug",
  "The wall area behind the appliance where the surface-mounted outlet box would go",
  "The electrical panel with the door open and breakers visible — leave the panel cover on",
  "The accessible attic, unfinished basement, crawlspace, or drop-ceiling route",
];
const DYNAMIC_ROLE_KEYS = [
  "RECEPTACLE_14_30", "BREAKER_DOUBLE_POLE_30A", "WIRE_10_3",
  "RECEPTACLE_14_50", "BREAKER_DOUBLE_POLE_50A", "WIRE_6_3",
] as const;
const SHARED_ROLE_KEYS = ["BOX_SURFACE_4S", "COVER_RAISED_4S", "CONSUMABLES_MEDIUM"] as const;

async function clearTree(serviceId: string) {
  const questions = await prisma.question.findMany({ where: { serviceId }, select: { id: true } });
  for (const question of questions) await prisma.answerOption.deleteMany({ where: { questionId: question.id } });
  await prisma.question.deleteMany({ where: { serviceId } });
}

async function main() {
  const service = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, SLUG) });
  if (!service) throw new Error(`Missing ${SLUG}`);
  await prisma.service.update({ where: { id: service.id }, data: {
    name: "New Dryer or Range Circuit & Outlet",
    shortDescription: "A new four-wire circuit and surface-mounted outlet for a standard plug-in electric dryer or range, calculated after contractor review.",
    bookingType: "REMOTE_QUOTE", active: true, offered: true, isPrimaryEligible: true,
    photoState: "PREPARATION", startingPriceLabel: "Price after photo review",
    disclaimer: "The electrician confirms the appliance instructions, plug, panel capacity, actual accessible cable path, and surface-box location before calculating a price. Three-prong legacy outlets, hardwired appliances, finished or inaccessible routes, flush-wall boxes, panel work, and routes over 50 feet require separate review.",
  } });
  await clearTree(service.id);

  const specs = [
    { key: "appliance_240v_type", prompt: "What will this new circuit power?", helpText: "Dryers and ranges use different breakers, cable, and receptacles." },
    { key: "appliance_240v_connection", prompt: "How does the appliance connect?", helpText: "The standard package is for a modern four-prong plug. Hardwired and legacy three-prong equipment need separate review." },
    { key: "appliance_240v_endpoint", prompt: "Would a surface-mounted metal outlet box be acceptable behind the appliance?", helpText: "This standard package uses a visible metal box behind the appliance. A flush outlet inside a finished wall needs separate review." },
    { key: "appliance_240v_route_access", prompt: "Can the cable path be reached through an attic, unfinished basement, crawlspace, or removable drop ceiling?", helpText: "Choose the closest answer. The electrician will confirm the actual route from the photos." },
    { key: "appliance_240v_distance", prompt: "Roughly how far might the cable travel from the panel to the new outlet?", helpText: "A close range is enough. The electrician measures the actual cable path before calculating the price." },
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
    next("appliance_240v_type", "Electric clothes dryer", "dryer", "appliance_240v_connection", 1),
    next("appliance_240v_type", "Electric range or freestanding stove", "range", "appliance_240v_connection", 2),
    review("appliance_240v_type", "Wall oven, cooktop, combination appliance, or I am not sure", "other_or_unsure", 3),
    next("appliance_240v_connection", "A modern four-prong plug", "four_prong_plug", "appliance_240v_endpoint", 1),
    review("appliance_240v_connection", "Three-prong, hardwired, no cord yet, or I am not sure", "nonstandard_or_unsure", 2),
    next("appliance_240v_endpoint", "Yes — a surface-mounted box behind the appliance is acceptable", "surface_box", "appliance_240v_route_access", 1),
    review("appliance_240v_endpoint", "No — it must be flush in the wall, or I am not sure", "flush_or_unsure", 2),
    next("appliance_240v_route_access", "Yes — unfinished basement", "unfinished_basement", "appliance_240v_distance", 1),
    next("appliance_240v_route_access", "Yes — basement with a removable drop ceiling", "drop_ceiling", "appliance_240v_distance", 2),
    next("appliance_240v_route_access", "Yes — accessible attic or crawlspace", "accessible_attic", "appliance_240v_distance", 3),
    next("appliance_240v_route_access", "Yes — a combination of these", "combination", "appliance_240v_distance", 4),
    review("appliance_240v_route_access", "No usable access, or I am not sure", "not_accessible_or_unsure", 5),
    review("appliance_240v_distance", "25 feet or less", "under_25", 1),
    review("appliance_240v_distance", "About 26 to 50 feet", "25_to_50", 2),
    review("appliance_240v_distance", "More than 50 feet, or I am not sure", "over_50_or_unsure", 3),
  ] });

  const roleKeys = [...DYNAMIC_ROLE_KEYS, ...SHARED_ROLE_KEYS];
  const roles = await prisma.canonicalMaterial.findMany({ where: { key: { in: roleKeys } }, select: { id: true, key: true } });
  if (roles.length !== roleKeys.length) throw new Error("Run the Phase F material-role seeds before the 240V appliance package seed.");
  const roleByKey = new Map(roles.map((role) => [role.key, role.id]));
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: service.id } });
  // Only materials common to both outcomes belong to the service-level cache.
  // The review endpoint adds exactly one breaker, cable and receptacle set;
  // storing both alternatives here would falsely charge for both.
  await prisma.serviceMaterial.createMany({ data: SHARED_ROLE_KEYS.map((key, order) => ({ serviceId: service.id, canonicalMaterialId: roleByKey.get(key)!, quantity: 1, order })) });
  await recomputeServiceMaterialCost(prisma as never, service.id);

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  if (dangling.length || unreachable.length) throw new Error(`${dangling.length} dangling and ${unreachable.length} unreachable questions`);
  console.log("  ✓ reviewed four-wire dryer and range circuit outcomes defined");
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
